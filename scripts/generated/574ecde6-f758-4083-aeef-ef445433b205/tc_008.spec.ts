import { test, expect, Page } from '@playwright/test';

class HomePage {
  constructor(private page: Page) {}

  // Locator: Login menu item
  get loginMenuItem() {
    return this.page.locator('a[href*="login"], [data-testid="login-menu-item"], text=Login');
  }
}

class LoginPage {
  constructor(private page: Page) {}

  // Locator: Login screen container
  get loginScreenContainer() {
    return this.page.locator('[data-testid="login-screen"], form[action*="login"], #login-form');
  }

  // Locator: Login page heading
  get loginPageHeading() {
    return this.page.locator('h1, h2').filter({ hasText: /login/i });
  }
}

test.describe('TC-008 - Verify login screen navigation', () => {
  let homePage: HomePage;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    loginPage = new LoginPage(page);

    await page.goto('/');
  });

  test('HLS-008: Click on the login menu item and verify login screen is displayed', async ({ page }) => {
    await homePage.loginMenuItem.click();

    await expect(page).toHaveURL(/.*login.*/i);

    const loginScreenVisible =
      (await loginPage.loginScreenContainer.count()) > 0 ||
      (await loginPage.loginPageHeading.count()) > 0;

    expect(loginScreenVisible).toBeTruthy();
  });
});