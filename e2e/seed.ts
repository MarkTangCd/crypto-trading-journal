import { createAccount, getOrCreateAnonymousUser } from "../server/db";

// Seeds the e2e database with one never-synced account. apiKey stays null so
// the account is ineligible for auto-sync and the smoke never hits Binance.
async function seed() {
  const user = await getOrCreateAnonymousUser();
  await createAccount({ userId: user.id, name: "smoke" });
}

seed().then(
  () => process.exit(0),
  error => {
    console.error("[E2E Seed]", error);
    process.exit(1);
  }
);
