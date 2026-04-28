import { test, expect, Page } from '@playwright/test';

class HomePageArabic {
  constructor(private page: Page) {}

  // Locator: navigation menu container
  get menuContainer() {
    return this.page.locator('nav, [role="navigation"], .menu, .navbar, #menu');
  }

  // Locator: menu item labels (list items or anchor tags within nav)
  get menuItems() {
    return this.page.locator('nav a, [role="navigation"] a, .menu-item, .nav-item, .navbar-item');
  }

  // Locator: html root element for language attribute check
  get htmlElement() {
    return this.page.locator('html');
  }

  // Locator: body element for direction attribute check
  get bodyElement() {
    return this.page.locator('body');
  }

  async navigateToHome() {
    await this.page.goto('/');
  }

  async setLanguageToArabic() {
    // Attempt to set language via URL or cookie if supported
    await this.page.goto('/?lang=ar');
  }

  async getMenuItemTexts(): Promise<string[]> {
    await this.menuItems.first().waitFor({ state: 'visible', timeout: 10000 });
    const count = await this.menuItems.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await this.menuItems.nth(i).innerText();
      texts.push(text.trim());
    }
    return texts;
  }

  isArabicText(text: string): boolean {
    // Arabic Unicode range: \u0600-\u06FF
    const arabicPattern = /[\u0600-\u06FF]/;
    return arabicPattern.test(text);
  }
}

test.describe('TC-019: Verify Arabic menu item labels', () => {
  test.beforeEach(async ({ page }) => {
    // Set locale context to Arabic
    await page.goto('/');
  });

  test('Menu item labels are displayed in Arabic', async ({ page }) => {
    const homePage = new HomePageArabic(page);

    // Navigate to home page with Arabic language setting
    await homePage.setLanguageToArabic();

    // Verify the page language is set to Arabic
    const htmlLang = await homePage.htmlElement.getAttribute('lang');
    const bodyDir = await homePage.bodyElement.getAttribute('dir');

    // Check that the page is in Arabic (lang="ar") or RTL direction
    const isArabicLang = htmlLang ? htmlLang.startsWith('ar') : false;
    const isRTL = bodyDir === 'rtl';

    // At least one of these should be true for an Arabic page
    const isArabicPage = isArabicLang || isRTL;
    expect(isArabicPage).toBeTruthy();

    // Get all menu item texts
    const menuTexts = await homePage.getMenuItemTexts();

    // Verify that menu items are present
    expect(menuTexts.length).toBeGreaterThan(0);

    // Verify each menu item label contains Arabic characters
    for (const text of menuTexts) {
      const containsArabic = homePage.isArabicText(text);
      expect(
        containsArabic,
        `Expected menu item "${text}" to contain Arabic characters`
      ).toBeTruthy();
    }
  });

  test('Menu items are visible and rendered in Arabic locale', async ({ page }) => {
    const homePage = new HomePageArabic(page);

    await homePage.setLanguageToArabic();

    // Verify menu container is visible
    await expect(homePage.menuContainer.first()).toBeVisible();

    // Verify menu items are visible
    const menuItems = homePage.menuItems;
    const count = await menuItems.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      await expect(menuItems.nth(i)).toBeVisible();
      const text = await menuItems.nth(i).innerText();
      expect(text.trim().length).toBeGreaterThan(0);
      expect(homePage.isArabicText(text.trim())).toBeTruthy();
    }
  });
});