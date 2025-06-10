/**
 * Browser generate playwright test tool for test creation
 * Provides automated test generation capabilities based on user interactions
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserGenerateTestArgs, NavigationToolContext, ToolResult} from '../types/index.js';
import {BrowserGenerateTestArgsSchema} from '../types/index.js';
import * as fs from 'fs';
import * as path from 'path';

export class BrowserGenerateTestTool extends BaseTool {
    public readonly name = 'browser_generate_playwright_test';
    public readonly description = 'Generate Playwright test scripts based on recorded browser interactions';
    public readonly inputSchema = zodToJsonSchema(BrowserGenerateTestArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserGenerateTestArgs>(args, BrowserGenerateTestArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Get session information for test generation
            const sessionInfo = await this.getSessionInfo(session);

            // Generate test content based on navigation history and interactions
            const testContent = this.generateTestContent(
                sessionInfo,
                validatedArgs.testName,
                validatedArgs.language,
                validatedArgs.includeAssertions
            );

            // Ensure output directory exists
            const outputDir = path.dirname(validatedArgs.outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, {recursive: true});
            }

            // Write test file
            fs.writeFileSync(validatedArgs.outputPath, testContent);

            // Get file statistics
            const stats = fs.statSync(validatedArgs.outputPath);

            // Update session
            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                testGeneration: {
                    success: true,
                    outputPath: validatedArgs.outputPath,
                    testName: validatedArgs.testName,
                    language: validatedArgs.language,
                    includeAssertions: validatedArgs.includeAssertions,
                    fileSize: stats.size,
                    linesGenerated: testContent.split('\n').length,
                    sessionInfo,
                    generatedAt: new Date().toISOString()
                }
            });

        } catch (error) {
            throw new Error(`Test generation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getSessionInfo(session: any) {
        try {
            const pageInfo = await session.page.evaluate(() => {
                return {
                    title: document.title,
                    url: window.location.href,
                    forms: Array.from(document.forms).map(form => ({
                        id: form.id || null,
                        name: form.name || null,
                        action: form.action,
                        method: form.method,
                        inputCount: form.querySelectorAll('input, select, textarea').length
                    })),
                    links: Array.from(document.links).slice(0, 10).map(link => ({
                        href: link.href,
                        text: link.textContent?.trim() || '',
                        id: link.id || null
                    })),
                    buttons: Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).slice(0, 10).map(button => ({
                        text: button.textContent?.trim() || (button as HTMLInputElement).value || '',
                        id: button.id || null,
                        type: (button as HTMLInputElement).type || 'button'
                    })),
                    inputs: Array.from(document.querySelectorAll('input, select, textarea')).slice(0, 10).map(input => ({
                        id: input.id || null,
                        name: (input as HTMLInputElement).name || null,
                        type: (input as HTMLInputElement).type || input.tagName.toLowerCase(),
                        placeholder: (input as HTMLInputElement).placeholder || null
                    }))
                };
            });

            return {
                sessionId: session.id,
                startUrl: session.navigationHistory[0] || session.url,
                currentUrl: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                pageInfo,
                sessionDuration: Date.now() - new Date(session.createdAt).getTime()
            };
        } catch (error) {
            return {
                sessionId: session.id,
                startUrl: session.url,
                currentUrl: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                pageInfo: {
                    title: 'Unknown',
                    url: session.url,
                    forms: [],
                    links: [],
                    buttons: [],
                    inputs: []
                },
                sessionDuration: 0,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private generateTestContent(sessionInfo: any, testName: string, language: string, includeAssertions: boolean): string {
        switch (language) {
            case 'typescript':
                return this.generateTypeScriptTest(sessionInfo, testName, includeAssertions);
            case 'javascript':
                return this.generateJavaScriptTest(sessionInfo, testName, includeAssertions);
            case 'python':
                return this.generatePythonTest(sessionInfo, testName, includeAssertions);
            case 'java':
                return this.generateJavaTest(sessionInfo, testName, includeAssertions);
            case 'csharp':
                return this.generateCSharpTest(sessionInfo, testName, includeAssertions);
            default:
                return this.generateTypeScriptTest(sessionInfo, testName, includeAssertions);
        }
    }

    private generateTypeScriptTest(sessionInfo: any, testName: string, includeAssertions: boolean): string {
        const testSteps = this.generateTestSteps(sessionInfo, 'typescript');
        const assertions = includeAssertions ? this.generateAssertions(sessionInfo, 'typescript') : '';

        return `import { test, expect } from '@playwright/test';

test('${testName}', async ({ page }) => {
  // Generated test based on session: ${sessionInfo.sessionId}
  // Navigation history: ${sessionInfo.navigationHistory.join(' -> ')}
  
  // Navigate to starting URL
  await page.goto('${sessionInfo.startUrl}');
  
  ${sessionInfo.hasConsentHandled ? '// Cookie consent was handled during session' : ''}
  
  ${testSteps}
  
  ${assertions}
});

// Test metadata
// Generated on: ${new Date().toISOString()}
// Session duration: ${Math.round(sessionInfo.sessionDuration / 1000)}s
// Pages visited: ${sessionInfo.navigationHistory.length}
`;
    }

    private generateJavaScriptTest(sessionInfo: any, testName: string, includeAssertions: boolean): string {
        const testSteps = this.generateTestSteps(sessionInfo, 'javascript');
        const assertions = includeAssertions ? this.generateAssertions(sessionInfo, 'javascript') : '';

        return `const { test, expect } = require('@playwright/test');

test('${testName}', async ({ page }) => {
  // Generated test based on session: ${sessionInfo.sessionId}
  // Navigation history: ${sessionInfo.navigationHistory.join(' -> ')}
  
  // Navigate to starting URL
  await page.goto('${sessionInfo.startUrl}');
  
  ${sessionInfo.hasConsentHandled ? '// Cookie consent was handled during session' : ''}
  
  ${testSteps}
  
  ${assertions}
});
`;
    }

    private generatePythonTest(sessionInfo: any, testName: string, includeAssertions: boolean): string {
        const testSteps = this.generateTestSteps(sessionInfo, 'python');
        const assertions = includeAssertions ? this.generateAssertions(sessionInfo, 'python') : '';

        return `import pytest
from playwright.sync_api import Page, expect

def test_${testName.toLowerCase().replace(/[^a-z0-9]/g, '_')}(page: Page):
    """
    Generated test based on session: ${sessionInfo.sessionId}
    Navigation history: ${sessionInfo.navigationHistory.join(' -> ')}
    """
    
    # Navigate to starting URL
    page.goto("${sessionInfo.startUrl}")
    
    ${sessionInfo.hasConsentHandled ? '# Cookie consent was handled during session' : ''}
    
    ${testSteps}
    
    ${assertions}
`;
    }

    private generateJavaTest(sessionInfo: any, testName: string, includeAssertions: boolean): string {
        const className = testName.replace(/[^a-zA-Z0-9]/g, '') + 'Test';
        const testSteps = this.generateTestSteps(sessionInfo, 'java');
        const assertions = includeAssertions ? this.generateAssertions(sessionInfo, 'java') : '';

        return `import com.microsoft.playwright.*;
import org.junit.jupiter.api.Test;

public class ${className} {
    
    @Test
    void ${testName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '')}() {
        // Generated test based on session: ${sessionInfo.sessionId}
        // Navigation history: ${sessionInfo.navigationHistory.join(' -> ')}
        
        try (Playwright playwright = Playwright.create()) {
            Browser browser = playwright.chromium().launch();
            BrowserContext context = browser.newContext();
            Page page = context.newPage();
            
            // Navigate to starting URL
            page.navigate("${sessionInfo.startUrl}");
            
            ${sessionInfo.hasConsentHandled ? '// Cookie consent was handled during session' : ''}
            
            ${testSteps}
            
            ${assertions}
            
            browser.close();
        }
    }
}
`;
    }

    private generateCSharpTest(sessionInfo: any, testName: string, includeAssertions: boolean): string {
        const className = testName.replace(/[^a-zA-Z0-9]/g, '') + 'Test';
        const testSteps = this.generateTestSteps(sessionInfo, 'csharp');
        const assertions = includeAssertions ? this.generateAssertions(sessionInfo, 'csharp') : '';

        return `using Microsoft.Playwright;
using Microsoft.Playwright.NUnit;
using NUnit.Framework;

[TestFixture]
public class ${className} : PageTest
{
    [Test]
    public async Task ${testName.replace(/ /g, "")}()
    {
        // Generated test based on session: ${sessionInfo.sessionId}
        // Navigation history: ${sessionInfo.navigationHistory.join(' -> ')}
        
        // Navigate to starting URL
        await Page.GotoAsync("${sessionInfo.startUrl}");
        
        ${sessionInfo.hasConsentHandled ? '// Cookie consent was handled during session' : ''}
        
        ${testSteps}
        
        ${assertions}
    }
}
`;
    }

    private generateTestSteps(sessionInfo: any, language: string): string {
        const steps: string[] = [];

        // Generate navigation steps
        sessionInfo.navigationHistory.slice(1).forEach((url: string, index: number) => {
            if (language === 'python') {
                steps.push(`    # Navigate to page ${index + 2}`);
                steps.push(`    page.goto("${url}")`);
            } else if (language === 'java') {
                steps.push(`            // Navigate to page ${index + 2}`);
                steps.push(`            page.navigate("${url}");`);
            } else if (language === 'csharp') {
                steps.push(`        // Navigate to page ${index + 2}`);
                steps.push(`        await Page.GotoAsync("${url}");`);
            } else {
                steps.push(`  // Navigate to page ${index + 2}`);
                steps.push(`  await page.goto('${url}');`);
            }
        });

        // Generate interaction steps based on page elements
        if (sessionInfo.pageInfo.forms.length > 0) {
            steps.push('');
            steps.push('  // Form interactions (customize as needed)');
            sessionInfo.pageInfo.forms.forEach((form: any, index: number) => {
                if (language === 'python') {
                    steps.push(`    # Form ${index + 1}: ${form.action || 'unknown action'}`);
                } else {
                    steps.push(`  // Form ${index + 1}: ${form.action || 'unknown action'}`);
                }
            });
        }

        if (sessionInfo.pageInfo.buttons.length > 0) {
            steps.push('');
            steps.push('  // Button interactions (customize as needed)');
            sessionInfo.pageInfo.buttons.slice(0, 3).forEach((button: any) => {
                const selector = button.id ? `#${button.id}` : `text=${button.text}`;
                if (language === 'python') {
                    steps.push(`    # page.click("${selector}")`);
                } else if (language === 'java') {
                    steps.push(`            // page.click("${selector}");`);
                } else if (language === 'csharp') {
                    steps.push(`        // await Page.ClickAsync("${selector}");`);
                } else {
                    steps.push(`  // await page.click('${selector}');`);
                }
            });
        }

        return steps.join('\n');
    }

    private generateAssertions(sessionInfo: any, language: string): string {
        const assertions: string[] = [];

        // Page title assertion
        if (sessionInfo.pageInfo.title && sessionInfo.pageInfo.title !== 'Unknown') {
            if (language === 'python') {
                assertions.push(`    # Verify page title`);
                assertions.push(`    expect(page).to_have_title("${sessionInfo.pageInfo.title}")`);
            } else if (language === 'java') {
                assertions.push(`            // Verify page title`);
                assertions.push(`            assertThat(page.title()).isEqualTo("${sessionInfo.pageInfo.title}");`);
            } else if (language === 'csharp') {
                assertions.push(`        // Verify page title`);
                assertions.push(`        await Expect(Page).ToHaveTitleAsync("${sessionInfo.pageInfo.title}");`);
            } else {
                assertions.push(`  // Verify page title`);
                assertions.push(`  await expect(page).toHaveTitle('${sessionInfo.pageInfo.title}');`);
            }
        }

        // URL assertion
        if (language === 'python') {
            assertions.push(`    # Verify current URL`);
            assertions.push(`    expect(page).to_have_url("${sessionInfo.currentUrl}")`);
        } else if (language === 'java') {
            assertions.push(`            // Verify current URL`);
            assertions.push(`            assertThat(page.url()).isEqualTo("${sessionInfo.currentUrl}");`);
        } else if (language === 'csharp') {
            assertions.push(`        // Verify current URL`);
            assertions.push(`        await Expect(Page).ToHaveURLAsync("${sessionInfo.currentUrl}");`);
        } else {
            assertions.push(`  // Verify current URL`);
            assertions.push(`  await expect(page).toHaveURL('${sessionInfo.currentUrl}');`);
        }

        // Element visibility assertions
        if (sessionInfo.pageInfo.buttons.length > 0) {
            const button = sessionInfo.pageInfo.buttons[0];
            const selector = button.id ? `#${button.id}` : `text=${button.text}`;

            if (language === 'python') {
                assertions.push(`    # Verify button is visible`);
                assertions.push(`    expect(page.locator("${selector}")).to_be_visible()`);
            } else if (language === 'java') {
                assertions.push(`            // Verify button is visible`);
                assertions.push(`            assertThat(page.locator("${selector}")).isVisible();`);
            } else if (language === 'csharp') {
                assertions.push(`        // Verify button is visible`);
                assertions.push(`        await Expect(Page.Locator("${selector}")).ToBeVisibleAsync();`);
            } else {
                assertions.push(`  // Verify button is visible`);
                assertions.push(`  await expect(page.locator('${selector}')).toBeVisible();`);
            }
        }

        return assertions.join('\n');
    }
}