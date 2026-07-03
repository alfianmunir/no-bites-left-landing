/**
 * Centralised, validated access to environment variables.
 * Secrets (merchant key, DB url, admin password) are read here and never
 * exposed to the client — every consumer of this module is server-only.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

function optional(name: string, fallback = ""): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

export const env = {
  finpay: {
    merchantId: required("FINPAY_MERCHANT_ID"),
    merchantKey: required("FINPAY_MERCHANT_KEY"),
    baseUrl: optional("FINPAY_BASE_URL", "https://devo.finnet.co.id").replace(/\/+$/, ""),
  },
  // Public origin of THIS backend, used to build success/fail/callback URLs.
  // Falls back to localhost for dev; must be the stable public URL in prod.
  publicBaseUrl: optional("PUBLIC_BASE_URL", "http://localhost:3000").replace(/\/+$/, ""),
  databaseUrl: optional("DATABASE_URL"),
  adminPassword: optional("ADMIN_PASSWORD"),
  opsNotifyEmail: optional("OPS_NOTIFY_EMAIL"),
  // Signs the mock sign-in session cookie and the admin session cookie.
  // Mock auth only — swap for real Google OAuth (NextAuth et al) before launch.
  sessionSecret: optional("SESSION_SECRET", "dev-insecure-session-secret-change-me"),
};

/** True in sandbox mode (dev Finpay host). Guards against accidental live cutover. */
export const isSandbox = env.finpay.baseUrl.includes("devo.finnet.co.id");
