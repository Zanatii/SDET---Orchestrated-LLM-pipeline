import { test, expect, Page } from '@playwright/test';

class AccessibilityPage {
  constructor(private page: Page) {}

  getAccessibilityIcon() {
    // Locator: accessibility icon button
    return this.page.locator('[aria-label="Accessibility"]');
  }

  getAccessibilityOptions() {
    // Locator: accessibility options panel/menu
    return this.page.locator('[data-testid="accessibility-options"]');
  }
}

test.describe('TC-009 - Verify accessibility options', () => {
  let accessibilityPage: AccessibilityPage;

  test.beforeEach(async ({ page }) => {
    accessibilityPage = new AccessibilityPage(page);
    await page.goto('/');
  });

  test('HLS-009 - Accessibility options are displayed when accessibility icon is clicked', async ({ page }) => {
    const accessibilityIcon = accessibilityPage.getAccessibilityIcon();
    const accessibilityOptions = accessibilityPage.getAccessibilityOptions();

    await expect(accessibilityIcon).toBeVisible();
    await accessibilityIcon.click();

    await expect(accessibilityOptions).toBeVisible();
  });
});