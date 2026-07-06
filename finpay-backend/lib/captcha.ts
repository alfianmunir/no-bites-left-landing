/**
 * Cloudflare Turnstile captcha verification (server). If TURNSTILE_SECRET_KEY is
 * unset, verification is skipped (returns true) so the forms keep working — the
 * honeypot + rate limiter still apply. Once the key is set, a valid token is
 * required.
 */
import { env } from "./env";

export async function verifyCaptcha(token: string | undefined, ip: string): Promise<boolean> {
  const secret = env.turnstileSecretKey;
  if (!secret) return true; // captcha not configured
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
