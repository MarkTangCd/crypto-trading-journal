import { migrateTransactionStatus } from "../server/db";

async function main() {
  console.log("Starting transaction status migration...");

  try {
    const migratedCount = await migrateTransactionStatus();
    console.log(`Migration complete. ${migratedCount} transactions updated.`);
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

main();
