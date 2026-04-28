import { test, expect, Page } from '@playwright/test';

class HomePage {
  constructor(private page: Page) {}

  // Locator: News & Updates menu item
  get newsAndUpdatesMenuItem() {
    return this.page.locator('a[href*="news"], nav >> text=News & Updates, text=News & Updates').first();
  }

  async goto() {
    await this.page.goto('/');
  }

  async clickNewsAndUpdates() {
    await this.newsAndUpdatesMenuItem.click();
  }
}

class NewsAndUpdatesPage {
  constructor(private page: Page) {}

  // Locator: News & Updates page heading or URL indicator
  get pageHeading() {
    return this.page.locator('h1, h2').filter({ hasText: /news/i }).first();
  }

  async isLoaded(): Promise<boolean> {
    return (
      this.page.url().toLowerCase().includes('news') ||
      (await this.pageHeading.isVisible())
    );
  }
}

test.describe('TC-005: Verify News & Updates menu item navigation', () => {
  test('User is navigated to the News & Updates page when clicking the menu item', async ({ page }) => {
    const homePage = new HomePage(page);
    const newsPage = new NewsAndUpdatesPage(page);

    // Precondition: User is on the home page
    await homePage.goto();

    // Step 1: Click on the News & Updates menu item
    await homePage.clickNewsAndUpdates();

    // Expected: User is navigated to the News & Updates page
    await page.waitForLoadState('networkidle');

    const isOnNewsPage = await newsPage.isLoaded();
    expect(isOnNewsPage).toBeTruthy();
  });
});