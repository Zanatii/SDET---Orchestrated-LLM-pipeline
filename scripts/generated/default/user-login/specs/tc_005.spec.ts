import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { faker } from '@faker-js/faker';

test.describe('TC-005: Empty Password Login', () => {
  let page: Page;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('edge case — login attempt with valid email and blank password shows error', async () => {
    // arrange
    const validEmail = faker.internet.email();

    // act — enter valid email
    await loginPage.enterEmail(validEmail);

    // assert — email field accepted input
    await expect(loginPage.emailInput).toHaveValue(validEmail);

    // act — leave password field blank and click login
    await loginPage.clickLogin();

    // assert — password field is highlighted as required (invalid/aria-invalid or :invalid state)
    await expect(loginPage.passwordInput).toHaveAttribute('aria-required', 'true');

    // assert — error message is displayed to the user
    await expect(loginPage.errorMessage).toBeVisible();
  });
});