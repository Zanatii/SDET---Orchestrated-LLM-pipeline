import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';

test.describe('TC-003: Invalid Password Login', () => {
  let page: Page;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('should display error message when logging in with valid email and invalid password', async () => {
    // arrange
    const validEmail = faker.internet.email();
    const invalidPassword = faker.random.word();

    // act — step 1: enter valid email
    await loginPage.fillEmail(validEmail);

    // assert — email field accepts input
    await expect(loginPage.emailInput).toHaveValue(validEmail);

    // act — step 2: enter invalid password
    await loginPage.fillPassword(invalidPassword);

    // assert — password field accepts input
    await expect(loginPage.passwordInput).toHaveValue(invalidPassword);

    // act — step 3: click login button
    await loginPage.clickLoginButton();

    // assert — error message is displayed for invalid password
    await expect(loginPage.errorMessage).toBeVisible();
  });
});