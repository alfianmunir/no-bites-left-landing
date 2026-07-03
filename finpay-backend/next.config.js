/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Finpay calls and DB access are server-only; never bundle secrets to client.
  serverExternalPackages: ["pg"],
};

module.exports = nextConfig;
