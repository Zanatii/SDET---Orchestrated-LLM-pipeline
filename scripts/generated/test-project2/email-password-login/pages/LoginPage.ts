import { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  get emailInput() {
    return this.page.getByTestId('email-input').or(this.page.getByLabel('Email'));
  }

  get passwordInput() {
    return this.page.getByTestId('password-input').or(this.page.getByLabel('Password'));
  }

  get loginButton() {
    return this.page.getByRole('button', { name: 'Login' });
  }

  get emailField() {
    return this.page.getByTestId('email-input');
  }

  get passwordField() {
    return this.page.getByTestId('password-input');
  }

  async fillEmail(email: string) {
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string) {
    await this.passwordInput.fill(password);
  }

  async clickLogin() {
    await this.loginButton.click();
  }

  async login(email: string, password: string) {
    await this.fillEmail(email);
    await this.fillPassword(password);
    await this.clickLogin();
  }
}
