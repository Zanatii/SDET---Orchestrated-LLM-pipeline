import { Page } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  get dashboardHeading() {
    return this.page.getByRole('heading', { name: 'Dashboard' });
  }

  get dashboardContainer() {
    return this.page.getByTestId('dashboard-container');
  }

  get userMenu() {
    return this.page.getByRole('navigation', { name: 'User menu' });
  }
}
