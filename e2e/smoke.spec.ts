import { test, expect } from "@playwright/test";

// Runs against the seeded never-synced account (see e2e/seed.ts); no network.
test("never-synced account renders dashboard, trades and accounts", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("never synced")).toBeVisible();

  await page.getByRole("button", { name: "Trades" }).click();
  await expect(page.getByText("nothing synced yet.")).toBeVisible();

  await page.getByRole("button", { name: "Accounts" }).click();
  await expect(page.getByText("never synced").first()).toBeVisible();
});
