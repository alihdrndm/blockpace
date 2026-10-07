import { expect, test } from "@playwright/test";

// The happy path from the spec, against the seeded stack with today = 2026-10-06.
test("dashboard, block detail and calculator show the expected numbers", async ({
  page,
}) => {
  await page.goto("/");
  const rows = page.getByRole("table").getByRole("row");
  await expect(rows).toHaveCount(4); // header + three seeded blocks
  // Accessible names leave out the badge's decorative icon.
  for (const badge of ["On track", "At risk", "Minimum met"]) {
    await expect(page.getByRole("cell", { name: badge, exact: true })).toBeVisible();
  }

  await page.getByRole("link", { name: "Courtyard Annex" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("TechConf");
  const projected = page
    .locator("div", {
      has: page.getByText("Projected at cutoff", { exact: true }),
    })
    .last();
  await expect(projected).toContainText("$1,051.20");

  await page.goto("/calculator");
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(
    page.getByRole("region", { name: "Cumulative basis" }),
  ).toContainText("$975.60");
  await expect(
    page.getByRole("region", { name: "Per-night basis" }),
  ).toContainText("$1,528.80");
});
