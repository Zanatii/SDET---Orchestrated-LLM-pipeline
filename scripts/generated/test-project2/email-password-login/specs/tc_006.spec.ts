import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';

test.describe('TC-006: Failed Login with Email Format Error', () => {
  let page: Page;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('edge case - login fails when email has invalid format', async () => {
    // arrange
    const malformedEmail = `${faker.word.sample()}@example`;
    const password = faker.internet.password();

    // act - enter email with format error
    await loginPage.fillEmail(malformedEmail);

    // assert - email field accepts the input
    await expect(loginPage.emailInput).toHaveValue(malformedEmail);

    // act - enter valid password
    await loginPage.fillPassword(password);

    // assert - password field accepts the input
    await expect(loginPage.passwordInput).not.toHaveValue('');

    // act - submit login form
    await loginPage.clickLoginButton();

    // assert - login fails with an email format error message
    await expect(loginPage.errorMessage).toBeVisible();
    await expect(loginPage.emailValidationError).toBeVisible();
  });
});