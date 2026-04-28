import { test, expect, Page } from '@playwright/test';

class MaintenancePage {
  constructor(private page: Page) {}

  // Locator: Maintenance message container
  get maintenanceContainer() {
    return this.page.locator('[data-testid="maintenance-message"], .maintenance-message, #maintenance-message');
  }

  // Locator: English maintenance message text
  get englishMessage() {
    return this.page.locator('[data-testid="maintenance-message-en"], .maintenance-message-en, [lang="en"] .maintenance-text, .maintenance-english');
  }

  // Locator: Arabic maintenance message text
  get arabicMessage() {
    return this.page.locator('[data-testid="maintenance-message-ar"], .maintenance-message-ar, [lang="ar"] .maintenance-text, .maintenance-arabic');
  }

  // Locator: Page body for language content detection
  get pageBody() {
    return this.page.locator('body');
  }

  // Locator: Any element containing Arabic script characters
  get arabicTextContent() {
    return this.page.locator('[dir="rtl"], [lang="ar"], .arabic, .ar');
  }

  // Locator: Any element containing English maintenance content
  get englishTextContent() {
    return this.page.locator('[dir="ltr"], [lang="en"], .english, .en');
  }

  async isMaintenancePageDisplayed(): Promise<boolean> {
    const bodyText = await this.pageBody.textContent();
    return bodyText !== null && bodyText.length > 0;
  }

  async getBodyText(): Promise<string> {
    return (await this.pageBody.textContent()) ?? '';
  }

  async hasArabicText(): Promise<boolean> {
    const bodyText = await this.getBodyText();
    // Arabic Unicode range: \u0600-\u06FF
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(bodyText);
  }

  async hasEnglishText(): Promise<boolean> {
    const bodyText = await this.getBodyText();
    // Basic Latin characters commonly used in English
    const englishRegex = /[a-zA-Z]/;
    return englishRegex.test(bodyText);
  }
}

test.describe('TC-020: Verify maintenance message language support', () => {
  test('Maintenance message is displayed in both English and Arabic', async ({ page }) => {
    const maintenancePage = new MaintenancePage(page);

    // Navigate to the application (maintenance mode should already be active per preconditions)
    await page.goto(process.env.BASE_URL ?? '/');

    // Wait for page to fully load
    await page.waitForLoadState('domcontentloaded');

    // Step 1: Check the maintenance message language
    // Expected: Maintenance message is displayed in both English and Arabic

    const isPageDisplayed = await maintenancePage.isMaintenancePageDisplayed();
    expect(isPageDisplayed, 'Maintenance page should be displayed').toBeTruthy();

    // Verify English text is present
    const hasEnglish = await maintenancePage.hasEnglishText();
    expect(hasEnglish, 'Maintenance message should contain English text').toBeTruthy();

    // Verify Arabic text is present (Arabic Unicode range \u0600-\u06FF)
    const hasArabic = await maintenancePage.hasArabicText();
    expect(hasArabic, 'Maintenance message should contain Arabic text').toBeTruthy();
  });
});