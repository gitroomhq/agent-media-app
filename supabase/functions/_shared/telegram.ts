/**
 * Shared Telegram notification helper.
 *
 * Fire-and-forget: logs errors but never throws, so it cannot
 * break auth or billing flows.  No-ops if env vars are missing.
 */

import { fetchWithTimeout } from "./fetch-with-timeout.ts";

const TELEGRAM_API = "https://api.telegram.org";

export async function notifyTelegram(message: string): Promise<void> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!botToken || !chatId) {
    // Silently skip — dev/staging environments won't have these set.
    return;
  }

  try {
    const res = await fetchWithTimeout(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    }, 10_000);

    if (!res.ok) {
      const body = await res.text();
      console.error(`Telegram notification failed (${res.status}): ${body}`);
    }
  } catch (err) {
    console.error(
      "Telegram notification error:",
      err instanceof Error ? err.message : err,
    );
  }
}
