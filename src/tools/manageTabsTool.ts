/**
 * Tab management tool for creating, switching, and closing browser tabs
 * Provides comprehensive tab management capabilities
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '@/core/toolRegistry.js';
import type {TabManageArgs, ToolContext, ToolResult} from '@/types/index.js';
import {TabManageArgsSchema} from '@/types/index.js';

export class ManageTabsTool extends BaseTool {
    public readonly name = 'manage_tabs';
    public readonly description = 'Manage browser tabs: list, create new tabs, switch between tabs, or close tabs';
    public readonly inputSchema = zodToJsonSchema(TabManageArgsSchema);

    async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<TabManageArgs>(args, TabManageArgsSchema);

        // Get browser from pool
        const browser = await context.browserPool.getBrowser();
        if (!browser) {
            throw new Error('No browser available from pool');
        }

        try {
            const browserContext = browser.contexts()[0] || await browser.newContext();
            const pages = browserContext.pages();

            switch (validatedArgs.action) {
                case 'list':
                    const tabList = await Promise.all(pages.map(async (page, index) => ({
                        index,
                        url: page.url(),
                        title: await page.title().catch(() => 'Unknown'),
                        active: pages[0] === page // First page is typically active
                    })));

                    return this.createResult({
                        action: 'list',
                        tabs: tabList,
                        totalTabs: pages.length,
                        timestamp: new Date().toISOString()
                    });

                case 'new':
                    const newPage = await browserContext.newPage();
                    if (validatedArgs.url) {
                        await newPage.goto(validatedArgs.url, {
                            waitUntil: 'domcontentloaded',
                            timeout: context.config.requestTimeout
                        });
                    }

                    const newTabIndex = browserContext.pages().length - 1;
                    return this.createResult({
                        action: 'new',
                        tabIndex: newTabIndex,
                        url: validatedArgs.url || 'about:blank',
                        title: await newPage.title().catch(() => 'New Tab'),
                        timestamp: new Date().toISOString()
                    });

                case 'switch':
                    if (validatedArgs.tabIndex === undefined) {
                        throw new Error('tabIndex is required for switch action');
                    }

                    if (validatedArgs.tabIndex < 0 || validatedArgs.tabIndex >= pages.length) {
                        throw new Error(`Invalid tab index ${validatedArgs.tabIndex}. Available tabs: 0-${pages.length - 1}`);
                    }

                    const targetPage = pages[validatedArgs.tabIndex];
                    await targetPage.bringToFront();

                    return this.createResult({
                        action: 'switch',
                        tabIndex: validatedArgs.tabIndex,
                        url: targetPage.url(),
                        title: await targetPage.title().catch(() => 'Unknown'),
                        timestamp: new Date().toISOString()
                    });

                case 'close':
                    if (validatedArgs.tabIndex === undefined) {
                        throw new Error('tabIndex is required for close action');
                    }

                    if (validatedArgs.tabIndex < 0 || validatedArgs.tabIndex >= pages.length) {
                        throw new Error(`Invalid tab index ${validatedArgs.tabIndex}. Available tabs: 0-${pages.length - 1}`);
                    }

                    if (pages.length === 1) {
                        throw new Error('Cannot close the last remaining tab');
                    }

                    const pageToClose = pages[validatedArgs.tabIndex];
                    const closedUrl = pageToClose.url();
                    const closedTitle = await pageToClose.title().catch(() => 'Unknown');

                    await pageToClose.close();

                    return this.createResult({
                        action: 'close',
                        tabIndex: validatedArgs.tabIndex,
                        url: closedUrl,
                        title: closedTitle,
                        remainingTabs: pages.length - 1,
                        timestamp: new Date().toISOString()
                    });

                default:
                    throw new Error(`Unknown action: ${validatedArgs.action}`);
            }

        } catch (error) {
            throw new Error(`Tab management failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            context.browserPool.releaseBrowser(browser);
        }
    }
}