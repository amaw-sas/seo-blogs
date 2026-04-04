/**
 * OpenAI embeddings generation, cosine similarity, and agglomerative clustering
 * for keyword grouping and semantic duplicate detection.
 */

import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 100;

export interface ClusterResult {
  indices: number[];
  keywords: string[];
}

export interface DuplicatePair {
  phrase1: string;
  phrase2: string;
  similarity: number;
}

/**
 * Generate embedding vectors for an array of texts using OpenAI.
 * Batches requests in groups of 100 (API limit).
 */
export async function generateEmbeddings(
  texts: string[],
): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  const client = new OpenAI({ apiKey });

  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });
    for (const item of response.data) {
      embeddings.push(item.embedding);
    }
  }

  return embeddings;
}

/**
 * Standard cosine similarity between two vectors.
 * Returns a value between -1 and 1.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Build a pairwise similarity matrix for the given embeddings.
 */
function buildSimilarityMatrix(embeddings: number[][]): number[][] {
  const n = embeddings.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      matrix[i][j] = sim;
      matrix[j][i] = sim;
    }
  }

  return matrix;
}

/**
 * Compute average-linkage similarity between two clusters given a similarity matrix.
 */
function averageLinkage(
  clusterA: number[],
  clusterB: number[],
  simMatrix: number[][],
): number {
  let total = 0;
  for (const i of clusterA) {
    for (const j of clusterB) {
      total += simMatrix[i][j];
    }
  }
  return total / (clusterA.length * clusterB.length);
}

/**
 * Core agglomerative clustering — returns raw clusters without post-processing.
 */
function clusterCore(
  embeddings: number[][],
  originalIndices: number[],
  labels: string[],
  threshold: number,
): ClusterResult[] {
  const n = embeddings.length;
  if (n === 0) return [];

  const simMatrix = buildSimilarityMatrix(embeddings);

  // Each item starts as its own cluster (using local indices)
  let clusters: number[][] = Array.from({ length: n }, (_, i) => [i]);

  while (clusters.length > 1) {
    let bestSim = -Infinity;
    let bestI = -1;
    let bestJ = -1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = averageLinkage(clusters[i], clusters[j], simMatrix);
        if (sim > bestSim) {
          bestSim = sim;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestSim < threshold) break;

    // Merge bestJ into bestI, remove bestJ
    clusters[bestI] = [...clusters[bestI], ...clusters[bestJ]];
    clusters.splice(bestJ, 1);
  }

  return clusters.map((localIndices) => ({
    indices: localIndices.map((li) => originalIndices[li]),
    keywords: localIndices.map((li) => labels[li]),
  }));
}

/**
 * Bottom-up agglomerative clustering using average linkage.
 *
 * Post-processing:
 * - Clusters with >15 items are re-clustered with threshold + 0.1
 * - Clusters with <3 items are merged into the nearest cluster
 */
export function agglomerativeCluster(
  embeddings: number[][],
  labels: string[],
  threshold: number = 0.75,
): ClusterResult[] {
  let clusters = clusterCore(
    embeddings,
    Array.from({ length: embeddings.length }, (_, i) => i),
    labels,
    threshold,
  );

  // Re-cluster oversized clusters
  const expanded: ClusterResult[] = [];
  for (const cluster of clusters) {
    if (cluster.indices.length > 15) {
      const subEmbeddings = cluster.indices.map((i) => embeddings[i]);
      const subClusters = clusterCore(
        subEmbeddings,
        cluster.indices,
        cluster.keywords,
        threshold + 0.1,
      );
      expanded.push(...subClusters);
    } else {
      expanded.push(cluster);
    }
  }

  // Merge small clusters (<3 items) into nearest cluster
  if (expanded.length <= 1) return expanded;

  const small: ClusterResult[] = [];
  const large: ClusterResult[] = [];

  for (const cluster of expanded) {
    if (cluster.indices.length < 3) {
      small.push(cluster);
    } else {
      large.push(cluster);
    }
  }

  // If all clusters are small, return as-is (nothing to merge into)
  if (large.length === 0) return expanded;

  for (const sc of small) {
    let bestSim = -Infinity;
    let bestIdx = 0;

    for (let i = 0; i < large.length; i++) {
      // Average similarity between small cluster and large cluster
      let total = 0;
      let count = 0;
      for (const si of sc.indices) {
        for (const li of large[i].indices) {
          total += cosineSimilarity(embeddings[si], embeddings[li]);
          count++;
        }
      }
      const avg = total / count;
      if (avg > bestSim) {
        bestSim = avg;
        bestIdx = i;
      }
    }

    large[bestIdx].indices.push(...sc.indices);
    large[bestIdx].keywords.push(...sc.keywords);
  }

  return large;
}

/**
 * Find semantic duplicate pairs where cosine similarity exceeds the threshold.
 * Similarity is rounded to 2 decimal places.
 */
export function findSemanticDuplicates(
  embeddings: number[][],
  labels: string[],
  threshold: number = 0.9,
): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];

  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      if (sim > threshold) {
        pairs.push({
          phrase1: labels[i],
          phrase2: labels[j],
          similarity: Math.round(sim * 100) / 100,
        });
      }
    }
  }

  return pairs;
}
