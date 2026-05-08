import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';

test.describe('TC-003: Failed Login with Invalid Password', () => {
  let page: Page;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('TC-003 | negative | login fails when valid email is paired with an invalid password', async () => {
    // arrange
    const validEmail = faker.internet.email();
    const invalidPassword = faker.word.sample();

    // act
    await loginPage.enterEmail(validEmail);
    await loginPage.enterPassword(invalidPassword);
    await loginPage.clickLoginButton();

    // assert — email field accepted input
    await expect(loginPage.emailInput).toHaveValue(validEmail);

    // assert — password field accepted input (value may be masked but field should have a value)
    await expect(loginPage.passwordInput).not.toHaveValue('');

    // assert — login fails and an error message is visible
    await expect(loginPage.errorMessage).toBeVisible();

    // assert — user remains on the login page (no redirect to authenticated area)
    await expect(page).toHaveURL(/login/i);
  });
});