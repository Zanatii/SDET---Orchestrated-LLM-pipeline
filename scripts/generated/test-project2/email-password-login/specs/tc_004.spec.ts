import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { faker } from '@faker-js/faker';

test.describe('TC-004: Failed Login with Empty Email', () => {
  let page: Page;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('edge case — login fails when email field is left empty', async () => {
    // arrange
    const password = faker.internet.password();

    // act — leave email field empty (do not interact with it)
    await loginPage.clearEmail();

    // act — enter a valid password
    await loginPage.enterPassword(password);

    // act — submit the login form
    await loginPage.clickLoginButton();

    // assert — email field should still be empty
    await expect(loginPage.emailInput).toHaveValue('');

    // assert — error message indicating email is required should be visible
    await expect(loginPage.emailValidationError).toBeVisible();
  });
});