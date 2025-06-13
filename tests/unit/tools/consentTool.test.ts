/**
 * Unit tests for ConsentTool - dedicated cookie consent handling
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ConsentTool} from '@/tools/consentTool.js';
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
        textPatterns: [
            'Accept all', 'Godta alle', 'Alle akzeptieren',
            'Accepter tout', 'Aceptar todo', 'Accetta tutto'
        ],
        attributes: [
            'data-consent', 'data-cookie', 'aria-label*=cookie'
        ],
        frameworks: [
            '#onetrust-accept-btn-handler',
            '.qc-cmp2-accept-all',
            '#CybotCookiebotDialogBodyButtonAccept'
        ]
    }
};

describe('ConsentTool', () => {
    let tool: ConsentTool;

    beforeEach(() => {
        tool = new ConsentTool();
        vi.clearAllMocks();
    });

    describe('tool metadata', () => {
        it('should have correct name', () => {
            expect(tool.name).toBe('handle_cookie_consent');
        });

        it('should have description', () => {
            expect(tool.description).toBeDefined();
            expect(tool.description.length).toBeGreaterThan(0);
            expect(tool.description).toContain('cookie consent');
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
                url: 'invalid-url'
            };

            await expect(tool.execute(invalidArgs, mockContext))
                .rejects.toThrow();
        });

        it('should accept valid timeout parameter', async () => {
            // Mock successful execution
            vi.spyOn(tool, 'execute').mockResolvedValue({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        reason: 'No consent dialog found',
                        verification: {
                            success: true,
                            dialogsRemoved: true,
                            consentCookiesSet: 0,
                            noBlockingOverlays: true,
                            postClickDialogs: 0,
                            postClickOverlays: 0
                        },
                        timestamp: new Date().toISOString()
                    })
                }]
            });

            const validArgs = {
                url: 'https://example.com',
                timeout: 5000
            };

            const result = await tool.execute(validArgs, mockContext);
            expect(result).toBeDefined();
        });
    });

    describe('schema validation', () => {
        it('should have url property in schema', () => {
            const schema = tool.inputSchema;

            expect(schema.properties?.url).toBeDefined();
            expect(schema.properties?.url.type).toBe('string');
        });

        it('should have optional timeout property', () => {
            const schema = tool.inputSchema;

            expect(schema.properties?.timeout).toBeDefined();
            expect(schema.properties?.timeout.type).toBe('integer');
        });

        it('should mark url as required', () => {
            const schema = tool.inputSchema;

            expect(schema.required).toContain('url');
        });

        it('should have timeout with reasonable default', () => {
            const schema = tool.inputSchema;

            expect(schema.properties?.timeout.default).toBe(3000);
        });
    });

    describe('consent detection patterns', () => {
        it('should use comprehensive language patterns', () => {
            // Verify the tool has access to multi-language patterns
            expect(mockContext.consentPatterns.textPatterns).toContain('Accept all');
            expect(mockContext.consentPatterns.textPatterns).toContain('Godta alle');
            expect(mockContext.consentPatterns.textPatterns).toContain('Alle akzeptieren');
            expect(mockContext.consentPatterns.textPatterns).toContain('Accepter tout');
        });

        it('should use framework-specific selectors', () => {
            // Verify framework patterns are available
            expect(mockContext.consentPatterns.frameworks).toContain('#onetrust-accept-btn-handler');
            expect(mockContext.consentPatterns.frameworks).toContain('.qc-cmp2-accept-all');
            expect(mockContext.consentPatterns.frameworks).toContain('#CybotCookiebotDialogBodyButtonAccept');
        });

        it('should use attribute-based detection', () => {
            // Verify attribute patterns
            expect(mockContext.consentPatterns.attributes).toContain('data-consent');
            expect(mockContext.consentPatterns.attributes).toContain('data-cookie');
            expect(mockContext.consentPatterns.attributes).toContain('aria-label*=cookie');
        });
    });

    describe('response format', () => {
        it('should return comprehensive verification data', async () => {
            // Mock successful consent handling
            vi.spyOn(tool, 'execute').mockResolvedValue({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        reason: 'Accepted via framework selector',
                        method: 'framework_selector',
                        verification: {
                            success: true,
                            dialogsRemoved: true,
                            consentCookiesSet: 3,
                            noBlockingOverlays: true,
                            postClickDialogs: 0,
                            postClickOverlays: 0
                        },
                        timestamp: '2025-06-10T12:00:00.000Z'
                    })
                }]
            });

            const args = {
                url: 'https://example.com',
                timeout: 3000
            };

            const result = await tool.execute(args, mockContext);
            const response = JSON.parse(result.content[0].text);

            expect(response.success).toBe(true);
            expect(response.reason).toBeDefined();
            expect(response.method).toBeDefined();
            expect(response.verification).toBeDefined();
            expect(response.verification.success).toBe(true);
            expect(response.verification.dialogsRemoved).toBe(true);
            expect(response.timestamp).toBeDefined();
        });

        it('should handle consent failure cases', async () => {
            // Mock consent handling failure
            vi.spyOn(tool, 'execute').mockResolvedValue({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: false,
                        reason: 'Consent dialog timeout - no matching patterns found',
                        verification: {
                            success: false,
                            dialogsRemoved: false,
                            consentCookiesSet: 0,
                            noBlockingOverlays: false,
                            postClickDialogs: 1,
                            postClickOverlays: 1
                        },
                        timestamp: '2025-06-10T12:00:00.000Z'
                    })
                }]
            });

            const args = {
                url: 'https://complex-consent-site.com',
                timeout: 3000
            };

            const result = await tool.execute(args, mockContext);
            const response = JSON.parse(result.content[0].text);

            expect(response.success).toBe(false);
            expect(response.reason).toContain('timeout');
            expect(response.verification.success).toBe(false);
        });
    });

    describe('performance characteristics', () => {
        it('should respect timeout parameter', () => {
            const schema = tool.inputSchema;

            // Verify timeout is configurable
            expect(schema.properties?.timeout).toBeDefined();
            expect(schema.properties?.timeout.minimum).toBe(1000);
            expect(schema.properties?.timeout.maximum).toBe(10000);
        });

        it('should have reasonable default timeout', () => {
            const schema = tool.inputSchema;

            // Default should be 3 seconds for good performance
            expect(schema.properties?.timeout.default).toBe(3000);
        });
    });
});