import { Page } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  get dashboardHeading() {
    return this.page.getByRole('heading', { name: 'Dashboard' });
  }

  get userMenu() {
    return this.page.getByTestId('user-menu');
  }

  get welcomeBanner() {
    return this.page.getByTestId('welcome-banner');
  }
}
