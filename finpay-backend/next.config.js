/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  reactStrictMode: true,
  // Finpay calls and DB access are server-only; never bundle secrets to client.
  serverExternalPackages: ["pg"],
  // This app lives in a nested directory. Keep tracing and module resolution
  // anchored here even when a parent directory has another package-lock.json.
  outputFileTracingRoot: path.join(__dirname),
  webpack(config) {
    config.resolve.alias["@"] = __dirname;
    return config;
  },
};

module.exports = nextConfig;
