import { test, expect } from "@playwright/test";

test("create account, log open trade, close it, see win", async ({ page }) => {
  const runId = String(Date.now());

  // Navigate to dashboard and verify it renders
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /transactions/i })
  ).toBeVisible();

  // Create a new account
  await page.getByRole("button", { name: /accounts/i }).click();
  await page.getByRole("button", { name: "new account" }).click();
  await page.getByLabel("name").fill(`smoke-${runId}`);
  await page.getByLabel("initial balance").fill("1000");
  await page.getByRole("button", { name: "create" }).click();

  // Select the newly created account
  const accountRow = page.locator("tr", { hasText: `smoke-${runId}` });
  await expect(accountRow).toBeVisible();
  await accountRow.getByRole("button", { name: "select →" }).click();

  // Verify account switcher shows the new account
  await expect(
    page.getByRole("button", { name: new RegExp(`smoke-${runId}`) })
  ).toBeVisible();

  // Navigate to new trade form
  await page.getByRole("button", { name: "New Trade" }).click();
  await expect(
    page.getByRole("button", { name: "record trade" })
  ).toBeEnabled();

  // Fill required fields
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const startTimeStr = oneHourAgo.toISOString().slice(0, 16);

  await page.getByLabel("trading pair").fill("BTCUSDT");
  await page.getByLabel("timeframe").selectOption("1m");
  await page.getByLabel("started").fill(startTimeStr);
  await page.getByLabel("direction").selectOption("long");
  await page.getByLabel("entry price").fill("40000");
  await page.getByLabel("position size (usdt)").fill("100");
  await page.getByLabel("planned stop loss").fill("39000");
  await page.getByLabel("planned take profit").fill("42000");
  await page.getByLabel("market cycle").selectOption("Upward Trend");
  await page.getByLabel("type").selectOption("Trend");
  await page.getByLabel("market background").fill(`smoke ${runId} context`);

  // Submit and expect navigation to transactions list
  await page.getByRole("button", { name: "record trade" }).click();
  await expect(page).toHaveURL(/\/transactions$/);

  // Find the open trade row
  const row = page.getByRole("row", { name: /BTCUSDT/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("[open]");

  // Close the trade
  await row.getByRole("button", { name: "close →" }).click();

  // Fill close modal
  const nowStr = new Date().toISOString().slice(0, 16);
  await page.getByLabel("end time").fill(nowStr);
  await page.getByLabel("exit price").fill("41000");
  await page.getByLabel("exit price").press("Enter");

  // Verify win outcome appears in the row
  await expect(page.getByRole("row", { name: /BTCUSDT/ })).toContainText(
    "win",
    { timeout: 5000 }
  );
});
