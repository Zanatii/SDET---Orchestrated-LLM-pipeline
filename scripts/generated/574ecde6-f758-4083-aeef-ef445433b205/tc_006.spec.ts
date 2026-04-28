import { test, expect, Page } from '@playwright/test';

class HomePage {
  constructor(private page: Page) {}

  // Locator: Contact Us menu item
  get contactUsMenuItem() {
    return this.page.locator('a[href*="contact"], a:has-text("Contact Us"), nav >> text=Contact Us');
  }

  async navigate() {
    await this.page.goto('/');
  }

  async clickContactUs() {
    await this.contactUsMenuItem.click();
  }
}

class ContactUsPage {
  constructor(private page: Page) {}

  // Locator: Contact Us page heading
  get pageHeading() {
    return this.page.locator('h1, h2').filter({ hasText: /contact us/i });
  }

  // Locator: Contact Us page URL pattern
  get contactUsUrlPattern() {
    return /contact/i;
  }

  async isLoaded() {
    await this.page.waitForLoadState('networkidle');
  }
}

test.describe('TC-006: Verify Contact Us menu item navigation', () => {
  test('should navigate to the Contact Us page when clicking the Contact Us menu item', async ({ page }) => {
    const homePage = new HomePage(page);
    const contactUsPage = new ContactUsPage(page);

    // Step 1: Navigate to home page (Precondition)
    await homePage.navigate();

    // Step 1: Click on the Contact Us menu item
    await homePage.clickContactUs();

    // Step 1 Expected: User is navigated to the Contact Us page
    await contactUsPage.isLoaded();

    await expect(page).toHaveURL(contactUsPage.contactUsUrlPattern);
  });
});