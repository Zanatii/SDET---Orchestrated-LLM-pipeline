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

  test('edge case — login fails when email is empty and password is provided', async () => {
    // arrange
    const password = faker.internet.password();

    // act — leave email field empty (no interaction needed; it starts empty)
    await loginPage.clearEmail();

    // act — enter a valid password
    await loginPage.fillPassword(password);

    // act — submit the login form
    await loginPage.clickLoginButton();

    // assert — form submission should not navigate away; URL stays on login
    await expect(page).toHaveURL(/login/i);

    // assert — an error message indicating email is required must be visible
    await expect(loginPage.emailRequiredError).toBeVisible();
  });
});