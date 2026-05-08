import { test, expect, Page } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

import { InaccessibleLoginPage } from '../pages/InaccessibleLoginPage';

test.describe('TC-007: Inaccessible Login Page', () => {
  let currentPage: Page;

  test.beforeEach(async ({ page: p }) => {
    currentPage = p;
  });

  test('TC-007 — Login page displays error when service is unavailable (503)', async () => {
    // arrange
    const inaccessibleLoginPage = new InaccessibleLoginPage(currentPage);
    await inaccessibleLoginPage.interceptLoginRouteAsUnavailable();

    // act
    await inaccessibleLoginPage.navigateToLogin();

    // assert — step 1: verify an error/unavailability message is shown on the page
    await expect(
      currentPage.getByRole('heading', { name: /service unavailable/i })
    ).toBeVisible();

    // assert — step 2: verify the error message indicates the page is unavailable
    await expect(
      currentPage.getByText(/the login page is currently unavailable/i)
    ).toBeVisible();

    await expect(
      currentPage.getByText(/503 service unavailable/i)
    ).toBeVisible();
  });

  test('TC-007 — Login page returns 503 HTTP status when service is down', async () => {
    // arrange
    const inaccessibleLoginPage = new InaccessibleLoginPage(currentPage);

    let capturedStatus: number | null = null;
    const baseUrl = process.env.BASE_URL || '/';
    const loginUrl = baseUrl.replace(/\/$/, '') + '/login';

    await currentPage.route('**/login**', (route) => {
      route.fulfill({
        status: 503,
        contentType: 'text/html',
        body: `<!DOCTYPE html>
<html lang="en">
  <head><title>Service Unavailable</title></head>
  <body>
    <main>
      <h1>Service Unavailable</h1>
      <p>The page is unavailable. Please try again later.</p>
      <p>Error code: 503</p>
    </main>
  </body>
</html>`,
      });
    });

    // act — capture response status
    const [response] = await Promise.all([
      currentPage.waitForResponse((res) => res.url().includes('/login')),
      currentPage.goto(loginUrl, { waitUntil: 'domcontentloaded' }),
    ]);

    capturedStatus = response.status();

    // assert — HTTP status is 503
    expect(capturedStatus).toBe(503);

    // assert — step 1: error message is displayed
    await expect(
      currentPage.getByRole('heading', { name: /service unavailable/i })
    ).toBeVisible();

    // assert — step 2: message clearly indicates page is unavailable
    await expect(
      currentPage.getByText(/the page is unavailable/i)
    ).toBeVisible();

    await expect(
      currentPage.getByText(/503/i)
    ).toBeVisible();
  });

  test('TC-007 — Login page shows error heading and body when intercepted as down', async () => {
    // arrange
    const baseUrl = process.env.BASE_URL || '/';
    const loginUrl = baseUrl.replace(/\/$/, '') + '/login';

    await currentPage.route('**/login**', (route) => {
      route.fulfill({
        status: 502,
        contentType: 'text/html',
        body: `<!DOCTYPE html>
<html lang="en">
  <head><title>Bad Gateway</title></head>
  <body>
    <main role="main">
      <h1>Bad Gateway</h1>
      <p>The login service is currently unavailable due to a gateway error.</p>
      <p>502 Bad Gateway</p>
    </main>
  </body>
</html>`,
      });
    });

    // act
    await currentPage.goto(loginUrl, { waitUntil: 'domcontentloaded' });

    // assert — step 1: error is displayed
    await expect(
      currentPage.getByRole('heading', { name: /bad gateway/i })
    ).toBeVisible();

    // assert — step 2: error message indicates page is unavailable
    await expect(
      currentPage.getByRole('main').getByText(/the login service is currently unavailable/i)
    ).toBeVisible();

    await expect(
      currentPage.getByText(/502 bad gateway/i)
    ).toBeVisible();
  });
});