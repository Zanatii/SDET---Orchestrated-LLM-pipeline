import { test, expect, Page } from '@playwright/test';

class HomePage {
  constructor(private page: Page) {}

  // Locator: Language toggle button
  private languageToggle = this.page.locator('[data-testid="language-toggle"], .language-toggle, [aria-label*="language"], [aria-label*="Language"]').first();

  // Locator: HTML root element for lang attribute
  private htmlRoot = this.page.locator('html');

  // Locator: Arabic language indicator text or element
  private arabicIndicator = this.page.locator('text=عربي, [lang="ar"], [data-lang="ar"]').first();

  // Locator: English language indicator text or element
  private englishIndicator = this.page.locator('text=English, [lang="en"], [data-lang="en"]').first();

  async goto() {
    await this.page.goto('/');
  }

  async getLanguageToggle() {
    return this.languageToggle;
  }

  async clickLanguageToggle() {
    await this.languageToggle.click();
  }

  async getCurrentLang(): Promise<string | null> {
    return await this.htmlRoot.getAttribute('lang');
  }

  async isArabicIndicatorVisible(): Promise<boolean> {
    return await this.arabicIndicator.isVisible().catch(() => false);
  }

  async isEnglishIndicatorVisible(): Promise<boolean> {
    return await this.englishIndicator.isVisible().catch(() => false);
  }
}

test.describe('TC-007 - Verify language toggle', () => {
  test('Language is toggled between Arabic and English', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.goto();

    // Capture the initial language state
    const initialLang = await homePage.getCurrentLang();

    // Step 1: Click on the language toggle
    await homePage.clickLanguageToggle();

    // Wait for the page to reflect the language change
    await page.waitForTimeout(500);

    // Capture the language state after toggling
    const toggledLang = await homePage.getCurrentLang();

    // Verify that the language has changed from the initial state
    if (initialLang === 'en' || initialLang?.startsWith('en')) {
      // Was English, should now be Arabic
      expect(toggledLang).toMatch(/^ar/);
    } else if (initialLang === 'ar' || initialLang?.startsWith('ar')) {
      // Was Arabic, should now be English
      expect(toggledLang).toMatch(/^en/);
    } else {
      // Fallback: just verify the language attribute changed
      expect(toggledLang).not.toBe(initialLang);
    }

    // Step 2: Click the language toggle again to toggle back
    await homePage.clickLanguageToggle();

    await page.waitForTimeout(500);

    // Capture the language state after toggling back
    const reToggledLang = await homePage.getCurrentLang();

    // Verify the language has returned to the initial state
    expect(reToggledLang).toBe(initialLang);
  });
});