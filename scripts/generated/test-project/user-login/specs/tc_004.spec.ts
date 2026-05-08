import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';

test.describe('TC-004: Empty Email Field Login', () => {
  let page: Page;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('should display error message when email field is empty and valid password is provided', async () => {
    // arrange
    const password = faker.internet.password();

    // act — leave email field empty (value: "")
    await loginPage.fillEmail('');

    // act — enter valid password
    await loginPage.fillPassword(password);

    // assert — password field accepted the input
    await expect(loginPage.passwordInput).toBeEnabled();

    // act — click login button
    await loginPage.submit();

    // assert — error message is displayed for empty email field
    await expect(loginPage.emailErrorMessage).toBeVisible();
  });
});