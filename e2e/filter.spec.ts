import { expect, test } from "@playwright/test";

test("filtering by vehicle shows only that vehicle's runs", async ({ page }) => {
  await page.goto("/");
  const rows = page.locator("tbody#runs tr");
  await expect(rows).not.toHaveCount(0);
  const totalBefore = await rows.count();

  const filter = page.getByLabel("Filter by vehicle");
  await filter.pressSequentially("WVW-1001");

  await expect(rows).toHaveCount(2);
  await expect(page.locator("tbody#runs")).toContainText("WVW-1001");
  await expect(page.locator("tbody#runs")).not.toContainText("WVW-2042");
  await expect(page.locator("tbody#runs")).not.toContainText("WVW-3310");

  await filter.fill("");
  await expect(rows).toHaveCount(totalBefore);
});
