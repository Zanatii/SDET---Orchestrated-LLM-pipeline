import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';

test.describe('TC-002: Invalid Email Login', () => {
  let page: Page;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('should display error message when login is attempted with an invalid email format', async () => {
    // arrange
    const invalidEmail = faker.internet.email() + '.invalid';
    const validPassword = faker.internet.password();

    // act — step 1: enter invalid email
    await loginPage.fillEmail(invalidEmail);

    // assert — email field accepted input
    await expect(loginPage.emailInput).toHaveValue(invalidEmail);

    // act — step 2: enter valid password
    await loginPage.fillPassword(validPassword);

    // assert — password field accepted input
    await expect(loginPage.passwordInput).not.toHaveValue('');

    // act — step 3: click login button
    await loginPage.clickLoginButton();

    // assert — error message is displayed for invalid email
    await expect(loginPage.emailErrorMessage).toBeVisible();
  });
});