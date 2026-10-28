import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/?lang=zh");
  await page.waitForSelector(".login", { timeout: 20_000 });
  if (email !== "neo@local") {
    await page.fill(".login input[type=text]", email);
    await page.fill(".login input[type=password]", password);
  }
  await page.click(".login__submit");
  await expect(page.locator("#app")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".sidebar .session").first()).toBeVisible({ timeout: 20_000 });
}

export async function sendMessage(page: Page, text: string): Promise<void> {
  await page.fill("#input", text);
  await page.press("#input", "Enter");
}
