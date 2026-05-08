import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { faker } from '@faker-js/faker';

test.describe('TC-005: Failed Login with Empty Password', () => {
  let page: Page;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('edge case — login fails when password field is left empty', async () => {
    // arrange
    const validEmail = faker.internet.email();
    const emptyPassword = '';

    // act — step 1: enter a valid email
    await loginPage.fillEmail(validEmail);

    // assert — email field accepted the input
    await expect(loginPage.emailInput).toHaveValue(validEmail);

    // act — step 2: leave the password field empty (clear to ensure it is empty)
    await loginPage.fillPassword(emptyPassword);

    // assert — password field is empty
    await expect(loginPage.passwordInput).toHaveValue('');

    // act — step 3: click the login button
    await loginPage.clickLoginButton();

    // assert — login fails and an appropriate error message is shown
    await expect(loginPage.passwordErrorMessage).toBeVisible();
  });
});