import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';

test.describe('TC-005: Empty Password Field Login', () => {
  let page: Page;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('should display error message when password field is left empty', async () => {
    // arrange
    const email = faker.internet.email();
    const password = '';

    // act
    await loginPage.enterEmail(email);
    await loginPage.enterPassword(password);
    await loginPage.clickLoginButton();

    // assert — email field accepted input
    await expect(loginPage.emailInput).toHaveValue(email);

    // assert — password field is empty
    await expect(loginPage.passwordInput).toHaveValue('');

    // assert — error message is displayed for empty password
    await expect(loginPage.passwordErrorMessage).toBeVisible();
  });
});