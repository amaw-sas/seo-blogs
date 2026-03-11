/**
 * Weekly report generator.
 * Compiles weekly metrics across all sites and sends via configured channels.
 */

import { PrismaClient } from "@prisma/client";
import { sendNotification } from "../../src/lib/notifications";

const prisma = new PrismaClient();

interface WeeklyReportData {
  period: { start: string; end: string };
  postsPerSite: {
    siteId: string;
    siteName: string;
    domain: string;
    published: number;
    errors: number;
  }[];
  keywordsPerSite: {
    siteId: string;
    siteName: string;
    consumed: number;
    remaining: number;
  }[];
  costs: {
    totalTokens: number;
    totalImages: number;
    totalCost: number;
  };
  brokenLinks: number;
  topPosts: {
    postId: string;
    title: string;
    siteName: string;
    clicks: number;
  }[];
  alerts: string[];
}

/**
 * Generate and send the weekly report.
 * Compiles data from the last 7 days and sends via email and/or Telegram.
 */
export async function generateWeeklyReport(): Promise<WeeklyReportData> {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const sites = await prisma.site.findMany({
    where: { active: true },
    select: { id: true, name: true, domain: true },
  });

  // Posts published per site
  const postsPerSite = await Promise.all(
    sites.map(async (site) => {
      const [published, errors] = await Promise.all([
        prisma.post.count({
          where: {
            siteId: site.id,
            status: "published",
            publishedAt: { gte: weekAgo, lte: now },
          },
        }),
        prisma.post.count({
          where: {
            siteId: site.id,
            status: "error",
            createdAt: { gte: weekAgo, lte: now },
          },
        }),
      ]);
      return {
        siteId: site.id,
        siteName: site.name,
        domain: site.domain,
        published,
        errors,
      };
    }),
  );

  // Keywords consumed vs remaining per site
  const keywordsPerSite = await Promise.all(
    sites.map(async (site) => {
      const [consumed, remaining] = await Promise.all([
        prisma.keyword.count({
          where: {
            siteId: site.id,
            status: "used",
            createdAt: { gte: weekAgo },
          },
        }),
        prisma.keyword.count({
          where: { siteId: site.id, status: "pending" },
        }),
      ]);
      return {
        siteId: site.id,
        siteName: site.name,
        consumed,
        remaining,
      };
    }),
  );

  // Total costs for the week
  const costLogs = await prisma.publishLog.aggregate({
    where: {
      createdAt: { gte: weekAgo, lte: now },
    },
    _sum: {
      costTokens: true,
      costImages: true,
    },
  });

  const totalTokens = costLogs._sum.costTokens ?? 0;
  const totalImages = costLogs._sum.costImages ?? 0;
  const costs = {
    totalTokens,
    totalImages,
    totalCost: totalTokens + totalImages,
  };

  // Broken links count
  const brokenLinks = await prisma.postLink.count({
    where: { status: "broken" },
  });

  // Top performing posts by clicks
  const topPostsData = await prisma.analytics.groupBy({
    by: ["postId"],
    where: {
      date: { gte: weekAgo, lte: now },
    },
    _sum: { clicks: true },
    orderBy: { _sum: { clicks: "desc" } },
    take: 10,
  });

  const topPostIds = topPostsData.map((p) => p.postId);
  const topPostDetails = await prisma.post.findMany({
    where: { id: { in: topPostIds } },
    select: {
      id: true,
      title: true,
      site: { select: { name: true } },
    },
  });

  const postMap = new Map(topPostDetails.map((p) => [p.id, p]));
  const topPosts = topPostsData.map((row) => {
    const post = postMap.get(row.postId);
    return {
      postId: row.postId,
      title: post?.title ?? "Unknown",
      siteName: post?.site.name ?? "Unknown",
      clicks: row._sum.clicks ?? 0,
    };
  });

  // Alerts
  const alerts: string[] = [];

  for (const kw of keywordsPerSite) {
    if (kw.remaining < 10) {
      alerts.push(
        `${kw.siteName}: solo ${kw.remaining} keywords pendientes`,
      );
    }
  }

  for (const ps of postsPerSite) {
    const total = ps.published + ps.errors;
    if (total > 0 && ps.errors / total > 0.3) {
      alerts.push(
        `${ps.siteName}: tasa de error alta (${ps.errors}/${total} posts)`,
      );
    }
    if (ps.published === 0 && ps.errors === 0) {
      alerts.push(`${ps.siteName}: sin posts generados esta semana`);
    }
  }

  if (brokenLinks > 0) {
    alerts.push(`${brokenLinks} enlaces rotos detectados en total`);
  }

  const reportData: WeeklyReportData = {
    period: {
      start: weekAgo.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
    },
    postsPerSite,
    keywordsPerSite,
    costs,
    brokenLinks,
    topPosts,
    alerts,
  };

  // Format reports
  const htmlReport = formatHtmlReport(reportData);
  const textReport = formatTextReport(reportData);

  // Save to publish_logs
  const logSiteId = sites[0]?.id;
  if (logSiteId) {
    await prisma.publishLog.create({
      data: {
        siteId: logSiteId,
        eventType: "weekly_report",
        status: "success",
        metadata: reportData as unknown as Record<string, unknown>,
      },
    });
  }

  // Send via configured channels
  try {
    if (process.env.SMTP_HOST) {
      await sendNotification(
        "Reporte Semanal",
        htmlReport,
        "email",
        logSiteId,
      );
    }
  } catch (error) {
    console.error(
      "[WeeklyReport] Failed to send email:",
      error instanceof Error ? error.message : error,
    );
  }

  try {
    if (process.env.TELEGRAM_BOT_TOKEN) {
      await sendNotification(
        "Reporte Semanal",
        textReport,
        "telegram",
        logSiteId,
      );
    }
  } catch (error) {
    console.error(
      "[WeeklyReport] Failed to send Telegram:",
      error instanceof Error ? error.message : error,
    );
  }

  console.log("[WeeklyReport] Report generated and sent successfully");

  return reportData;
}

function formatHtmlReport(data: WeeklyReportData): string {
  const totalPublished = data.postsPerSite.reduce(
    (sum, s) => sum + s.published,
    0,
  );
  const totalErrors = data.postsPerSite.reduce(
    (sum, s) => sum + s.errors,
    0,
  );

  const postsRows = data.postsPerSite
    .map(
      (s) =>
        `<tr><td>${s.siteName}</td><td>${s.domain}</td><td>${s.published}</td><td>${s.errors}</td></tr>`,
    )
    .join("");

  const keywordsRows = data.keywordsPerSite
    .map(
      (k) =>
        `<tr><td>${k.siteName}</td><td>${k.consumed}</td><td>${k.remaining}</td></tr>`,
    )
    .join("");

  const topPostsRows = data.topPosts
    .map(
      (p, i) =>
        `<tr><td>${i + 1}</td><td>${p.title}</td><td>${p.siteName}</td><td>${p.clicks}</td></tr>`,
    )
    .join("");

  const alertsHtml =
    data.alerts.length > 0
      ? `<div style="background:#fff3cd;border:1px solid #ffc107;padding:12px;border-radius:6px;margin-bottom:16px;">
          <strong>Alertas:</strong>
          <ul style="margin:8px 0 0;">${data.alerts.map((a) => `<li>${a}</li>`).join("")}</ul>
        </div>`
      : "";

  return `
    <h2>Reporte Semanal SEO Blogs</h2>
    <p><strong>Periodo:</strong> ${data.period.start} — ${data.period.end}</p>

    ${alertsHtml}

    <h3>Posts Publicados</h3>
    <p>Total: ${totalPublished} publicados, ${totalErrors} errores</p>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">
      <thead><tr style="background:#f3f4f6;"><th>Sitio</th><th>Dominio</th><th>Publicados</th><th>Errores</th></tr></thead>
      <tbody>${postsRows}</tbody>
    </table>

    <h3>Keywords</h3>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">
      <thead><tr style="background:#f3f4f6;"><th>Sitio</th><th>Consumidos</th><th>Pendientes</th></tr></thead>
      <tbody>${keywordsRows}</tbody>
    </table>

    <h3>Costos</h3>
    <p>Tokens: $${data.costs.totalTokens.toFixed(4)} | Imágenes: $${data.costs.totalImages.toFixed(4)} | <strong>Total: $${data.costs.totalCost.toFixed(4)}</strong></p>

    <h3>Enlaces Rotos</h3>
    <p>${data.brokenLinks} enlaces rotos detectados</p>

    ${data.topPosts.length > 0 ? `
    <h3>Top Posts (por clicks)</h3>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;">
      <thead><tr style="background:#f3f4f6;"><th>#</th><th>Título</th><th>Sitio</th><th>Clicks</th></tr></thead>
      <tbody>${topPostsRows}</tbody>
    </table>` : ""}
  `.trim();
}

function formatTextReport(data: WeeklyReportData): string {
  const totalPublished = data.postsPerSite.reduce(
    (sum, s) => sum + s.published,
    0,
  );
  const totalErrors = data.postsPerSite.reduce(
    (sum, s) => sum + s.errors,
    0,
  );

  const lines: string[] = [
    `REPORTE SEMANAL SEO BLOGS`,
    `Periodo: ${data.period.start} — ${data.period.end}`,
    ``,
  ];

  if (data.alerts.length > 0) {
    lines.push(`ALERTAS:`);
    for (const alert of data.alerts) {
      lines.push(`  - ${alert}`);
    }
    lines.push(``);
  }

  lines.push(`POSTS: ${totalPublished} publicados, ${totalErrors} errores`);
  for (const s of data.postsPerSite) {
    lines.push(`  ${s.siteName}: ${s.published} ok, ${s.errors} err`);
  }
  lines.push(``);

  lines.push(`KEYWORDS:`);
  for (const k of data.keywordsPerSite) {
    lines.push(`  ${k.siteName}: ${k.consumed} usados, ${k.remaining} pendientes`);
  }
  lines.push(``);

  lines.push(
    `COSTOS: $${data.costs.totalCost.toFixed(4)} (tokens: $${data.costs.totalTokens.toFixed(4)}, imgs: $${data.costs.totalImages.toFixed(4)})`,
  );
  lines.push(`ENLACES ROTOS: ${data.brokenLinks}`);
  lines.push(``);

  if (data.topPosts.length > 0) {
    lines.push(`TOP POSTS:`);
    for (const [i, p] of data.topPosts.entries()) {
      lines.push(`  ${i + 1}. ${p.title} (${p.siteName}) — ${p.clicks} clicks`);
    }
  }

  return lines.join("\n");
}
