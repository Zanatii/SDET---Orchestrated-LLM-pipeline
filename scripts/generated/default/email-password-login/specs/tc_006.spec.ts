import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';

test.describe('TC-006: Failed Login with Email Format Error', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await page.goto(process.env.BASE_URL || '/');
  });

  test('edge case — login fails when email has invalid format', async () => {
    // arrange
    const loginPage = new LoginPage(page);
    const malformedEmail = `${faker.word.sample()}@example`;
    const password = faker.internet.password();

    // act
    await loginPage.enterEmail(malformedEmail);
    await loginPage.enterPassword(password);
    await loginPage.clickLoginButton();

    // assert — email field should still be visible and login should not succeed
    await expect(loginPage.emailField).toBeVisible();
    await expect(loginPage.emailFormatErrorMessage).toBeVisible();
  });
});