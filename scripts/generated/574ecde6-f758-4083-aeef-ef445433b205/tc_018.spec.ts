import { test, expect, Page } from '@playwright/test';

class HomePage {
  constructor(private page: Page) {}

  // Locator: navigation menu container
  get menuContainer() {
    return this.page.locator('nav');
  }

  // Locator: Home menu item
  get homeMenuItem() {
    return this.page.locator('nav a[href="/"], nav a:has-text("Home")');
  }

  // Locator: About menu item
  get aboutMenuItem() {
    return this.page.locator('nav a[href="/about"], nav a:has-text("About")');
  }

  // Locator: Services menu item
  get servicesMenuItem() {
    return this.page.locator('nav a[href="/services"], nav a:has-text("Services")');
  }

  // Locator: Contact menu item
  get contactMenuItem() {
    return this.page.locator('nav a[href="/contact"], nav a:has-text("Contact")');
  }

  // Locator: all navigation menu items
  get allMenuItems() {
    return this.page.locator('nav a, nav li');
  }

  async navigate() {
    await this.page.goto('/');
  }

  async getMenuItemLabels(): Promise<string[]> {
    // Locator: all anchor elements within the navigation menu
    const menuLinks = this.page.locator('nav a');
    const count = await menuLinks.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await menuLinks.nth(i).innerText();
      labels.push(text.trim());
    }
    return labels;
  }
}

const englishMenuLabels = [
  'Home',
  'About',
  'Services',
  'Contact',
];

const englishTextPattern = /^[A-Za-z\s&\-\/]+$/;

test.describe('TC-018 - Verify English menu item labels', () => {
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    await homePage.navigate();
  });

  test('Menu item labels are displayed in English', async ({ page }) => {
    // Locator: navigation menu is visible on the page
    const menuContainer = page.locator('nav');
    await expect(menuContainer).toBeVisible();

    const labels = await homePage.getMenuItemLabels();

    expect(labels.length).toBeGreaterThan(0);

    for (const label of labels) {
      expect(label).toMatch(englishTextPattern);
    }
  });

  test('Navigation contains expected English menu items', async ({ page }) => {
    for (const expectedLabel of englishMenuLabels) {
      // Locator: specific English menu item by text
      const menuItem = page.locator(`nav a:has-text("${expectedLabel}")`);
      const count = await menuItem.count();

      if (count > 0) {
        await expect(menuItem.first()).toBeVisible();
        const labelText = await menuItem.first().innerText();
        expect(labelText.trim()).toBe(expectedLabel);
        expect(labelText.trim()).toMatch(englishTextPattern);
      }
    }
  });

  test('No non-English characters in menu items', async ({ page }) => {
    // Locator: all navigation links for language check
    const allLinks = page.locator('nav a');
    const count = await allLinks.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const text = await allLinks.nth(i).innerText();
      const trimmedText = text.trim();
      if (trimmedText.length > 0) {
        expect(trimmedText).toMatch(englishTextPattern);
      }
    }
  });
});