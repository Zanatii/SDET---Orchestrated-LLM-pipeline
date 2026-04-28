import { test, expect, Page } from '@playwright/test';

class HomePage {
  constructor(private page: Page) {}

  // Locator: Header search bar input
  getSearchBar() {
    return this.page.locator('header input[type="search"], header [role="search"], header .search-bar, header input[placeholder*="search" i]');
  }

  async navigate() {
    await this.page.goto('/');
  }
}

test.describe('TC-013 - Verify header search bar display', () => {
  test('HLS-013 - Search bar is displayed in the header', async ({ page }) => {
    const homePage = new HomePage(page);

    await homePage.navigate();

    const searchBar = homePage.getSearchBar();
    await expect(searchBar).toBeVisible();
  });
});