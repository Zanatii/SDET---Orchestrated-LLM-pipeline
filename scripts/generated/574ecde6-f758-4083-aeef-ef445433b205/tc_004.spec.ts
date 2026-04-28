import { test, expect, Page } from '@playwright/test';

class HomePage {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto('/');
  }

  async clickServicesMenuItem() {
    // Locator: Services menu item in navigation
    await this.page.locator('a[href*="services"], nav a:has-text("Services")').first().click();
  }
}

class ServicesPage {
  constructor(private page: Page) {}

  async getUrl(): Promise<string> {
    return this.page.url();
  }

  async isOnServicesPage(): Promise<boolean> {
    // Locator: Services page heading or main content identifier
    const heading = this.page.locator('h1, h2').filter({ hasText: /services/i }).first();
    return await heading.isVisible();
  }
}

test.describe('TC-004: Verify Services menu item navigation', () => {
  test('should navigate to the Services page when clicking Services menu item', async ({ page }) => {
    const homePage = new HomePage(page);
    const servicesPage = new ServicesPage(page);

    await homePage.navigate();
    await homePage.clickServicesMenuItem();

    await expect(page).toHaveURL(/services/i);
    const onServicesPage = await servicesPage.isOnServicesPage();
    expect(onServicesPage).toBe(true);
  });
});