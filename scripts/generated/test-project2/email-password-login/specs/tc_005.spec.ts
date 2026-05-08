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

  test('edge case – login fails when password is empty', async () => {
    // arrange
    const email = faker.internet.email();
    const emptyPassword = '';

    // act – step 1: enter a valid email
    await loginPage.fillEmail(email);

    // assert – email field accepts the input
    await expect(loginPage.emailInput).toHaveValue(email);

    // act – step 2: leave password field empty (clear any pre-filled content)
    await loginPage.fillPassword(emptyPassword);

    // assert – password field is empty
    await expect(loginPage.passwordInput).toHaveValue('');

    // act – step 3: click the login button
    await loginPage.submit();

    // assert – login fails with an error message indicating password is required
    await expect(loginPage.errorMessage).toBeVisible();
  });
});