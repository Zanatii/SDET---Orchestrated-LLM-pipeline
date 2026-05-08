import { Page } from '@playwright/test';

export class InaccessibleLoginPage {
  constructor(private page: Page) {}

  get pageErrorHeading() {
    return this.page.getByRole('heading', { name: /unavailable|not available|error|down/i });
  }

  get pageErrorMessage() {
    return this.page.getByRole('main').getByText(/unavailable|not available|cannot be reached|down|error/i);
  }

  get httpErrorCode() {
    // Matches common server error status text rendered on error pages (e.g. 503, 502, 504)
    return this.page.getByText(/503|502|504|service unavailable/i);
  }

  get browserErrorMessage() {
    // Playwright exposes browser-level error pages via the page body text
    return this.page.getByText(/ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_TIMED_OUT/i);
  }

  async interceptLoginRouteAsUnavailable() {
    await this.page.route('**/login**', (route) => {
      route.fulfill({
        status: 503,
        contentType: 'text/html',
        body: `<!DOCTYPE html>
<html lang="en">
  <head><title>Service Unavailable</title></head>
  <body>
    <main>
      <h1>Service Unavailable</h1>
      <p>The login page is currently unavailable. Please try again later.</p>
      <p>503 Service Unavailable</p>
    </main>
  </body>
</html>`,
      });
    });
  }

  async navigateToLogin() {
    const baseUrl = process.env.BASE_URL || '/';
    const loginUrl = baseUrl.replace(/\/$/, '') + '/login';
    await this.page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  }

  async getResponseStatus(): Promise<number | null> {
    let status: number | null = null;
    const baseUrl = process.env.BASE_URL || '/';
    const loginUrl = baseUrl.replace(/\/$/, '') + '/login';

    this.page.once('response', (response) => {
      if (response.url().includes('/login')) {
        status = response.status();
      }
    });

    await this.page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    return status;
  }
}
