import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleHtml = readFileSync(
  join(__dirname, "../fixtures/sample-arxiv.html"),
  "utf-8",
);

test("readonly flow: create project → add arXiv paper → reader renders content", async ({
  page,
}) => {
  await page.route("**/arxiv.org/html/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: sampleHtml,
    });
  });

  await page.route("**/ar5iv.org/html/**", async (route) => {
    await route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "Not Found",
    });
  });

  await page.goto("/");

  // 创建第一个项目，进入后落在 ChatBox
  await page.getByPlaceholder("项目名称").fill("E2E Project");
  await page.getByRole("button", { name: "新建项目" }).click();
  await expect(page).toHaveURL(/#\/p\/[^/]+\/chat-box$/);

  // 进入 Paper Box 再导入论文
  await page.getByRole("button", { name: "Paper Box" }).click();
  await expect(page).toHaveURL(/#\/p\/[^/]+\/paper-box$/);

  // Add Paper → 选择 arXiv HTML 导入 → 输入 ID → 导入
  await page.getByRole("button", { name: "Add Paper" }).click();
  await page.getByRole("button", { name: "从 arXiv HTML 导入" }).click();
  await page.getByPlaceholder("输入 arXiv URL 或 ID").fill("2401.12345");
  await page.getByRole("button", { name: "导入" }).click();

  await expect(page).toHaveURL(/#\/p\/[^/]+\/paper\/2401\.12345$/);
  await expect(page.getByRole("heading", { name: "E2E Sample Paper" })).toBeVisible();
  await expect(page.getByText("This paragraph confirms body rendering works.")).toBeVisible();
  await expect(page.locator(".katex")).toBeVisible();
});
