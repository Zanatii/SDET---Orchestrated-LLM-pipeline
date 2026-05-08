import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';

test.describe('TC-003: Failed Login with Invalid Password', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await page.goto(process.env.BASE_URL || '/');
  });

  test('negative - login fails when valid email is combined with invalid password', async () => {
    // arrange
    const loginPage = new LoginPage(page);
    const validEmail = faker.internet.email();
    const invalidPassword = faker.word.sample();

    // act
    await loginPage.enterEmail(validEmail);
    await loginPage.enterPassword(invalidPassword);
    await loginPage.clickLoginButton();

    // assert — email field accepted input
    await expect(loginPage.emailInput).toHaveValue(validEmail);

    // assert — password field accepted input (value masked but field should be filled)
    await expect(loginPage.passwordInput).not.toHaveValue('');

    // assert — error message is visible indicating invalid credentials / invalid password
    await expect(loginPage.errorMessage).toBeVisible();

    // assert — user remains on the login page (no navigation to dashboard)
    await expect(page).toHaveURL(/login/i);
  });
});