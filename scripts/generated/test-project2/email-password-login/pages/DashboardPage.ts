import { Page } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  get userAvatar() {
    return this.page.getByTestId('user-avatar');
  }

  get userMenu() {
    return this.page.getByRole('button', { name: 'User menu' });
  }

  get dashboardHeading() {
    return this.page.getByRole('heading', { name: 'Dashboard' });
  }

  get welcomeMessage() {
    return this.page.getByTestId('welcome-message');
  }
}
