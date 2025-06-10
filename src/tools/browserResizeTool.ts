/**
 * Browser resize tool for viewport control
 * Provides viewport size adjustment and responsive testing capabilities
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {BrowserResizeArgs, NavigationToolContext, ToolResult} from '../types/index.js';
import {BrowserResizeArgsSchema} from '../types/index.js';

export class BrowserResizeTool extends BaseTool {
    public readonly name = 'browser_resize';
    public readonly description = 'Resize browser viewport for responsive testing and layout validation';
    public readonly inputSchema = zodToJsonSchema(BrowserResizeArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<BrowserResizeArgs>(args, BrowserResizeArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        try {
            // Get current viewport information
            const beforeResize = await this.getViewportInfo(session.page);

            // Set new viewport size
            await session.page.setViewportSize({
                width: validatedArgs.width,
                height: validatedArgs.height
            });

            // Set device scale factor if different from default
            if (validatedArgs.deviceScaleFactor !== 1) {
                await session.page.setExtraHTTPHeaders({
                    'Device-Pixel-Ratio': validatedArgs.deviceScaleFactor.toString()
                });
            }

            // Wait for any layout changes to complete
            await session.page.waitForTimeout(500);

            // Get updated viewport information
            const afterResize = await this.getViewportInfo(session.page);

            // Detect responsive design changes
            const responsiveAnalysis = await this.analyzeResponsiveChanges(session.page, beforeResize, afterResize);

            // Take screenshot for visual comparison if significant changes detected
            let screenshot = null;
            if (responsiveAnalysis.significantChanges) {
                screenshot = await session.page.screenshot({
                    fullPage: false,
                    type: 'png'
                });
            }

            // Update session
            session.lastActivity = new Date();

            return this.createResult({
                sessionId: session.id,
                url: session.url,
                navigationHistory: session.navigationHistory,
                hasConsentHandled: session.hasConsentHandled,
                timestamp: new Date().toISOString(),
                resize: {
                    success: true,
                    before: beforeResize,
                    after: afterResize,
                    requested: {
                        width: validatedArgs.width,
                        height: validatedArgs.height,
                        deviceScaleFactor: validatedArgs.deviceScaleFactor
                    },
                    changes: {
                        widthChanged: beforeResize.width !== afterResize.width,
                        heightChanged: beforeResize.height !== afterResize.height,
                        aspectRatioChanged: this.calculateAspectRatio(beforeResize.width, beforeResize.height) !==
                            this.calculateAspectRatio(afterResize.width, afterResize.height),
                        deviceClassChanged: this.getDeviceClass(beforeResize.width) !== this.getDeviceClass(afterResize.width)
                    },
                    responsiveAnalysis,
                    screenshotCaptured: !!screenshot
                }
            });

        } catch (error) {
            throw new Error(`Viewport resize failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async getViewportInfo(page: any) {
        try {
            return await page.evaluate(() => {
                return {
                    width: window.innerWidth,
                    height: window.innerHeight,
                    devicePixelRatio: window.devicePixelRatio,
                    screenWidth: window.screen.width,
                    screenHeight: window.screen.height,
                    availWidth: window.screen.availWidth,
                    availHeight: window.screen.availHeight,
                    orientation: window.screen.orientation ? {
                        angle: window.screen.orientation.angle,
                        type: window.screen.orientation.type
                    } : null,
                    documentWidth: document.documentElement.scrollWidth,
                    documentHeight: document.documentElement.scrollHeight,
                    bodyWidth: document.body ? document.body.scrollWidth : 0,
                    bodyHeight: document.body ? document.body.scrollHeight : 0
                };
            });
        } catch (error) {
            return {
                width: 0,
                height: 0,
                devicePixelRatio: 1,
                screenWidth: 0,
                screenHeight: 0,
                availWidth: 0,
                availHeight: 0,
                orientation: null,
                documentWidth: 0,
                documentHeight: 0,
                bodyWidth: 0,
                bodyHeight: 0,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private async analyzeResponsiveChanges(page: any, before: any, after: any) {
        try {
            const analysis = await page.evaluate((beforeInfo: any, afterInfo: any) => {
                // Check for media query changes
                const mediaQueries = [
                    '(max-width: 768px)',
                    '(max-width: 1024px)',
                    '(max-width: 1200px)',
                    '(min-width: 769px)',
                    '(min-width: 1025px)',
                    '(orientation: portrait)',
                    '(orientation: landscape)'
                ];

                const mediaQueryChanges: string[] = [];
                mediaQueries.forEach(query => {
                    if (window.matchMedia(query).matches) {
                        mediaQueryChanges.push(query);
                    }
                });

                // Check for layout changes (simplified)
                const elements = document.querySelectorAll('*');
                let hiddenElements = 0;
                let visibleElements = 0;

                elements.forEach(el => {
                    const style = getComputedStyle(el);
                    if (style.display === 'none') {
                        hiddenElements++;
                    } else {
                        visibleElements++;
                    }
                });

                // Check for navigation changes
                const navElements = document.querySelectorAll('nav, .nav, .navigation, .menu');
                const navVisible = Array.from(navElements).some(el =>
                    getComputedStyle(el).display !== 'none'
                );

                return {
                    mediaQueryMatches: mediaQueryChanges,
                    elementCounts: {
                        hidden: hiddenElements,
                        visible: visibleElements,
                        total: elements.length
                    },
                    navigationVisible: navVisible,
                    hasHamburgerMenu: !!document.querySelector('.hamburger, .menu-toggle, .mobile-menu-toggle'),
                    hasSidebar: !!document.querySelector('.sidebar, .side-nav, aside'),
                    documentChanges: {
                        widthDelta: afterInfo.documentWidth - beforeInfo.documentWidth,
                        heightDelta: afterInfo.documentHeight - beforeInfo.documentHeight
                    }
                };
            }, before, after);

            // Determine if changes are significant
            const significantChanges =
                Math.abs(analysis.documentChanges.widthDelta) > 50 ||
                Math.abs(analysis.documentChanges.heightDelta) > 100 ||
                analysis.mediaQueryMatches.length > 0 ||
                this.getDeviceClass(before.width) !== this.getDeviceClass(after.width);

            return {
                ...analysis,
                significantChanges,
                deviceClassBefore: this.getDeviceClass(before.width),
                deviceClassAfter: this.getDeviceClass(after.width)
            };

        } catch (error) {
            return {
                mediaQueryMatches: [],
                elementCounts: {hidden: 0, visible: 0, total: 0},
                navigationVisible: false,
                hasHamburgerMenu: false,
                hasSidebar: false,
                documentChanges: {widthDelta: 0, heightDelta: 0},
                significantChanges: false,
                deviceClassBefore: 'unknown',
                deviceClassAfter: 'unknown',
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }

    private calculateAspectRatio(width: number, height: number): string {
        if (height === 0) return '0:0';

        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const divisor = gcd(width, height);

        return `${width / divisor}:${height / divisor}`;
    }

    private getDeviceClass(width: number): string {
        if (width < 576) return 'mobile';
        if (width < 768) return 'mobile-large';
        if (width < 992) return 'tablet';
        if (width < 1200) return 'laptop';
        if (width < 1400) return 'desktop';
        return 'large-desktop';
    }

    // Helper method to get common device presets
    private getDevicePresets() {
        return {
            'mobile': {width: 375, height: 667, deviceScaleFactor: 2}, // iPhone SE
            'mobile-large': {width: 414, height: 896, deviceScaleFactor: 3}, // iPhone 11 Pro
            'tablet': {width: 768, height: 1024, deviceScaleFactor: 2}, // iPad
            'laptop': {width: 1024, height: 768, deviceScaleFactor: 1}, // Laptop
            'desktop': {width: 1280, height: 720, deviceScaleFactor: 1}, // Desktop
            'large-desktop': {width: 1920, height: 1080, deviceScaleFactor: 1} // Large Desktop
        };
    }
}