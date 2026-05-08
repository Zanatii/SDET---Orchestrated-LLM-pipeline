import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';

test.describe('TC-007: Login with Password Containing Special Characters', () => {
  let page: Page;
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  const testEmail = faker.internet.email();
  const testPassword = faker.internet.password() + '!@#$';

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test('edge: user with special-character password can log in successfully', async () => {
    // arrange — test data generated via faker with special characters appended
    const email = testEmail;
    const password = testPassword;

    // act — enter valid email
    await loginPage.enterEmail(email);

    // assert — email field accepted the input
    await expect(loginPage.emailInput).toHaveValue(email);

    // act — enter password containing special characters
    await loginPage.enterPassword(password);

    // assert — password field accepted the input (field is not empty / has value length)
    await expect(loginPage.passwordInput).not.toHaveValue('');

    // act — submit the login form
    await loginPage.clickLoginButton();

    // assert — user is redirected to the dashboard, confirming successful login
    await expect(page).toHaveURL(/dashboard/);
    await expect(dashboardPage.welcomeHeading).toBeVisible();
  });
});