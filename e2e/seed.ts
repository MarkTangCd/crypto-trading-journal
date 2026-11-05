import { encrypt } from "../server/agents/secrets";
import { createAccount, getOrCreateAnonymousUser } from "../server/db";

// Seeds the e2e database with one never-synced account. The keys are dummies;
// the smoke stubs account.autoSync so nothing ever reaches Binance.
async function seed() {
  const user = await getOrCreateAnonymousUser();
  await createAccount({
    userId: user.id,
    name: "smoke",
    apiKey: encrypt("e2e-api-key"),
    apiSecret: encrypt("e2e-api-secret"),
  });
}

seed().then(
  () => process.exit(0),
  error => {
    console.error("[E2E Seed]", error);
    process.exit(1);
  }
);
