import { test, expect, Page } from '@playwright/test';

class MaintenancePage {
  constructor(private page: Page) {}

  // Locator: Main section container
  get mainSection() {
    return this.page.locator('main');
  }

  // Locator: Maintenance message element
  get maintenanceMessage() {
    return this.page.locator('[data-testid="maintenance-message"]');
  }

  async navigateToHome() {
    await this.page.goto('/');
  }

  async isMaintenanceMessageVisible(): Promise<boolean> {
    return await this.maintenanceMessage.isVisible();
  }
}

test.describe('TC-015 - Verify maintenance message display', () => {
  test('Maintenance message is displayed in the main section', async ({ page }) => {
    const maintenancePage = new MaintenancePage(page);

    await maintenancePage.navigateToHome();

    await expect(maintenancePage.mainSection).toBeVisible();

    await expect(maintenancePage.maintenanceMessage).toBeVisible();
  });
});