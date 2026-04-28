import { test, expect, Page } from '@playwright/test';

class HeaderPage {
  constructor(private page: Page) {}

  // Locator: Header container element
  get header() {
    return this.page.locator('header');
  }

  // Locator: Government of Dubai logo on the left
  get governmentOfDubaiLogo() {
    return this.page.locator('[alt*="Government of Dubai"], [src*="government-dubai"], .gov-dubai-logo, header img:first-of-type');
  }

  // Locator: Dubai Justice logo on the right
  get dubaiJusticeLogo() {
    return this.page.locator('[alt*="Dubai Justice"], [src*="dubai-justice"], .dubai-justice-logo, header img:last-of-type');
  }

  async loadWebsite(url: string) {
    await this.page.goto(url);
  }

  async isHeaderVisible(): Promise<boolean> {
    return await this.header.isVisible();
  }

  async isGovernmentOfDubaiLogoVisible(): Promise<boolean> {
    return await this.governmentOfDubaiLogo.isVisible();
  }

  async isDubaiJusticeLogoVisible(): Promise<boolean> {
    return await this.dubaiJusticeLogo.isVisible();
  }

  async getGovernmentOfDubaiLogoBoundingBox() {
    return await this.governmentOfDubaiLogo.boundingBox();
  }

  async getDubaiJusticeLogoBoundingBox() {
    return await this.dubaiJusticeLogo.boundingBox();
  }
}

test.describe('TC-001: Verify header display with logos', () => {
  test('Header is displayed with Government of Dubai logo on the left and Dubai Justice logo on the right', async ({ page }) => {
    const headerPage = new HeaderPage(page);

    // Step 1: Load the website
    await headerPage.loadWebsite(process.env.BASE_URL ?? '/');

    // Expected: Header is displayed
    await expect(headerPage.header).toBeVisible();

    // Expected: Government of Dubai logo is visible on the left
    await expect(headerPage.governmentOfDubaiLogo).toBeVisible();

    // Expected: Dubai Justice logo is visible on the right
    await expect(headerPage.dubaiJusticeLogo).toBeVisible();

    // Verify left/right positioning of logos within the header
    const govDubaiLogoBoundingBox = await headerPage.getGovernmentOfDubaiLogoBoundingBox();
    const dubaiJusticeLogoBoundingBox = await headerPage.getDubaiJusticeLogoBoundingBox();

    expect(govDubaiLogoBoundingBox).not.toBeNull();
    expect(dubaiJusticeLogoBoundingBox).not.toBeNull();

    if (govDubaiLogoBoundingBox && dubaiJusticeLogoBoundingBox) {
      // Government of Dubai logo should be to the left of Dubai Justice logo
      expect(govDubaiLogoBoundingBox.x).toBeLessThan(dubaiJusticeLogoBoundingBox.x);
    }
  });
});