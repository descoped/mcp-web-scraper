/**
 * Login Flow tool - Handle common login patterns with cookie consent awareness
 */

import { z } from 'zod';
import { BaseNavigationTool } from './baseNavigationTool.js';

export class LoginFlowTool extends BaseNavigationTool {
  name = 'login_flow';
  description = 'Handle login flows with automatic form detection and cookie consent handling';
  
  inputSchema = z.object({
    loginUrl: z.string().url().describe('URL of the login page'),
    username: z.string().describe('Username or email to login with'),
    password: z.string().describe('Password for login'),
    sessionId: z.string().optional().describe('Session ID to reuse existing browser session'),
    usernameSelector: z.string().optional().describe('Custom CSS selector for username field'),
    passwordSelector: z.string().optional().describe('Custom CSS selector for password field'),
    submitSelector: z.string().optional().describe('Custom CSS selector for submit button'),
    waitForUrl: z.string().optional().describe('URL pattern to wait for after successful login'),
    waitForSelector: z.string().optional().describe('CSS selector to wait for after login'),
    timeout: z.number().optional().default(30000).describe('Login timeout in milliseconds')
  });

  async execute(args: z.infer<typeof this.inputSchema>, context: any): Promise<any> {
    const session = await this.getOrCreateSession(args, context);
    
    try {
      // Navigate to login page
      await session.page.goto(args.loginUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: args.timeout 
      });
      
      // Handle cookie consent if present
      if (!session.hasConsentHandled) {
        try {
          const consentHandler = context.consentHandler;
          const consentResult = await consentHandler.handleCookieConsent(session.page);
          if (consentResult.success) {
            session.hasConsentHandled = true;
            // Wait a bit after consent handling
            await session.page.waitForTimeout(2000);
          }
        } catch (error) {
          // Continue with login even if consent handling fails
          context.logger?.warn('Cookie consent handling failed on login page', { error });
        }
      }

      // Auto-detect or use provided selectors
      const usernameSelector = args.usernameSelector || await this.detectUsernameField(session.page);
      const passwordSelector = args.passwordSelector || await this.detectPasswordField(session.page);
      const submitSelector = args.submitSelector || await this.detectSubmitButton(session.page);

      if (!usernameSelector || !passwordSelector) {
        throw new Error('Could not detect login form fields');
      }

      // Fill in credentials
      await session.page.fill(usernameSelector, args.username);
      await session.page.fill(passwordSelector, args.password);

      // Take screenshot of filled form (password will be masked)
      const formScreenshot = await session.page.screenshot({ fullPage: false });

      // Click submit button or press Enter
      if (submitSelector) {
        await Promise.all([
          session.page.waitForNavigation({ timeout: args.timeout }).catch(() => {}),
          session.page.click(submitSelector)
        ]);
      } else {
        await Promise.all([
          session.page.waitForNavigation({ timeout: args.timeout }).catch(() => {}),
          session.page.press(passwordSelector, 'Enter')
        ]);
      }

      // Wait for login to complete
      let loginSuccess = false;
      let finalUrl = session.page.url();

      if (args.waitForUrl) {
        try {
          await session.page.waitForURL(args.waitForUrl, { timeout: args.timeout });
          loginSuccess = true;
        } catch {
          loginSuccess = false;
        }
      } else if (args.waitForSelector) {
        try {
          await session.page.waitForSelector(args.waitForSelector, { 
            timeout: args.timeout,
            state: 'visible' 
          });
          loginSuccess = true;
        } catch {
          loginSuccess = false;
        }
      } else {
        // Check if we navigated away from login page
        await session.page.waitForTimeout(3000);
        finalUrl = session.page.url();
        loginSuccess = finalUrl !== args.loginUrl && !finalUrl.includes('login');
      }

      // Update session state
      session.url = finalUrl;
      session.navigationHistory.push(finalUrl);

      // Take screenshot of result page
      const resultScreenshot = await session.page.screenshot({ fullPage: false });

      return this.createResult({
        success: loginSuccess,
        sessionId: session.id,
        loginUrl: args.loginUrl,
        finalUrl,
        navigationHistory: session.navigationHistory,
        detectedFields: {
          usernameSelector,
          passwordSelector,
          submitSelector
        },
        screenshots: {
          form: formScreenshot.toString('base64'),
          result: resultScreenshot.toString('base64')
        }
      });

    } catch (error: any) {
      return this.createError(`Login flow failed: ${error.message}`, {
        sessionId: session.id,
        loginUrl: args.loginUrl
      });
    }
  }

  private async detectUsernameField(page: any): Promise<string | null> {
    const selectors = [
      'input[type="email"]',
      'input[type="text"][name*="user"]',
      'input[type="text"][name*="email"]',
      'input[type="text"][name*="login"]',
      'input[type="text"][id*="user"]',
      'input[type="text"][id*="email"]',
      'input[type="text"][placeholder*="email" i]',
      'input[type="text"][placeholder*="username" i]',
      'input[type="text"][aria-label*="email" i]',
      'input[type="text"][aria-label*="username" i]'
    ];

    for (const selector of selectors) {
      const element = await page.$(selector);
      if (element && await element.isVisible()) {
        return selector;
      }
    }

    // Fallback: first visible text input
    const firstText = await page.$('input[type="text"]:visible');
    return firstText ? 'input[type="text"]:visible' : null;
  }

  private async detectPasswordField(page: any): Promise<string | null> {
    const selectors = [
      'input[type="password"]',
      'input[name*="pass" i]',
      'input[id*="pass" i]',
      'input[placeholder*="password" i]',
      'input[aria-label*="password" i]'
    ];

    for (const selector of selectors) {
      const element = await page.$(selector);
      if (element && await element.isVisible()) {
        return selector;
      }
    }

    return null;
  }

  private async detectSubmitButton(page: any): Promise<string | null> {
    const selectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Log in")',
      'button:has-text("Sign in")',
      'button:has-text("Login")',
      '*[role="button"]:has-text("Log in")',
      '*[role="button"]:has-text("Sign in")'
    ];

    for (const selector of selectors) {
      const element = await page.$(selector);
      if (element && await element.isVisible()) {
        return selector;
      }
    }

    return null;
  }
}