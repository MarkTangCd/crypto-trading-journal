import { getDb } from "./server/db.js";

async function test() {
  const db = await getDb();
  if (!db) {
    console.error("Failed to connect to database");
    process.exit(1);
  }
  console.log("Database connection successful");
  process.exit(0);
}

test();
