import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';

test.describe('TC-004: Empty Email Address Login', () => {
  let page: Page;
  let loginPage: LoginPage;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('should display error when email is blank and valid password is entered', async () => {
    // arrange
    const validPassword = faker.internet.password({ length: 12 });

    // act — leave email field blank (do not interact with email input)
    await loginPage.fillPassword(validPassword);
    await loginPage.clickLoginButton();

    // assert — email field should be marked as required / invalid
    await expect(loginPage.emailInput).toHaveAttribute('required', '');

    // assert — an error message is displayed to the user
    await expect(loginPage.errorMessage).toBeVisible();
  });

  test('should reflect native browser validation on empty email field before submission', async () => {
    // arrange
    const validPassword = faker.internet.password({ length: 12 });

    // act — type password only, leave email blank
    await loginPage.fillPassword(validPassword);

    // assert — email input is empty
    await expect(loginPage.emailInput).toHaveValue('');

    // act — attempt login
    await loginPage.clickLoginButton();

    // assert — page does not navigate away (login is blocked)
    await expect(page).toHaveURL(new RegExp(process.env.BASE_URL?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || '/'));

    // assert — error feedback is surfaced
    await expect(loginPage.errorMessage).toBeVisible();
  });
});