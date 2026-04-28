import { test, expect, Page } from '@playwright/test';

class MaintenanceMessagePage {
  constructor(private page: Page) {}

  getMaintenanceMessage() {
    // Locator: maintenance message container
    return this.page.locator('[data-testid="maintenance-message"]');
  }

  getCloseButton() {
    // Locator: close button for maintenance message
    return this.page.locator('[data-testid="maintenance-message-close"]');
  }
}

test.describe('TC-016 - Verify maintenance message closure', () => {
  test('should close the maintenance message when close button is clicked', async ({ page }) => {
    const maintenancePage = new MaintenanceMessagePage(page);

    await page.goto('/');

    const maintenanceMessage = maintenancePage.getMaintenanceMessage();
    await expect(maintenanceMessage).toBeVisible();

    const closeButton = maintenancePage.getCloseButton();
    await closeButton.click();

    await expect(maintenanceMessage).not.toBeVisible();
  });
});