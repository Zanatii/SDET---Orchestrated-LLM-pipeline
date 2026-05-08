import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';

test.describe('TC-001: Valid Email and Password Login', () => {
  let page: Page;
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  const email = faker.internet.email();
  const password = faker.internet.password();

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('should log in successfully with valid email and password', async () => {
    // arrange — credentials generated via faker

    // act
    await loginPage.enterEmail(email);
    await loginPage.enterPassword(password);
    await loginPage.clickLoginButton();

    // assert
    await expect(page).toHaveURL(/dashboard|home|welcome/i);
    await expect(dashboardPage.userGreeting).toBeVisible();
  });
});