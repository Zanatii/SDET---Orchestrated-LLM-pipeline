import { test, expect, Page } from '@playwright/test';

class HomePageSearchBar {
  constructor(private page: Page) {}

  // Locator: main section container
  get mainSection() {
    return this.page.locator('main');
  }

  // Locator: search bar input in the main section
  get searchBar() {
    return this.page.locator('main input[type="search"], main input[type="text"][name*="search"], main [role="search"] input, main .search-bar, main #search, main [data-testid="search-bar"]');
  }

  async navigate() {
    await this.page.goto('/');
  }

  async isMainSectionVisible(): Promise<boolean> {
    return await this.mainSection.isVisible();
  }

  async isSearchBarVisible(): Promise<boolean> {
    return await this.searchBar.isVisible();
  }
}

test.describe('TC-014: Verify main section search bar display', () => {
  test('Search bar is displayed in the main section', async ({ page }) => {
    const homePage = new HomePageSearchBar(page);

    await homePage.navigate();

    const mainSectionVisible = await homePage.isMainSectionVisible();
    expect(mainSectionVisible).toBe(true);

    const searchBarVisible = await homePage.isSearchBarVisible();
    expect(searchBarVisible).toBe(true);
  });
});