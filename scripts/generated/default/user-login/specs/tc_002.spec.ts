import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { faker } from '@faker-js/faker';

test.describe('TC-002: Invalid Email Address Login', () => {
  let page: Page;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('TC-002 | REQ-002 REQ-005 | negative | should display error message when login is attempted with an invalid email address', async () => {
    // arrange
    const invalidEmail = faker.internet.email() + '@invalid';
    const validPassword = faker.internet.password();

    // act — step 1: enter invalid email
    await loginPage.fillEmail(invalidEmail);

    // act — step 2: enter valid password
    await loginPage.fillPassword(validPassword);

    // act — step 3: click login button
    await loginPage.clickLoginButton();

    // assert — error message is displayed after submitting invalid email
    await expect(loginPage.errorMessage).toBeVisible();
  });
});