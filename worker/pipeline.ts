/**
 * Main content generation pipeline.
 * Orchestrates the full flow from keyword selection to published post.
 */

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import {
  generateOutline,
  generateContent,
  type SiteConfig,
  type PostOutline,
  type GeneratedContent,
} from "../src/lib/ai/content-generator";
import { analyzeCompetition, type CompetitionAnalysis } from "../src/lib/ai/competition-analyzer";
import { generatePostImages } from "../src/lib/ai/image-generator";
import { calculateSeoScore, type ScorerInput } from "../src/lib/ai/seo-scorer";
import { generateArticleSchema } from "../src/lib/seo/schema-markup";
import {
  calculateKeywordDensity,
  calculateKeywordFrequency,
  calculateReadingTime,
  calculateReadabilityScore,
} from "../src/lib/seo/metrics";
import { checkCannibalization } from "./utils/similarity-checker";
import { addRetroactiveLinks, addConversionLink } from "../src/lib/seo/auto-linker";
import { categorizePost } from "../src/lib/ai/auto-categorizer";
import { publishToWordPress, uploadMediaToWordPress, type WpSiteConfig } from "./connectors/wordpress";
import { publishToNuxtBlog, uploadImageToNuxtBlog, type NuxtBlogSiteConfig } from "./connectors/nuxt-blog";

const prisma = new PrismaClient();

// ── Types ────────────────────────────────────────────────────

interface PipelineResult {
  postId: string;
  seoScore: number;
  wordCount: number;
  attempts: number;
}

// ── Main Pipeline ────────────────────────────────────────────

/**
 * Run the full content generation pipeline for a site.
 *
 * Steps:
 * 1. Select keyword (verify no cannibalization)
 * 2. Generate outline
 * 3. Generate content
 * 4. Generate images → upload to Supabase Storage
 * 5. Generate SEO metadata (meta title, description, slug, tags, schema)
 * 6. Add links (internal, external, conversion)
 * 7. Calculate SEO score
 * 8. If score < 70, regenerate (max 3 attempts)
 * 9. Save post to DB
 * 10. Return post ID
 */
export async function runPipeline(
  siteId: string,
  keywordId?: string,
): Promise<PipelineResult> {
  const site = await prisma.site.findUniqueOrThrow({
    where: { id: siteId },
    include: {
      posts: {
        where: { status: { in: ["published", "draft", "review"] } },
        select: { keyword: true, slug: true, title: true, id: true },
      },
      keywords: {
        where: { status: "pending" },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  const siteConfig: SiteConfig = {
    minWords: site.minWords,
    maxWords: site.maxWords,
    conversionUrl: site.conversionUrl,
    authoritativeSources: site.authoritativeSources,
    domain: site.domain,
  };

  // Step 1: Select keyword
  await logStep(siteId, null, "keyword_selection", "started");

  const keyword = await selectKeyword(site, keywordId);

  await logStep(siteId, null, "keyword_selection", "success", {
    keyword: keyword.phrase,
  });

  // Step 1.5: Competition analysis (runs once before the retry loop)
  let competitionAnalysis: CompetitionAnalysis | null = null;
  try {
    await logStep(siteId, null, "competition_analysis", "started");
    competitionAnalysis = await analyzeCompetition(keyword.phrase);
    await logStep(siteId, null, "competition_analysis", "success", {
      avgWordCount: competitionAnalysis.avgWordCount,
      gaps: competitionAnalysis.contentGaps.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logStep(siteId, null, "competition_analysis", "failed", {
      error: message,
    });
    // Non-fatal: proceed without competition data
  }

  let bestResult: {
    h1: string;
    html: string;
    markdown: string;
    wordCount: number;
    faqItems: { question: string; answer: string }[];
    images: UploadedImage[];
    links: PostLink[];
    metaTitle: string;
    metaDescription: string;
    slug: string;
    tags: string[];
    schema: Record<string, unknown>;
    seoScore: number;
  } | null = null;

  const MAX_ATTEMPTS = 3;
  let attempts = 0;
  // Track best short content as fallback when all attempts fail word count
  let bestShortContent: { outline: PostOutline; content: GeneratedContent } | null = null;

  for (attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
    try {
      // Step 2: Generate outline (enhanced with competition insights)
      await logStep(siteId, null, "outline_generation", "started", {
        attempt: attempts,
      });
      const outline = await generateOutline(keyword.phrase, siteConfig, competitionAnalysis ?? undefined);
      await logStep(siteId, null, "outline_generation", "success");

      // Step 3: Generate content
      await logStep(siteId, null, "content_generation", "started");
      const content = await generateContent(outline, keyword.phrase, siteConfig);

      // Enforce minimum word count — reject and retry if too short
      if (content.wordCount < siteConfig.minWords) {
        await logStep(siteId, null, "content_generation", "failed", {
          wordCount: content.wordCount,
          minWords: siteConfig.minWords,
          reason: `Content too short: ${content.wordCount} < ${siteConfig.minWords}`,
        });

        // Keep track of the best short content as fallback for last attempt
        if (!bestShortContent || content.wordCount > bestShortContent.content.wordCount) {
          bestShortContent = { outline, content };
        }

        if (attempts < MAX_ATTEMPTS) {
          await logStep(siteId, null, "regeneration", "started", {
            reason: `Word count ${content.wordCount} < ${siteConfig.minWords}`,
            attempt: attempts + 1,
          });
        }
        continue;
      }

      await logStep(siteId, null, "content_generation", "success", {
        wordCount: content.wordCount,
      });

      // Step 4: Generate images & upload to Supabase
      // Extract section contexts for contextual image generation:
      // - Hero: uses H1 (title context)
      // - Content images: use H2 of the section where they'll be inserted
      //   (before FAQ or before last H2 = typically the middle sections)
      await logStep(siteId, null, "image_generation", "started");
      const nonFaqSections = outline.sections.filter(
        (s) => !/faq|preguntas frecuentes|conclusion/i.test(s.text),
      );
      // Hero: use first H2 (more concrete than H1 for DALL-E)
      // Content: use a mid-article H2 for contextual relevance
      const heroContext = nonFaqSections[0]?.text ?? outline.h1;
      const midSectionIdx = Math.floor(nonFaqSections.length * 0.6);
      const sectionContexts = nonFaqSections
        .slice(midSectionIdx, midSectionIdx + 2)
        .map((s) => s.text);
      const images = await generateAndUploadImages(
        heroContext,
        keyword.phrase,
        siteId,
        sectionContexts,
      );
      await logStep(siteId, null, "image_generation", "success", {
        count: images.length,
      });

      // Step 5: Generate SEO metadata
      const slug = generateSlug(keyword.phrase);
      const metaTitle = outline.metaTitle
        ? outline.metaTitle.slice(0, 60)
        : truncate(`${keyword.phrase} | ${site.name}`, 60);
      const metaDescription = content.metaDescription
        ? content.metaDescription.slice(0, 160)
        : truncate(
            generateMetaDescription(content.html, keyword.phrase),
            160,
          );
      const tags = extractTags(outline, keyword.phrase);

      const schema = generateArticleSchema(
        {
          title: outline.h1,
          slug,
          metaDescription,
          keyword: keyword.phrase,
          contentHtml: content.html,
          images: images.map((img) => ({
            url: img.url,
            altText: img.altText,
            width: img.width,
            height: img.height,
          })),
          wordCount: content.wordCount,
          readingTimeMinutes: calculateReadingTime(content.wordCount),
          hasFaq: content.faqItems.length > 0,
          faqItems: content.faqItems,
        },
        { domain: site.domain, name: site.name },
      );

      // Step 6: Add links
      const links = buildLinks(
        site.posts,
        siteConfig,
        keyword.phrase,
      );

      // Insert links and images into HTML
      // Note: schema JSON-LD is NOT injected here — WordPress sanitizes <script> tags
      // from post content. Schema is stored in DB and can be injected via theme/plugin.
      let enrichedHtml = insertImagesIntoHtml(content.html, images);
      enrichedHtml = insertLinksIntoHtml(enrichedHtml, links);

      // Step 7: Calculate SEO score
      const scorerInput: ScorerInput = {
        contentHtml: enrichedHtml,
        keyword: keyword.phrase,
        metaTitle,
        metaDescription,
        slug,
        images: images.map((img) => ({ altText: img.altText })),
        links: links.map((l) => ({ type: l.type })),
        schemaJsonLd: schema,
        existingPostCount: site.posts.length,
      };

      const scoreResult = calculateSeoScore(scorerInput);

      await logStep(siteId, null, "seo_scoring", "success", {
        score: scoreResult.totalScore,
        attempt: attempts,
      });

      bestResult = {
        h1: outline.h1,
        html: enrichedHtml,
        markdown: content.markdown,
        wordCount: content.wordCount,
        faqItems: content.faqItems,
        images,
        links,
        metaTitle,
        metaDescription,
        slug,
        tags,
        schema,
        seoScore: scoreResult.totalScore,
      };

      // Step 8: Check if score meets threshold
      if (scoreResult.totalScore >= 70) {
        break;
      }

      if (attempts < MAX_ATTEMPTS) {
        await logStep(siteId, null, "regeneration", "started", {
          reason: `SEO score ${scoreResult.totalScore} < 70`,
          attempt: attempts + 1,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      await logStep(siteId, null, "pipeline_error", "failed", {
        error: message,
        attempt: attempts,
      });

      if (attempts >= MAX_ATTEMPTS) {
        throw new Error(
          `Pipeline failed after ${MAX_ATTEMPTS} attempts: ${message}`,
        );
      }
    }
  }

  // If no attempt met the word count threshold, use the best short content as fallback
  if (!bestResult && bestShortContent) {
    await logStep(siteId, null, "word_count_fallback", "started", {
      wordCount: bestShortContent.content.wordCount,
      minWords: siteConfig.minWords,
    });

    const { outline, content } = bestShortContent;
    const fallbackSections = outline.sections
      .filter((s) => !/faq|preguntas frecuentes/i.test(s.text))
      .slice(Math.floor(outline.sections.length * 0.6))
      .map((s) => s.text);
    const images = await generateAndUploadImages(outline.h1, keyword.phrase, siteId, fallbackSections);
    const slug = generateSlug(keyword.phrase);
    const metaTitle = outline.metaTitle
      ? outline.metaTitle.slice(0, 60)
      : truncate(`${keyword.phrase} | ${site.name}`, 60);
    const metaDescription = content.metaDescription
      ? content.metaDescription.slice(0, 160)
      : truncate(generateMetaDescription(content.html, keyword.phrase), 160);
    const tags = extractTags(outline, keyword.phrase);
    const schema = generateArticleSchema(
      {
        title: outline.h1, slug, metaDescription, keyword: keyword.phrase,
        contentHtml: content.html,
        images: images.map((img) => ({ url: img.url, altText: img.altText, width: img.width, height: img.height })),
        wordCount: content.wordCount, readingTimeMinutes: calculateReadingTime(content.wordCount),
        hasFaq: content.faqItems.length > 0, faqItems: content.faqItems,
      },
      { domain: site.domain, name: site.name },
    );
    const links = buildLinks(site.posts, siteConfig, keyword.phrase);
    let enrichedHtml = insertImagesIntoHtml(content.html, images);
    enrichedHtml = insertLinksIntoHtml(enrichedHtml, links);
    const scorerInput: ScorerInput = {
      contentHtml: enrichedHtml, keyword: keyword.phrase, metaTitle, metaDescription, slug,
      images: images.map((img) => ({ altText: img.altText })),
      links: links.map((l) => ({ type: l.type })),
      schemaJsonLd: schema, existingPostCount: site.posts.length,
    };
    const scoreResult = calculateSeoScore(scorerInput);

    bestResult = {
      h1: outline.h1, html: enrichedHtml, markdown: content.markdown,
      wordCount: content.wordCount, faqItems: content.faqItems,
      images, links, metaTitle, metaDescription, slug, tags, schema,
      seoScore: scoreResult.totalScore,
    };
    attempts = MAX_ATTEMPTS;
  }

  if (!bestResult) {
    throw new Error("Pipeline produced no result");
  }

  // Step 9: Save post to DB
  await logStep(siteId, null, "post_save", "started");

  const density = calculateKeywordDensity(bestResult.html, keyword.phrase);
  const frequency = calculateKeywordFrequency(bestResult.html, keyword.phrase);
  const readability = calculateReadabilityScore(bestResult.html);
  const readingTime = calculateReadingTime(bestResult.wordCount);

  const post = await prisma.post.create({
    data: {
      siteId,
      title: bestResult.h1,
      slug: bestResult.slug,
      contentHtml: bestResult.html,
      contentMarkdown: bestResult.markdown,
      metaTitle: bestResult.metaTitle,
      metaDescription: bestResult.metaDescription,
      keyword: keyword.phrase,
      keywordDensity: density,
      keywordFrequency: frequency,
      keywordDistribution: {
        firstHundredWords: true,
        inH2s: true,
        inBody: true,
        inConclusion: true,
      },
      readabilityScore: readability,
      seoScore: bestResult.seoScore,
      wordCount: bestResult.wordCount,
      charCount: bestResult.html.replace(/<[^>]+>/g, "").length,
      readingTimeMinutes: readingTime,
      status: "review",
      images: {
        create: bestResult.images.map((img, idx) => ({
          url: img.url,
          altText: img.altText,
          position: idx,
          width: img.width,
          height: img.height,
          fileSize: img.fileSize,
        })),
      },
      links: {
        create: bestResult.links.map((link) => ({
          url: link.url,
          anchorText: link.anchorText,
          type: link.type,
        })),
      },
    },
  });

  // Mark keyword as used
  await prisma.keyword.update({
    where: { id: keyword.id },
    data: { status: "used" },
  });

  await logStep(siteId, post.id, "post_save", "success", {
    postId: post.id,
    seoScore: bestResult.seoScore,
  });

  // Step 10: Auto-categorize post
  try {
    await logStep(siteId, post.id, "auto_categorization", "started");

    const existingCategories = await prisma.category.findMany({
      where: { siteId },
      select: { id: true, slug: true, name: true },
    });

    const categorization = await categorizePost(
      post.title,
      keyword.phrase,
      existingCategories.map((c: { slug: string; name: string }) => ({ slug: c.slug, name: c.name })),
    );

    let categoryId: string;

    if (categorization.isNew) {
      const newCategory = await prisma.category.create({
        data: {
          siteId,
          name: categorization.categoryName,
          slug: categorization.categorySlug,
        },
      });
      categoryId = newCategory.id;
    } else {
      const existing = existingCategories.find(
        (c: { id: string; slug: string }) => c.slug === categorization.categorySlug,
      );
      categoryId = existing?.id ?? existingCategories[0]?.id ?? "";
    }

    if (categoryId) {
      await prisma.post.update({
        where: { id: post.id },
        data: { categoryId },
      });
    }

    await logStep(siteId, post.id, "auto_categorization", "success", {
      category: categorization.categoryName,
      isNew: categorization.isNew,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logStep(siteId, post.id, "auto_categorization", "failed", {
      error: message,
    });
    // Non-fatal: post was already saved
  }

  // Step 11: Auto-link — add retroactive links in existing posts pointing to new post
  try {
    await logStep(siteId, post.id, "auto_linking", "started");

    const linkResult = await addRetroactiveLinks(
      {
        id: post.id,
        title: post.title,
        slug: bestResult.slug,
        keyword: keyword.phrase,
      },
      siteId,
    );

    // Add conversion link to this post if site has a conversion URL
    if (site.conversionUrl) {
      const updatedHtml = addConversionLink(
        post.contentHtml,
        site.conversionUrl,
        keyword.phrase,
      );

      if (updatedHtml !== post.contentHtml) {
        await prisma.post.update({
          where: { id: post.id },
          data: { contentHtml: updatedHtml },
        });
      }
    }

    await logStep(siteId, post.id, "auto_linking", "success", {
      retroactiveLinks: linkResult.linksInserted,
      updatedPosts: linkResult.updatedPostIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logStep(siteId, post.id, "auto_linking", "failed", {
      error: message,
    });
    // Non-fatal: post was already saved
  }

  // Step 12: Publish to WordPress (if site has WP credentials)
  if (site.platform === "wordpress" && site.apiUrl && site.apiUser && site.apiPassword) {
    try {
      await logStep(siteId, post.id, "wordpress_publish", "started");

      const wpConfig: WpSiteConfig = {
        apiUrl: site.apiUrl,
        apiUser: site.apiUser,
        apiPassword: site.apiPassword,
        domain: site.domain,
      };

      // Upload hero image as featured media (fatal — no publish without image)
      let featuredMediaId: number | undefined;
      if (bestResult.images.length > 0) {
        featuredMediaId = await uploadMediaToWordPress(
          bestResult.images[0].url,
          bestResult.images[0].altText,
          wpConfig,
        );
      }

      const externalId = await publishToWordPress(
        {
          title: post.title,
          slug: bestResult.slug,
          contentHtml: post.contentHtml,
          metaTitle: bestResult.metaTitle,
          metaDescription: bestResult.metaDescription,
          status: "publish",
          featuredMediaId,
        },
        wpConfig,
      );

      await prisma.post.update({
        where: { id: post.id },
        data: {
          externalPostId: externalId,
          status: "published",
          publishedAt: new Date(),
        },
      });

      await logStep(siteId, post.id, "wordpress_publish", "success", {
        externalPostId: externalId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logStep(siteId, post.id, "wordpress_publish", "failed", {
        error: message,
      });
      // Non-fatal: post remains in DB with status "review"
    }
  }

  // Step 12b: Publish to Nuxt Blog (if site has nuxt-blog credentials)
  if (site.platform === "nuxt-blog" && site.apiUrl && site.apiPassword) {
    try {
      await logStep(siteId, post.id, "nuxt_publish", "started");

      const nuxtConfig: NuxtBlogSiteConfig = {
        apiUrl: site.apiUrl,
        apiKey: site.apiPassword,
        domain: site.domain,
      };

      // Upload ALL images to Firebase via Nuxt blog's upload-image endpoint
      const imageUrlMap = new Map<string, string>(); // supabaseUrl → firebaseUrl

      for (let i = 0; i < bestResult.images.length; i++) {
        const img = bestResult.images[i];
        const type = i === 0 ? "featured" : "content";
        const firebaseUrl = await uploadImageToNuxtBlog(
          img.url,
          type as "featured" | "content",
          img.altText,
          nuxtConfig,
        );
        imageUrlMap.set(img.url, firebaseUrl);
      }

      // Replace Supabase URLs with Firebase URLs in a copy of the HTML
      let publishHtml = post.contentHtml;
      for (const [supabaseUrl, firebaseUrl] of imageUrlMap) {
        publishHtml = publishHtml.replaceAll(supabaseUrl, firebaseUrl);
      }

      // Strip H1 from content — nuxt-blog template renders its own H1 from the title
      publishHtml = publishHtml.replace(/<h1[^>]*>[\s\S]*?<\/h1>/i, "");

      // Get featured image Firebase URL (first image)
      const featuredFirebaseUrl = bestResult.images.length > 0
        ? imageUrlMap.get(bestResult.images[0].url)
        : undefined;

      const slug = await publishToNuxtBlog(
        {
          title: post.title,
          slug: bestResult.slug,
          contentHtml: publishHtml,
          metaDescription: bestResult.metaDescription,
          featuredImageUrl: featuredFirebaseUrl,
          featuredImageAlt: bestResult.images[0]?.altText,
          faqItems: bestResult.faqItems.length > 0 ? bestResult.faqItems : undefined,
        },
        nuxtConfig,
      );

      await prisma.post.update({
        where: { id: post.id },
        data: {
          externalPostId: slug,
          status: "published",
          publishedAt: new Date(),
        },
      });

      await logStep(siteId, post.id, "nuxt_publish", "success", {
        externalPostId: slug,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logStep(siteId, post.id, "nuxt_publish", "failed", {
        error: message,
      });
      // Non-fatal: post remains in DB with status "review"
    }
  }

  return {
    postId: post.id,
    seoScore: bestResult.seoScore,
    wordCount: bestResult.wordCount,
    attempts,
  };
}

// ── Internal Helpers ─────────────────────────────────────────

interface SelectedKeyword {
  id: string;
  phrase: string;
}

async function selectKeyword(
  site: {
    id: string;
    posts: { keyword: string }[];
    keywords: { id: string; phrase: string; status: string }[];
  },
  keywordId?: string,
): Promise<SelectedKeyword> {
  const existingKeywords = site.posts.map((p) => p.keyword);

  if (keywordId) {
    const kw = site.keywords.find((k) => k.id === keywordId);
    if (!kw) throw new Error(`Keyword ${keywordId} not found or not pending`);

    const cannibalization = checkCannibalization(kw.phrase, existingKeywords);
    if (cannibalization.length > 0) {
      await prisma.keyword.update({
        where: { id: kw.id },
        data: {
          status: "skipped",
          skipReason: `Cannibalization with: ${cannibalization.map((c) => c.keyword).join(", ")}`,
        },
      });
      throw new Error(
        `Keyword "${kw.phrase}" cannibalizes existing: ${cannibalization.map((c) => `${c.keyword} (${(c.similarity * 100).toFixed(0)}%)`).join(", ")}`,
      );
    }

    return { id: kw.id, phrase: kw.phrase };
  }

  // Auto-select: find first non-cannibalizing pending keyword
  for (const kw of site.keywords) {
    const cannibalization = checkCannibalization(kw.phrase, existingKeywords);
    if (cannibalization.length === 0) {
      return { id: kw.id, phrase: kw.phrase };
    }

    // Skip cannibalizing keywords
    await prisma.keyword.update({
      where: { id: kw.id },
      data: {
        status: "skipped",
        skipReason: `Cannibalization with: ${cannibalization.map((c) => c.keyword).join(", ")}`,
      },
    });
  }

  throw new Error(`No valid pending keywords found for site ${site.id}`);
}

interface UploadedImage {
  url: string;
  altText: string;
  width: number;
  height: number;
  fileSize: number;
}

async function generateAndUploadImages(
  title: string,
  keyword: string,
  siteId: string,
  sectionContexts?: string[],
): Promise<UploadedImage[]> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase credentials not configured");
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const rawImages = await generatePostImages(title, keyword, 2, sectionContexts);
  const uploaded: UploadedImage[] = [];

  for (let i = 0; i < rawImages.length; i++) {
    const img = rawImages[i];
    const timestamp = Date.now();
    const filename = `${siteId}/${timestamp}-${i}.webp`;

    const { error } = await supabase.storage
      .from("post-images")
      .upload(filename, img.buffer, {
        contentType: "image/webp",
        cacheControl: "31536000",
      });

    if (error) {
      throw new Error(`Failed to upload image: ${error.message}`);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("post-images").getPublicUrl(filename);

    uploaded.push({
      url: publicUrl,
      altText: img.altText,
      width: img.width,
      height: img.height,
      fileSize: img.fileSize,
    });
  }

  return uploaded;
}

interface PostLink {
  url: string;
  anchorText: string;
  type: "internal" | "external" | "conversion";
}

function buildLinks(
  existingPosts: { slug: string; title: string; keyword: string }[],
  siteConfig: SiteConfig,
  currentKeyword: string,
): PostLink[] {
  const links: PostLink[] = [];

  // Internal links: pick up to 3 related existing posts
  const relatedPosts = existingPosts
    .filter((p) => p.keyword !== currentKeyword)
    .slice(0, 3);

  for (const post of relatedPosts) {
    links.push({
      url: `/blog/${post.slug}`,
      anchorText: post.keyword,
      type: "internal",
    });
  }

  // External links: use authoritative sources with descriptive anchor
  for (const source of siteConfig.authoritativeSources.slice(0, 2)) {
    const domain = extractDomainName(source);
    links.push({
      url: source,
      anchorText: `fuente oficial: ${domain}`,
      type: "external",
    });
  }

  // Conversion link
  if (siteConfig.conversionUrl) {
    links.push({
      url: siteConfig.conversionUrl,
      anchorText: "Conoce mas aqui",
      type: "conversion",
    });
  }

  return links;
}

function insertImagesIntoHtml(
  html: string,
  images: UploadedImage[],
): string {
  if (images.length === 0) return html;

  // Insert hero image after first H1 or at the start
  const heroImg = images[0];
  const heroTag = `<figure><img src="${heroImg.url}" alt="${heroImg.altText}" width="${heroImg.width}" height="${heroImg.height}" loading="eager" /></figure>`;

  let result = html.replace(
    /(<\/h1>)/i,
    `$1\n${heroTag}`,
  );

  // Insert remaining images before FAQ section or before conclusion
  if (images.length > 1) {
    const additionalImages = images
      .slice(1)
      .map(
        (img) =>
          `<figure><img src="${img.url}" alt="${img.altText}" width="${img.width}" height="${img.height}" loading="lazy" /></figure>`,
      )
      .join("\n");

    // Try to insert before FAQ section
    const faqPattern = /<section[^>]*class="[^"]*faq/i;
    if (faqPattern.test(result)) {
      result = result.replace(faqPattern, `${additionalImages}\n$&`);
    } else {
      // Insert before last H2 (conclusion)
      const lastH2 = result.lastIndexOf("<h2");
      if (lastH2 !== -1) {
        result =
          result.slice(0, lastH2) +
          additionalImages +
          "\n" +
          result.slice(lastH2);
      }
    }
  }

  return result;
}

function insertLinksIntoHtml(html: string, links: PostLink[]): string {
  let result = html;

  // Find paragraphs and distribute links across them
  const paragraphs = result.match(/<p>[^<]+<\/p>/g) ?? [];
  const paragraphCount = paragraphs.length;

  if (paragraphCount === 0) return result;

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    // Distribute links evenly across paragraphs
    const targetIdx = Math.min(
      Math.floor((i / links.length) * paragraphCount * 0.8) +
        Math.floor(paragraphCount * 0.1),
      paragraphCount - 1,
    );

    const targetParagraph = paragraphs[targetIdx];
    if (!targetParagraph) continue;

    const rel =
      link.type === "external" ? ' rel="noopener noreferrer" target="_blank"' : "";
    const linkTag = ` <a href="${link.url}"${rel}>${link.anchorText}</a>`;

    // Insert before closing </p>
    const enriched = targetParagraph.replace(
      /<\/p>$/,
      `${linkTag}</p>`,
    );

    // Only replace the first occurrence of this exact paragraph
    result = result.replace(targetParagraph, enriched);
    // Update the paragraphs array to prevent re-matching
    paragraphs[targetIdx] = enriched;
  }

  return result;
}

function insertSchemaScript(
  html: string,
  schema: Record<string, unknown>,
): string {
  const scriptTag = `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
  // Insert at the end of the article
  if (html.includes("</article>")) {
    return html.replace("</article>", `${scriptTag}\n</article>`);
  }
  return `${html}\n${scriptTag}`;
}

const SPANISH_STOPWORDS = new Set([
  "de", "del", "la", "las", "el", "los", "en", "un", "una", "unos", "unas",
  "para", "por", "con", "sin", "sobre", "entre", "hasta", "desde", "hacia",
  "que", "cual", "como", "donde", "cuando", "es", "son", "ser", "estar",
  "hay", "fue", "sido", "siendo", "al", "lo", "le", "les", "se", "su", "sus",
  "y", "o", "ni", "pero", "sino", "mas", "menos", "muy", "tan", "este",
  "esta", "estos", "estas", "ese", "esa", "esos", "esas", "aquel", "aquella",
]);

function generateSlug(text: string): string {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();

  const words = normalized
    .split(/\s+/)
    .filter((w) => w.length > 0 && !SPANISH_STOPWORDS.has(w))
    .slice(0, 5);

  return words.join("-").slice(0, 60);
}

function generateMetaDescription(html: string, keyword: string): string {
  const plainText = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Try to find a sentence containing the keyword
  const sentences = plainText.split(/[.!?]+/).map((s) => s.trim());
  const keywordSentence = sentences.find((s) =>
    s.toLowerCase().includes(keyword.toLowerCase()),
  );

  if (keywordSentence && keywordSentence.length <= 160) {
    return keywordSentence + ".";
  }

  // Fallback: first 157 chars + "..."
  return plainText.slice(0, 157) + "...";
}

function extractTags(
  outline: { h1: string; sections: { text: string }[] },
  keyword: string,
): string[] {
  const tags = new Set<string>();
  tags.add(keyword.toLowerCase());

  // Extract significant words from H2s
  for (const section of outline.sections.slice(0, 3)) {
    const words = section.text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    for (const word of words.slice(0, 2)) {
      tags.add(word);
    }
  }

  return Array.from(tags).slice(0, 8);
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}

function extractDomainName(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ── Exports for testing ─────────────────────────────────────
export { generateSlug, generateMetaDescription, extractTags, truncate,
         insertImagesIntoHtml, insertLinksIntoHtml, buildLinks, SPANISH_STOPWORDS };

async function logStep(
  siteId: string,
  postId: string | null,
  eventType: string,
  status: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.publishLog.create({
      data: {
        siteId,
        postId,
        eventType,
        status,
        metadata: (metadata as unknown) ?? undefined,
      },
    });
  } catch {
    // Logging failures should not break the pipeline
    console.error(`Failed to log step: ${eventType} - ${status}`);
  }
}
