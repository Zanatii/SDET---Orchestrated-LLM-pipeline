import { test, expect, Page } from '@playwright/test';

class HomePage {
  constructor(private page: Page) {}

  // Locator: main section container
  get mainSection() {
    return this.page.locator('main');
  }

  // Locator: carousel component
  get carousel() {
    return this.page.locator('[data-testid="carousel"], .carousel, [role="region"][aria-label*="carousel" i], .slick-slider, .swiper-container');
  }

  async navigate() {
    await this.page.goto('/');
  }
}

test.describe('TC-012 - Verify carousel display', () => {
  test('Carousel is displayed in the main section on the home page', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.navigate();

    await expect(homePage.mainSection).toBeVisible();

    await expect(homePage.carousel).toBeVisible();
  });
});