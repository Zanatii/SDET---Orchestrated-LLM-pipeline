import { test, expect, Page } from '@playwright/test';

class HomePage {
  constructor(private page: Page) {}

  // Locator: Home menu item
  get homeMenuItem() {
    return this.page.locator('a[href="/"], nav a:has-text("Home"), [data-testid="home-menu-item"]').first();
  }

  // Locator: Home page main content / hero section
  get homePageContent() {
    return this.page.locator('main, [data-testid="home-content"], #home, .home');
  }

  async navigateTo() {
    await this.page.goto('/');
  }

  async clickHomeMenuItem() {
    await this.homeMenuItem.click();
  }

  async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  async isOnHomePage(): Promise<boolean> {
    const url = this.page.url();
    const urlObj = new URL(url);
    return urlObj.pathname === '/' || urlObj.pathname === '/home' || urlObj.hash === '#home';
  }
}

test.describe('TC-003 - Verify Home menu item navigation', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.navigateTo();
  });

  test('User remains on the home screen after clicking Home menu item', async ({ page }) => {
    const urlBeforeClick = await homePage.getCurrentUrl();

    await homePage.clickHomeMenuItem();

    await page.waitForLoadState('networkidle');

    const urlAfterClick = await homePage.getCurrentUrl();

    const isOnHome = await homePage.isOnHomePage();
    expect(isOnHome).toBe(true);

    const urlObjBefore = new URL(urlBeforeClick);
    const urlObjAfter = new URL(urlAfterClick);
    expect(urlObjAfter.pathname).toBe(urlObjBefore.pathname.replace(/^$/, '/') || '/');

    await expect(homePage.homePageContent).toBeVisible();
  });
});