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

  test('negative - login fails with valid email and invalid password', async () => {
    // arrange
    const validEmail = faker.internet.email();
    const invalidPassword = faker.random.word();

    // act - enter valid email
    await loginPage.enterEmail(validEmail);

    // act - enter invalid password
    await loginPage.enterPassword(invalidPassword);

    // act - submit login form
    await loginPage.clickLoginButton();

    // assert - error message is displayed
    await expect(loginPage.errorMessage).toBeVisible();
  });
});