/**
 * Browser install tool for browser management
 * Provides browser installation and management capabilities
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserInstallArgs, ToolContext, ToolResult} from '../types/index.js';
import {BrowserInstallArgsSchema} from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';
import {exec} from 'child_process';
import {promisify} from 'util';

const execAsync = promisify(exec);

export class BrowserInstallTool extends BaseTool {
    public readonly name = 'browser_install';
    public readonly description = 'Install and manage browser installations for testing';
    public readonly inputSchema = zodToJsonSchema(BrowserInstallArgsSchema);

    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserInstallArgs>(args, BrowserInstallArgsSchema);

        try {
            // Check current installation status
            const beforeInstall = await this.getBrowserStatus(validatedArgs.browser);

            // Determine if installation is needed
            if (beforeInstall.installed && !validatedArgs.force) {
                return this.createResult({
                    timestamp: new Date().toISOString(),
                    browserInstall: {
                        success: true,
                        browser: validatedArgs.browser,
                        version: validatedArgs.version,
                        action: 'skip',
                        reason: 'Browser already installed (use force=true to reinstall)',
                        beforeInstall,
                        afterInstall: beforeInstall,
                        installDuration: 0
                    }
                });
            }

            const startTime = Date.now();

            // Perform installation
            const installResult = await this.installBrowser(validatedArgs.browser, validatedArgs.version, validatedArgs.force);

            const endTime = Date.now();
            const installDuration = endTime - startTime;

            // Check installation status after installation
            const afterInstall = await this.getBrowserStatus(validatedArgs.browser);

            return this.createResult({
                timestamp: new Date().toISOString(),
                browserInstall: {
                    success: installResult.success,
                    browser: validatedArgs.browser,
                    version: validatedArgs.version,
                    action: validatedArgs.force ? 'reinstall' : 'install',
                    beforeInstall,
                    afterInstall,
                    installDuration,
                    installOutput: installResult.output,
                    installError: installResult.error
                }
            });

        } catch (error) {
            throw new Error(`Browser installation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getBrowserStatus(browser: string) {
        try {
            // Check if Playwright browser is installed
            const {stdout, stderr} = await execAsync('npx playwright --version');

            const status = {
                installed: false,
                version: '',
                path: '',
                playwrightVersion: stdout.trim(),
                browserPath: '',
                executablePath: '',
                error: stderr || null
            };

            // Try to get browser-specific information
            try {
                const browserCheck = await execAsync(`npx playwright install-deps ${browser}`);
                status.installed = browserCheck.stderr === '';
            } catch {
                // Browser not installed or error checking
            }

            // Try to find browser executable
            const possiblePaths = this.getBrowserPaths(browser);
            for (const browserPath of possiblePaths) {
                if (fs.existsSync(browserPath)) {
                    status.path = browserPath;
                    status.executablePath = browserPath;
                    status.installed = true;
                    break;
                }
            }

            return status;

        } catch (error) {
            return {
                installed: false,
                version: '',
                path: '',
                playwrightVersion: '',
                browserPath: '',
                executablePath: '',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async installBrowser(browser: string, version?: string, force: boolean = false) {
        try {
            // Build installation command
            let installCommand = `npx playwright install ${browser}`;

            if (force) {
                installCommand += ' --force';
            }

            // Add version if specified (note: Playwright may not support specific versions)
            if (version) {
                // Playwright doesn't directly support version selection in install command
                // This would typically be handled through package.json or different installation methods
                console.warn(`Version specification (${version}) may not be supported by Playwright install command`);
            }

            // Execute installation
            const {stdout, stderr} = await execAsync(installCommand, {
                timeout: 300000 // 5 minute timeout
            });

            // Install system dependencies
            try {
                await execAsync(`npx playwright install-deps ${browser}`, {
                    timeout: 300000
                });
            } catch (depsError) {
                console.warn('System dependencies installation may have failed:', depsError);
            }

            return {
                success: stderr === '' || !stderr.includes('Error'),
                output: stdout,
                error: stderr || null,
                command: installCommand
            };

        } catch (error) {
            return {
                success: false,
                output: '',
                error: error instanceof Error ? error.message : String(error),
                command: `npx playwright install ${browser}`
            };
        }
    }

    private getBrowserPaths(browser: string): string[] {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        const paths: string[] = [];

        switch (browser) {
            case 'chromium':
                paths.push(
                    path.join(homeDir, '.cache/ms-playwright/chromium-*/chrome-linux/chrome'),
                    path.join(homeDir, '.cache/ms-playwright/chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium'),
                    path.join(homeDir, '.cache/ms-playwright/chromium-*/chrome-win/chrome.exe')
                );
                break;

            case 'firefox':
                paths.push(
                    path.join(homeDir, '.cache/ms-playwright/firefox-*/firefox/firefox'),
                    path.join(homeDir, '.cache/ms-playwright/firefox-*/firefox/Firefox.app/Contents/MacOS/firefox'),
                    path.join(homeDir, '.cache/ms-playwright/firefox-*/firefox/firefox.exe')
                );
                break;

            case 'webkit':
                paths.push(
                    path.join(homeDir, '.cache/ms-playwright/webkit-*/pw_run.sh'),
                    path.join(homeDir, '.cache/ms-playwright/webkit-*/Playwright.app/Contents/MacOS/Playwright'),
                    path.join(homeDir, '.cache/ms-playwright/webkit-*/Playwright.exe')
                );
                break;

            case 'chrome':
                // Google Chrome system installations
                paths.push(
                    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                    '/usr/bin/google-chrome',
                    '/usr/bin/google-chrome-stable',
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
                );
                break;

            case 'msedge':
                // Microsoft Edge system installations
                paths.push(
                    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
                    '/usr/bin/microsoft-edge',
                    '/usr/bin/microsoft-edge-stable',
                    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
                );
                break;
        }

        return paths;
    }

    // Helper method to check Playwright installation
    private async checkPlaywrightInstallation() {
        try {
            const {stdout} = await execAsync('npx playwright --version');
            return {
                installed: true,
                version: stdout.trim()
            };
        } catch {
            return {
                installed: false,
                version: ''
            };
        }
    }

    // Helper method to get all installed browsers
    private async getAllInstalledBrowsers() {
        const browsers = ['chromium', 'firefox', 'webkit', 'chrome', 'msedge'];
        const results = [];

        for (const browser of browsers) {
            const status = await this.getBrowserStatus(browser);
            results.push({
                browser,
                ...status
            });
        }

        return results;
    }

    // Helper method to validate browser name
    private validateBrowserName(browser: string): boolean {
        const supportedBrowsers = ['chromium', 'firefox', 'webkit', 'chrome', 'msedge'];
        return supportedBrowsers.includes(browser);
    }
}