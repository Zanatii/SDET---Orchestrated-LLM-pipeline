import { test, expect, Page } from '@playwright/test';

class HomePageBanner {
  constructor(private page: Page) {}

  getBannerTitle() {
    // Locator: banner title element
    return this.page.locator('[data-testid="banner-title"]');
  }

  getBannerSubtitle() {
    // Locator: banner subtitle element
    return this.page.locator('[data-testid="banner-subtitle"]');
  }

  async navigateToHome() {
    // Locator: home page URL
    await this.page.goto('/');
  }
}

test.describe('TC-011 - Verify banner title and subtitle display', () => {
  test('HLS-011: Banner title and subtitle are displayed on the home page', async ({ page }) => {
    const homePageBanner = new HomePageBanner(page);

    await homePageBanner.navigateToHome();

    const bannerTitle = homePageBanner.getBannerTitle();
    const bannerSubtitle = homePageBanner.getBannerSubtitle();

    await expect(bannerTitle).toBeVisible();
    await expect(bannerSubtitle).toBeVisible();
  });
});