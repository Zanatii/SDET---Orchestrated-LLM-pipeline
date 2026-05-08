import { test, expect, Page, Request } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';

test.describe('TC-009: Secure Login Mechanism', () => {
  let page: Page;

  test.beforeEach(async ({ page: p }) => {
    page = p;
    await page.goto(process.env.BASE_URL || '/');
  });

  test('positive - login request is sent over a secure connection with no sensitive data in plain text', async () => {
    // arrange
    const email = faker.internet.email();
    const password = faker.internet.password();

    const loginPage = new LoginPage(page);

    const capturedRequests: Request[] = [];

    page.on('request', (request) => {
      capturedRequests.push(request);
    });

    // act
    await loginPage.fillEmail(email);
    await loginPage.fillPassword(password);
    await loginPage.submit();

    // assert - URL must use HTTPS (secure connection)
    await expect(page).toHaveURL(/^https:\/\//);

    // assert - every captured request related to login must use HTTPS
    const loginRequests = capturedRequests.filter((req) =>
      req.url().toLowerCase().includes('login') ||
      req.url().toLowerCase().includes('auth') ||
      req.url().toLowerCase().includes('session') ||
      req.url().toLowerCase().includes('signin')
    );

    for (const req of loginRequests) {
      expect(
        req.url().startsWith('https://'),
        `Expected request to use HTTPS, but got: ${req.url()}`
      ).toBe(true);
    }

    // assert - the login requests should exist (at least one auth-related request was made)
    expect(
      loginRequests.length,
      'Expected at least one secure login-related network request'
    ).toBeGreaterThan(0);

    // assert - no request sent to a plain HTTP endpoint (no http:// requests during login flow)
    const insecureRequests = capturedRequests.filter((req) =>
      req.url().startsWith('http://') && !req.url().startsWith('http://localhost')
    );

    expect(
      insecureRequests.length,
      `Expected zero insecure HTTP requests, but found: ${insecureRequests.map((r) => r.url()).join(', ')}`
    ).toBe(0);

    // assert - POST body of login requests must not expose password in plain-text query params
    const postRequests = capturedRequests.filter(
      (req) =>
        req.method() === 'POST' &&
        (req.url().toLowerCase().includes('login') ||
          req.url().toLowerCase().includes('auth') ||
          req.url().toLowerCase().includes('session') ||
          req.url().toLowerCase().includes('signin'))
    );

    for (const req of postRequests) {
      const urlString = req.url();

      // assert - password must NOT appear as a plain-text query parameter in the URL
      expect(
        urlString.includes(password),
        `Sensitive password found in plain-text URL: ${urlString}`
      ).toBe(false);

      // assert - URL must be HTTPS
      expect(
        urlString.startsWith('https://'),
        `Login POST request must use HTTPS, found: ${urlString}`
      ).toBe(true);
    }
  });
});