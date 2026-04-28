import { test, expect, Page } from '@playwright/test';

class HomePagePOM {
  constructor(private page: Page) {}

  // Locator: main banner image
  get mainBannerImage() {
    return this.page.locator('img.main-banner, [data-testid="main-banner"], .banner img, .hero-banner img, .main-banner-image').first();
  }

  async navigateToHomePage() {
    await this.page.goto('/');
  }
}

test.describe('TC-010 - Verify main banner image display', () => {
  test('HLS-010 - Main banner image is displayed on the home page', async ({ page }) => {
    const homePage = new HomePagePOM(page);

    await homePage.navigateToHomePage();

    const bannerImage = homePage.mainBannerImage;
    await expect(bannerImage).toBeVisible();
  });
});