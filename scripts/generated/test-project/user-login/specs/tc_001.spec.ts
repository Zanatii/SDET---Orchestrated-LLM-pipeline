import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';

import { LoginPage } from '../pages/LoginPage';

import { DashboardPage } from '../pages/DashboardPage';

test.describe('TC-001: Valid Login with Email and Password', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await page.goto(process.env.BASE_URL || '/');
  });

  test('positive - successful login with valid email and password redirects to dashboard', async () => {
    // arrange
    const email = faker.internet.email();
    const password = faker.internet.password();

    const loginPage = new LoginPage(page);
    const dashboardPage = new DashboardPage(page);

    // act - enter valid email
    await loginPage.fillEmail(email);

    // assert - email field accepts input
    await expect(loginPage.emailInput).toHaveValue(email);

    // act - enter valid password
    await loginPage.fillPassword(password);

    // assert - password field accepts input
    await expect(loginPage.passwordInput).toHaveValue(password);

    // act - click login button
    await expect(loginPage.loginButton).toBeEnabled();
    await loginPage.clickLogin();

    // assert - login is successful and user is redirected to the dashboard
    await expect(page).toHaveURL(/dashboard/);
    await expect(dashboardPage.dashboardHeading).toBeVisible();
  });
});