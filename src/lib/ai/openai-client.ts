/**
 * Centralized OpenAI client for text generation tasks.
 * All AI text generation (outlines, content, categorization, etc.) routes through here.
 */

import OpenAI from "openai";

const MODEL = "gpt-4o";

let _client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
  _client = new OpenAI({ apiKey });
  return _client;
}

/**
 * Send a prompt to OpenAI and return the text response.
 * Centralizes the chat completion call pattern used across all AI modules.
 */
export async function chatCompletion(
  prompt: string,
  maxTokens: number,
  temperature?: number,
  jsonMode?: boolean,
): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: "user", content: prompt }],
    ...(jsonMode && { response_format: { type: "json_object" } }),
  });
  return response.choices[0]?.message?.content ?? "";
}
