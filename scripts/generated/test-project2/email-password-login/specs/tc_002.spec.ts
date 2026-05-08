import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';

test.describe('TC-002: Failed Login with Invalid Email', () => {
  let page: Page;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('negative: login fails when an invalid email is provided', async () => {
    // arrange
    const invalidEmail = faker.word.sample();
    const validPassword = faker.internet.password();

    // act
    await loginPage.enterEmail(invalidEmail);
    await loginPage.enterPassword(validPassword);
    await loginPage.clickLoginButton();

    // assert — email field accepted the input
    await expect(loginPage.emailInput).toHaveValue(invalidEmail);

    // assert — error message is visible indicating invalid email
    await expect(loginPage.errorMessage).toBeVisible();
  });
});