/**
 * Initialise the order store.
 * - Postgres (DATABASE_URL set): runs db/schema.sql.
 * - Dev file store (no DATABASE_URL): ensures .dev-data/ exists.
 *
 * Usage: npm run db:init   (loads .env.local via Node's --env-file)
 */
import { getStore, usingPostgres } from "../lib/db";

async function main() {
  const store = getStore();
  await store.init();
  console.log(usingPostgres ? "Postgres schema applied." : "Dev file store ready (.dev-data/orders.json).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
