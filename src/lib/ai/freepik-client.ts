/**
 * Freepik Mystic API client for photorealistic image generation.
 * Async flow: POST /v1/ai/mystic → poll GET /v1/ai/mystic/{task_id} → download.
 */

const BASE_URL = "https://api.freepik.com";

interface PollOptions {
  maxPollAttempts?: number;
  pollIntervalMs?: number;
}

/**
 * Generate a photorealistic image using Freepik Mystic.
 * Returns the raw image buffer (caller handles compression).
 */
export async function generateImageWithFreepik(
  prompt: string,
  aspectRatio: string,
  options?: PollOptions,
): Promise<Buffer> {
  const apiKey = process.env.FREEPIK_API_KEY;
  if (!apiKey) throw new Error("FREEPIK_API_KEY is not set");

  const maxPollAttempts = options?.maxPollAttempts ?? 30;
  const pollIntervalMs = options?.pollIntervalMs ?? 2000;

  // Step 1: Create generation task
  const createResponse = await fetch(`${BASE_URL}/v1/ai/mystic`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-freepik-api-key": apiKey,
    },
    body: JSON.stringify({
      prompt,
      negative_prompt: "text, watermark, logo, sign, banner, letters, words, blurry, low quality, cartoon, illustration, drawing, painting",
      resolution: "2K",
      aspect_ratio: aspectRatio,
      num_images: 1,
    }),
  });

  if (!createResponse.ok) {
    const body = await createResponse.text();
    throw new Error(`Freepik API error ${createResponse.status}: ${body}`);
  }

  const createData = (await createResponse.json()) as {
    data: { task_id: string };
  };
  const taskId = createData.data.task_id;

  // Step 2: Poll for completion
  for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    const pollResponse = await fetch(`${BASE_URL}/v1/ai/mystic/${taskId}`, {
      headers: { "x-freepik-api-key": apiKey },
    });

    if (!pollResponse.ok) {
      throw new Error(`Freepik poll error ${pollResponse.status}`);
    }

    const pollData = (await pollResponse.json()) as {
      data: {
        status: string;
        generated?: string[];
        error?: string;
      };
    };

    if (pollData.data.status === "COMPLETED") {
      const imageUrl = pollData.data.generated?.[0];
      if (!imageUrl) throw new Error("Freepik returned no image URL");

      // Step 3: Download image
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Freepik image download error ${imageResponse.status}`);
      }
      return Buffer.from(await imageResponse.arrayBuffer());
    }

    if (pollData.data.status === "FAILED") {
      throw new Error(`Freepik task failed: ${pollData.data.error ?? "unknown"}`);
    }
  }

  throw new Error(`Freepik task ${taskId} timed out after ${maxPollAttempts} poll attempts`);
}
