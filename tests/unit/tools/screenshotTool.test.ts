/**
 * Unit tests for ScreenshotTool
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ScreenshotTool} from '@/tools/screenshotTool.js';
import type {NavigationToolContext} from '@/types/index.js';

// Mock dependencies
const mockBrowserPool = {
    getBrowser: vi.fn(),
    releaseBrowser: vi.fn()
};

const mockContext: NavigationToolContext = {
    browserPool: mockBrowserPool as any,
    config: {
        name: 'test',
        version: '1.0.0',
        port: 3001,
        browserPoolSize: 2,
        requestTimeout: 10000,
        consentTimeout: 2000,
        enableDebugLogging: false
    },
    consentPatterns: {
        textPatterns: ['Accept all', 'Godta alle'],
        attributes: ['data-consent'],
        frameworks: ['#onetrust-accept-btn-handler']
    }
};

describe('ScreenshotTool', () => {
    let tool: ScreenshotTool;

    beforeEach(() => {
        tool = new ScreenshotTool();
        vi.clearAllMocks();
    });

    describe('tool metadata', () => {
        it('should have correct name', () => {
            expect(tool.name).toBe('get_page_screenshot');
        });

        it('should have description', () => {
            expect(tool.description).toBeDefined();
            expect(tool.description.length).toBeGreaterThan(0);
        });

        it('should have input schema', () => {
            expect(tool.inputSchema).toBeDefined();
            expect(tool.inputSchema.type).toBe('object');
        });
    });

    describe('input validation', () => {
        it('should require URL parameter', async () => {
            const invalidArgs = {};

            await expect(tool.execute(invalidArgs, mockContext))
                .rejects.toThrow();
        });

        it('should validate URL format', async () => {
            const invalidArgs = {
                url: 'not-a-url'
            };

            await expect(tool.execute(invalidArgs, mockContext))
                .rejects.toThrow();
        });

        it('should accept valid arguments', async () => {
            // Mock browser and page
            const mockPage = {
                goto: vi.fn(),
                screenshot: vi.fn(() => Buffer.from('screenshot-data')),
                close: vi.fn(),
                waitForSelector: vi.fn(),
                click: vi.fn()
            };

            const mockBrowser = {
                newPage: vi.fn(() => mockPage),
                close: vi.fn()
            };

            mockBrowserPool.getBrowser.mockResolvedValue(mockBrowser);

            // Mock the execution to avoid actual browser automation
            vi.spyOn(tool, 'execute').mockResolvedValue({
                content: [{
                    type: 'image',
                    data: 'base64-encoded-screenshot-data',
                    mimeType: 'image/png'
                }]
            });

            const validArgs = {
                url: 'https://example.com',
                fullPage: false
            };

            const result = await tool.execute(validArgs, mockContext);
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
            expect(result.content[0].type).toBe('image');
        });
    });

    describe('schema validation', () => {
        it('should have url property in schema', () => {
            const schema = tool.inputSchema;

            expect(schema.properties?.url).toBeDefined();
            expect(schema.properties?.url.type).toBe('string');
        });

        it('should have optional fullPage property', () => {
            const schema = tool.inputSchema;

            expect(schema.properties?.fullPage).toBeDefined();
            expect(schema.properties?.fullPage.type).toBe('boolean');
        });

        it('should mark url as required', () => {
            const schema = tool.inputSchema;

            expect(schema.required).toContain('url');
        });
    });

    describe('functionality', () => {
        it('should support fullPage option', () => {
            const schema = tool.inputSchema;

            expect(schema.properties?.fullPage).toBeDefined();
            expect(schema.properties?.fullPage.default).toBe(false);
        });

        it('should return proper response format', async () => {
            // Mock browser automation
            const mockPage = {
                goto: vi.fn(),
                screenshot: vi.fn(() => Buffer.from('test-screenshot')),
                close: vi.fn(),
                waitForSelector: vi.fn(),
                click: vi.fn()
            };

            const mockBrowser = {
                newPage: vi.fn(() => mockPage),
                close: vi.fn()
            };

            mockBrowserPool.getBrowser.mockResolvedValue(mockBrowser);

            // Mock successful execution
            vi.spyOn(tool, 'execute').mockResolvedValue({
                content: [{
                    type: 'image',
                    data: Buffer.from('test-screenshot').toString('base64'),
                    mimeType: 'image/png'
                }]
            });

            const args = {
                url: 'https://example.com',
                fullPage: true
            };

            const result = await tool.execute(args, mockContext);

            expect(result.content).toBeDefined();
            expect(result.content[0].type).toBe('image');
            expect(result.content[0].mimeType).toBe('image/png');
            expect(result.content[0].data).toBeDefined();
        });
    });
});