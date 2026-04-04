import { test, expect } from "@playwright/test";
import { spawn } from "child_process";
import { setTimeout } from "timers/promises";

const BASE_URL = "http://localhost:3000";

async function waitForServer(url: string, timeout = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.status === 200 || response.status === 304) {
        return;
      }
    } catch {}
    await setTimeout(500);
  }
  throw new Error(`Server at ${url} did not become ready within ${timeout}ms`);
}

test.describe("Confidence Score QA Tests", () => {
  let serverProcess: ReturnType<typeof spawn> | null = null;

  test.beforeAll(async () => {
    console.log("Starting dev server...");
    serverProcess = spawn("npm", ["run", "dev"], {
      cwd: "/Users/marktang/programming/personal-projects/crypto-trading-journal",
      stdio: "pipe",
      shell: true,
      env: { ...process.env, NODE_ENV: "development" },
    });

    serverProcess.stdout?.on("data", data => {
      console.log(`[Server] ${data.toString()}`);
    });

    serverProcess.stderr?.on("data", data => {
      console.error(`[Server Error] ${data.toString()}`);
    });

    await waitForServer(BASE_URL);
    console.log("Server is ready!");
    await setTimeout(3000);
  });

  test.afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
      await setTimeout(1000);
    }
  });

  test("Scenario 1: TradingElements Page - Create element with confidence score", async ({
    page,
  }) => {
    console.log("=== Scenario 1: TradingElements Page ===");

    await page.goto(`${BASE_URL}/trading-elements`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "qa-screenshots/01-elements-page.png",
      fullPage: true,
    });

    const newElementBtn = page.getByRole("button", { name: /new element/i });
    await expect(newElementBtn).toBeVisible();
    await newElementBtn.click();

    await page.waitForSelector("role=dialog");
    await page.screenshot({ path: "qa-screenshots/02-create-dialog.png" });

    for (let i = 1; i <= 5; i++) {
      const scoreBtn = page.getByRole("button", { name: `${i}`, exact: true });
      await expect(scoreBtn).toBeVisible();
    }
    console.log("✓ All 5 score buttons (1-5) are visible");

    const nameInput = page.getByLabel(/name/i);
    await nameInput.fill(`Test Element ${Date.now()}`);

    const score4Btn = page.getByRole("button", { name: "4", exact: true });
    await score4Btn.click();

    const confidenceDisplay = page.locator("text=/4\\/5/i").first();
    await expect(confidenceDisplay).toBeVisible();
    console.log('✓ Score 4 is selected and displays "4/5"');

    const createBtn = page.getByRole("button", { name: /create/i });
    await createBtn.click();

    await page.waitForTimeout(1000);
    await page.screenshot({
      path: "qa-screenshots/03-element-created.png",
      fullPage: true,
    });

    const confidenceBadge = page.locator("text=/4\\/5/i").first();
    await expect(confidenceBadge).toBeVisible();
    console.log('✓ Element created and displays "4/5" with label');
  });

  test("Scenario 2: NewTransaction Page - Confidence calculation", async ({
    page,
  }) => {
    console.log("=== Scenario 2: NewTransaction Page ===");

    await page.goto(`${BASE_URL}/transactions/new`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "qa-screenshots/04-new-transaction.png",
      fullPage: true,
    });

    const elementsSection = page.locator("text=/trading elements used/i");
    const hasElements = await elementsSection.isVisible().catch(() => false);

    if (!hasElements) {
      console.log(
        "⚠ No trading elements available - skipping element selection test"
      );
      return;
    }

    const checkboxes = await page.locator('input[type="checkbox"]').all();
    if (checkboxes.length > 0) {
      const firstCheckbox = page.locator('input[type="checkbox"]').first();
      await firstCheckbox.click();

      await page.waitForTimeout(500);
      await page.screenshot({
        path: "qa-screenshots/05-confidence-calculation.png",
        fullPage: true,
      });

      const confidenceDisplay = page.locator("text=/\\d+\\.\\d\\/5/i").first();
      const hasDecimalConfidence = await confidenceDisplay
        .isVisible()
        .catch(() => false);

      if (hasDecimalConfidence) {
        const text = await confidenceDisplay.textContent();
        console.log(`✓ Calculated confidence shows decimal: ${text}`);
        expect(text).not.toContain("%");
        console.log("✓ No % symbols in confidence display");
      }
    }
  });

  test("Scenario 3: TransactionDetail Page - View confidence", async ({
    page,
  }) => {
    console.log("=== Scenario 3: TransactionDetail Page ===");

    await page.goto(`${BASE_URL}/transactions`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "qa-screenshots/06-transactions-list.png",
      fullPage: true,
    });

    const viewButtons = page
      .locator("button")
      .filter({ has: page.locator('[data-lucide="eye"]') });
    const count = await viewButtons.count();

    if (count === 0) {
      console.log("⚠ No transactions available to view");
      return;
    }

    await viewButtons.first().click();
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "qa-screenshots/07-transaction-detail.png",
      fullPage: true,
    });

    const confidenceDisplay = page.locator("text=/\\d+\\.\\d\\/5/i").first();
    const hasConfidence = await confidenceDisplay
      .isVisible()
      .catch(() => false);

    if (hasConfidence) {
      const text = await confidenceDisplay.textContent();
      console.log(`✓ Transaction confidence displayed: ${text}`);

      const elementBadges = page.locator("text=/\\d\\/5/i");
      const badgeCount = await elementBadges.count();
      if (badgeCount > 0) {
        console.log(`✓ Found ${badgeCount} element confidence badges`);
      }
    } else {
      console.log("⚠ No confidence score displayed for this transaction");
    }
  });

  test("Scenario 4: Transactions List - Confidence badges", async ({
    page,
  }) => {
    console.log("=== Scenario 4: Transactions List ===");

    await page.goto(`${BASE_URL}/transactions`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({
      path: "qa-screenshots/08-transactions-list-badges.png",
      fullPage: true,
    });

    const confidenceHeader = page.locator("text=/conf\\./i");
    const hasConfidenceColumn = await confidenceHeader
      .isVisible()
      .catch(() => false);

    if (hasConfidenceColumn) {
      console.log("✓ Confidence column header found");

      await confidenceHeader.hover();
      await page.waitForTimeout(500);

      const tooltip = page.locator("role=tooltip");
      const hasTooltip = await tooltip.isVisible().catch(() => false);

      if (hasTooltip) {
        const tooltipText = await tooltip.textContent();
        console.log(`✓ Tooltip text: ${tooltipText}`);
        expect(tooltipText?.toLowerCase()).toContain("confidence");
      }

      const confidenceBadges = page.locator("text=/\\d+\\.\\d\\/5|\\d\\/5/i");
      const badgeCount = await confidenceBadges.count();
      console.log(`✓ Found ${badgeCount} confidence badges in the list`);
    } else {
      console.log("⚠ No confidence column visible");
    }
  });
});
