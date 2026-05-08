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

  test('positive: user can log in successfully with valid email and password', async () => {
    // arrange
    const loginPage = new LoginPage(currentPage);
    const dashboardPage = new DashboardPage(currentPage);

    const email = faker.internet.email();
    const password = faker.internet.password({ length: 12, memorable: false });

    // act — step 1: enter valid email
    await loginPage.fillEmail(email);

    // assert — email field accepts input
    await expect(loginPage.emailField).toHaveValue(email);

    // act — step 2: enter valid password
    await loginPage.fillPassword(password);

    // assert — password field accepts input (value present, field is filled)
    await expect(loginPage.passwordField).not.toHaveValue('');

    // act — step 3: click login button
    await expect(loginPage.submitButton).toBeEnabled();
    await loginPage.clickLogin();

    // assert — user is logged in successfully (URL changes away from login)
    await expect(currentPage).toHaveURL(/dashboard|home|welcome|main/i);

    // assert — dashboard or post-login content is visible
    await expect(
      dashboardPage.dashboardHeading
        .or(dashboardPage.userAvatar)
        .or(dashboardPage.welcomeMessage)
    ).toBeVisible();
  });
});