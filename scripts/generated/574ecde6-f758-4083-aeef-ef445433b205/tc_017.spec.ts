import { test, expect, Page } from '@playwright/test';
import { faker } from '@faker-js/faker';

class DeviceSizePage {
  constructor(private page: Page) {}

  // Locator: main content wrapper / layout container
  get layoutContainer() {
    return this.page.locator('// Locator: main layout container', { has: this.page.locator('body') });
  }

  // Locator: body element
  get body() {
    return this.page.locator('body');
  }

  // Locator: meta viewport tag
  get metaViewport() {
    return this.page.locator('meta[name="viewport"]');
  }

  // Locator: responsive navigation element (hamburger menu or nav bar)
  get navigationElement() {
    return this.page.locator('nav, [role="navigation"], header');
  }

  // Locator: main content area
  get mainContent() {
    return this.page.locator('main, [role="main"], #main-content, .main-content');
  }

  async navigateToHome() {
    await this.page.goto('/');
  }

  async getViewportSize() {
    return this.page.viewportSize();
  }

  async getBodyWidth(): Promise<number> {
    // Locator: body element for width measurement
    const bodyElement = this.page.locator('body');
    const boundingBox = await bodyElement.boundingBox();
    return boundingBox?.width ?? 0;
  }

  async isLayoutAdaptedToDevice(deviceType: string): Promise<boolean> {
    const viewport = await this.getViewportSize();
    if (!viewport) return false;

    const bodyWidth = await this.getBodyWidth();

    // Check if content fits within the viewport width
    const contentFitsViewport = bodyWidth <= viewport.width + 10; // small tolerance

    if (deviceType === 'mobile') {
      // Mobile: viewport width should be small (≤ 480px) and content should fit
      return viewport.width <= 480 && contentFitsViewport;
    } else if (deviceType === 'tablet') {
      // Tablet: viewport width should be medium (481px–1024px) and content should fit
      return viewport.width > 480 && viewport.width <= 1024 && contentFitsViewport;
    } else {
      // Desktop: viewport width should be large (> 1024px) and content should fit
      return viewport.width > 1024 && contentFitsViewport;
    }
  }

  async hasNoHorizontalOverflow(): Promise<boolean> {
    const scrollWidth: number = await this.page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth: number = await this.page.evaluate(() => document.documentElement.clientWidth);
    return scrollWidth <= clientWidth;
  }
}

const deviceConfigs: Record<string, { width: number; height: number; isMobile: boolean }> = {
  mobile: { width: 375, height: 812, isMobile: true },
  tablet: { width: 768, height: 1024, isMobile: true },
  desktop: { width: 1280, height: 800, isMobile: false },
};

test.describe('TC-017 - Verify device size support', () => {
  test('HLS-017 - Website layout is adapted to the device size', async ({ browser }) => {
    const deviceType = faker.helpers.arrayElement(['mobile', 'tablet', 'desktop']);
    const deviceConfig = deviceConfigs[deviceType];

    console.log(`Testing with device type: ${deviceType} (${deviceConfig.width}x${deviceConfig.height})`);

    const context = await browser.newContext({
      viewport: { width: deviceConfig.width, height: deviceConfig.height },
      isMobile: deviceConfig.isMobile,
    });

    const page = await context.newPage();
    const deviceSizePage = new DeviceSizePage(page);

    try {
      await deviceSizePage.navigateToHome();

      // Verify body is visible
      await expect(deviceSizePage.body).toBeVisible();

      // Verify viewport matches expected device dimensions
      const viewport = await deviceSizePage.getViewportSize();
      expect(viewport).not.toBeNull();
      expect(viewport!.width).toBe(deviceConfig.width);
      expect(viewport!.height).toBe(deviceConfig.height);

      // Verify there is no horizontal overflow (content fits within device width)
      const noHorizontalOverflow = await deviceSizePage.hasNoHorizontalOverflow();
      expect(noHorizontalOverflow).toBe(true);

      // Verify that main content or navigation is visible
      const navigationVisible = await deviceSizePage.navigationElement
        .first()
        .isVisible()
        .catch(() => false);
      const mainContentVisible = await deviceSizePage.mainContent
        .first()
        .isVisible()
        .catch(() => false);

      expect(navigationVisible || mainContentVisible).toBe(true);

      // Verify layout is adapted to device size
      const isLayoutAdapted = await deviceSizePage.isLayoutAdaptedToDevice(deviceType);
      expect(isLayoutAdapted).toBe(true);

      console.log(`Layout is correctly adapted for device type: ${deviceType}`);
    } finally {
      await context.close();
    }
  });
});