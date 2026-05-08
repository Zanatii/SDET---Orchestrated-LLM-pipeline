import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { faker } from '@faker-js/faker';

test.describe('TC-006: Login with Email Address Containing Special Characters', () => {
  let page: Page;
  let loginPage: LoginPage;
  let dashboardPage: DashboardPage;

  // Generate test data once per suite
  const specialCharEmail = faker.internet.email().replace('@', '+special!#$%@');
  const password = faker.internet.password();

  test.beforeEach(async ({ page: p }) => {
    page = p;
    loginPage = new LoginPage(page);
    dashboardPage = new DashboardPage(page);
    await page.goto(process.env.BASE_URL || '/');
  });

  test(
    'TC-006: user can log in with an email address containing special characters',
    { tag: ['@edge', '@low-priority', '@REQ-002', '@HLS-006'] },
    async () => {
      // arrange — test data already generated above

      // act: step 1 — enter email with special characters
      await loginPage.fillEmail(specialCharEmail);

      // assert: email field accepts the value
      await expect(loginPage.emailInput).toHaveValue(specialCharEmail);

      // act: step 2 — enter valid password
      await loginPage.fillPassword(password);

      // assert: password field accepts the value (confirms input is not blank)
      await expect(loginPage.passwordInput).not.toHaveValue('');

      // act: step 3 — click the login button
      await loginPage.submit();

      // assert: user is logged in — dashboard is visible and URL reflects authenticated state
      await expect(page).toHaveURL(/dashboard|home|portal/i);
      await expect(dashboardPage.welcomeHeading).toBeVisible();
    }
  );
});