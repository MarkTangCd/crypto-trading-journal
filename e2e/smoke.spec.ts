import { test, expect } from "@playwright/test";

// Runs against the seeded never-synced account (see e2e/seed.ts); no network.
test("never-synced account renders dashboard, trades and accounts", async ({
  page,
}) => {
  // The seeded account is auto-sync eligible; answer the batched tRPC call
  // with no outcomes so the page stays offline and never synced.
  await page.route("**/api/trpc/account.autoSync**", route =>
    route.fulfill({ json: [{ result: { data: { json: [] } } }] })
  );

  await page.goto("/");
  await expect(page.getByText("never synced")).toBeVisible();

  await page.getByRole("button", { name: "Trades" }).click();
  await expect(page.getByText("nothing synced yet.")).toBeVisible();

  await page.getByRole("button", { name: "Accounts" }).click();
  await expect(page.getByText("never synced").first()).toBeVisible();
});
