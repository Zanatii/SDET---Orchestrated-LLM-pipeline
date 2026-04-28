import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';

class LoginPage {
  constructor(private page: Page) {}

  // Locator: username input field
  private usernameInput = this.page.locator('input[name="username"], input[type="email"], #username, #email');

  // Locator: password input field
  private passwordInput = this.page.locator('input[name="password"], input[type="password"], #password');

  // Locator: login submit button
  private submitButton = this.page.locator('button[type="submit"], input[type="submit"], button:has-text("Login"), button:has-text("Sign in")');

  // Locator: error message container
  private errorMessage = this.page.locator('.error, .error-message, [role="alert"], .alert-danger, #error-message, .login-error');

  async navigate() {
    await this.page.goto('/login');
  }

  async enterUsername(username: string) {
    await this.usernameInput.fill(username);
  }

  async enterPassword(password: string) {
    await this.passwordInput.fill(password);
  }

  async clickSubmit() {
    await this.submitButton.click();
  }

  async getErrorMessage() {
    return this.errorMessage;
  }

  async login(username: string, password: string) {
    await this.enterUsername(username);
    await this.enterPassword(password);
    await this.clickSubmit();
  }
}

test.describe('TC-022 - Verify failed login navigation', () => {
  test('should display error message when invalid credentials are entered', async ({ page }) => {
    const loginPage = new LoginPage(page);

    const username = faker.internet.email();
    const password = String(faker.number.int({ min: 10000000, max: 99999999 }));

    await loginPage.navigate();

    await loginPage.login(username, password);

    const errorMessage = await loginPage.getErrorMessage();
    await expect(errorMessage).toBeVisible();
  });
});