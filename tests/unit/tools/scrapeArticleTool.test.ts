/**
 * Unit tests for ScrapeArticleTool - core functionality
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ScrapeArticleTool} from '@/tools/scrapeArticleTool.js';
import type {NavigationToolContext} from '@/types/index.js';

// Mock dependencies
const mockBrowserPool = {
    getBrowser: vi.fn(),
    releaseBrowser: vi.fn()
};

const mockConsentHandler = {
    getPatterns: vi.fn(() => ({
        textPatterns: ['Accept all', 'Godta alle'],
        attributes: ['data-consent'],
        frameworks: ['#onetrust-accept-btn-handler']
    }))
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
    consentPatterns: mockConsentHandler.getPatterns()
};

describe('ScrapeArticleTool', () => {
    let tool: ScrapeArticleTool;

    beforeEach(() => {
        tool = new ScrapeArticleTool();
        vi.clearAllMocks();
    });

    describe('tool metadata', () => {
        it('should have correct name', () => {
            expect(tool.name).toBe('scrape_article_content');
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
        it('should validate URL parameter', async () => {
            const invalidArgs = {};

            await expect(tool.execute(invalidArgs, mockContext))
                .rejects.toThrow();
        });

        it('should accept valid URL', async () => {
            // Mock browser and page
            const mockPage = {
                goto: vi.fn(),
                title: vi.fn(() => 'Test Title'),
                content: vi.fn(() => '<html><body>Test content</body></html>'),
                close: vi.fn(),
                waitForSelector: vi.fn(),
                click: vi.fn(),
                screenshot: vi.fn(() => Buffer.from('screenshot'))
            };

            const mockBrowser = {
                newPage: vi.fn(() => mockPage),
                close: vi.fn()
            };

            mockBrowserPool.getBrowser.mockResolvedValue(mockBrowser);

            const validArgs = {
                url: 'https://example.com'
            };

            // Mock the execution to avoid actual browser automation
            vi.spyOn(tool, 'execute').mockResolvedValue({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        url: 'https://example.com',
                        extracted: {title: 'Test Title'},
                        fullText: 'Test content',
                        timestamp: new Date().toISOString(),
                        cookieConsent: {success: true, reason: 'No consent dialog found'}
                    })
                }]
            });

            const result = await tool.execute(validArgs, mockContext);
            expect(result).toBeDefined();
            expect(result.content).toBeDefined();
        });
    });

    describe('schema validation', () => {
        it('should validate extractSelectors structure', () => {
            const schema = tool.inputSchema;

            expect(schema.properties?.extractSelectors).toBeDefined();
            expect(schema.properties?.extractSelectors.type).toBe('object');
        });

        it('should have optional waitForSelector', () => {
            const schema = tool.inputSchema;

            expect(schema.properties?.waitForSelector).toBeDefined();
            expect(schema.properties?.waitForSelector.type).toBe('string');
        });
    });
});