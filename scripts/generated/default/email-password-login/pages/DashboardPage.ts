import { Page } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  get userAvatar() {
    return this.page.getByTestId('user-avatar');
  }

  get welcomeMessage() {
    return this.page.getByTestId('welcome-message');
  }

  get dashboardHeading() {
    return this.page.getByRole('heading', { name: /dashboard|welcome/i });
  }

  get logoutButton() {
    return this.page.getByRole('button', { name: /logout|sign out/i });
  }
}
