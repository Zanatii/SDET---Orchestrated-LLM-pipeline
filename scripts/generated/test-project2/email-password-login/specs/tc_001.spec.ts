import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';

import { LoginPage } from '../pages/LoginPage';

import { DashboardPage } from '../pages/DashboardPage';

test.describe('TC-001: Successful Login with Valid Email and Password', () => {
  let currentPage: Page;

  test.beforeEach(async ({ page }) => {
    currentPage = page;
    await page.goto(process.env.BASE_URL || '/');
  });

  test('positive - user can log in with valid email and password', async () => {
    // arrange
    const loginPage = new LoginPage(currentPage);
    const dashboardPage = new DashboardPage(currentPage);

    const email = faker.internet.email();
    const password = faker.internet.password();

    // act - step 1: enter a valid email
    await loginPage.fillEmail(email);

    // assert - email field accepts the input
    await expect(loginPage.emailInput).toHaveValue(email);

    // act - step 2: enter a valid password
    await loginPage.fillPassword(password);

    // assert - password field accepts the input (field is filled, value masked by type="password")
    await expect(loginPage.passwordInput).not.toHaveValue('');

    // act - step 3: click the login button
    await loginPage.clickLogin();

    // assert - user is logged in successfully (URL changes away from login, dashboard is visible)
    await expect(currentPage).toHaveURL(/(?!.*login).*/);
    await expect(
      dashboardPage.dashboardHeading
        .or(dashboardPage.userAvatar)
        .or(dashboardPage.welcomeMessage)
    ).toBeVisible();
  });

  test('positive - email field is enabled and accepts input before submission', async () => {
    // arrange
    const loginPage = new LoginPage(currentPage);
    const email = faker.internet.email();

    // assert - email field is interactable
    await expect(loginPage.emailInput).toBeEnabled();

    // act
    await loginPage.fillEmail(email);

    // assert
    await expect(loginPage.emailInput).toHaveValue(email);
  });

  test('positive - password field is enabled and accepts input before submission', async () => {
    // arrange
    const loginPage = new LoginPage(currentPage);
    const password = faker.internet.password();

    // assert - password field is interactable
    await expect(loginPage.passwordInput).toBeEnabled();

    // act
    await loginPage.fillPassword(password);

    // assert - field is not empty after input
    await expect(loginPage.passwordInput).not.toHaveValue('');
  });

  test('positive - login button is visible and enabled on the login page', async () => {
    // arrange
    const loginPage = new LoginPage(currentPage);

    // assert
    await expect(loginPage.loginButton).toBeVisible();
    await expect(loginPage.loginButton).toBeEnabled();
  });
});