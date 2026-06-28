/**
 * Verifies Telegram WebApp initData using HMAC-SHA-256.
 * Works in Cloudflare Workers (Web Crypto API).
 */
export async function verifyTelegramInitData(initData: string): Promise<{
  valid: boolean;
  user?: { id: number; first_name: string; last_name?: string; username?: string };
}> {
  const botToken = process.env.TELEGRAM_API_KEY;
  if (!botToken) return { valid: false };
  if (!initData) return { valid: false };

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { valid: false };

    params.delete("hash");
    const checkString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");

    const enc = new TextEncoder();

    const baseKey = await crypto.subtle.importKey(
      "raw",
      enc.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const secretKeyBytes = await crypto.subtle.sign("HMAC", baseKey, enc.encode(botToken));

    const verifyKey = await crypto.subtle.importKey(
      "raw",
      secretKeyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBytes = await crypto.subtle.sign("HMAC", verifyKey, enc.encode(checkString));
    const computed = Array.from(new Uint8Array(sigBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (computed !== hash) return { valid: false };

    const userStr = params.get("user");
    const user = userStr ? JSON.parse(userStr) : undefined;
    return { valid: true, user };
  } catch {
    return { valid: false };
  }
}
