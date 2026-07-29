/**
 * Shared fetch wrapper with AbortController-based timeout.
 *
 * Prevents edge functions from hanging indefinitely when a provider
 * API (fal.ai, OpenAI, Telegram) becomes unresponsive.
 */

export async function fetchWithTimeout(
  url: string | URL,
  options: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
