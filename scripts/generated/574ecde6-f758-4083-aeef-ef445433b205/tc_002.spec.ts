import { test, expect, Page } from '@playwright/test';

class HomePage {
  constructor(private page: Page) {}

  // Locator: Home menu item
  get homeMenuItem() {
    return this.page.locator('a', { hasText: 'Home' });
  }

  // Locator: Services menu item
  get servicesMenuItem() {
    return this.page.locator('a', { hasText: 'Services' });
  }

  // Locator: News & Updates menu item
  get newsUpdatesMenuItem() {
    return this.page.locator('a', { hasText: 'News & Updates' });
  }

  // Locator: Contact Us menu item
  get contactUsMenuItem() {
    return this.page.locator('a', { hasText: 'Contact Us' });
  }

  async navigate() {
    await this.page.goto('/');
  }
}

test.describe('TC-002: Verify menu items display', () => {
  test('Home, Services, News & Updates, and Contact Us menu items are displayed', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.navigate();

    await expect(homePage.homeMenuItem).toBeVisible();
    await expect(homePage.servicesMenuItem).toBeVisible();
    await expect(homePage.newsUpdatesMenuItem).toBeVisible();
    await expect(homePage.contactUsMenuItem).toBeVisible();
  });
});