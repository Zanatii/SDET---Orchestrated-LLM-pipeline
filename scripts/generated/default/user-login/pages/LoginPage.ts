import { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  get emailField() {
    return this.page.getByTestId('email-input');
  }

  get passwordField() {
    return this.page.getByTestId('password-input');
  }

  get loginButton() {
    return this.page.getByRole('button', { name: 'Login' });
  }

  get emailFieldFallback() {
    return this.page.getByLabel('Email');
  }

  get passwordFieldFallback() {
    return this.page.getByLabel('Password');
  }

  async enterEmail(email: string) {
    const field = (await this.emailField.count()) > 0
      ? this.emailField
      : this.emailFieldFallback;
    await field.fill(email);
  }

  async enterPassword(password: string) {
    const field = (await this.passwordField.count()) > 0
      ? this.passwordField
      : this.passwordFieldFallback;
    await field.fill(password);
  }

  async clickLoginButton() {
    await this.loginButton.click();
  }

  async login(email: string, password: string) {
    await this.enterEmail(email);
    await this.enterPassword(password);
    await this.clickLoginButton();
  }
}
