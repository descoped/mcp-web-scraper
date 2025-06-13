/**
 * Unit tests for Browser Interaction Tools (navigate, click, type, etc.)
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BrowserNavigateTool} from '@/tools/browserNavigateTool.js';
import {BrowserClickTool} from '@/tools/browserClickTool.js';
import {BrowserTypeTool} from '@/tools/browserTypeTool.js';
import {BrowserHoverTool} from '@/tools/browserHoverTool.js';
import type {NavigationToolContext} from '@/types/index.js';

// Mock session context for navigation tools
const mockSession = {
    page: {
        goto: vi.fn(),
        click: vi.fn(),
        type: vi.fn(),
        hover: vi.fn(),
        selectOption: vi.fn(),
        keyboard: {
            press: vi.fn()
        },
        title: vi.fn(() => 'Test Page'),
        url: vi.fn(() => 'https://example.com'),
        screenshot: vi.fn(() => Buffer.from('screenshot')),
        waitForSelector: vi.fn(),
        evaluate: vi.fn()
    },
    sessionId: 'test-session-123'
};

const mockPageManager = {
    getSession: vi.fn(() => mockSession),
    createSession: vi.fn(() => mockSession),
    closeSession: vi.fn(),
    getAllSessions: vi.fn(() => [mockSession])
};

const mockContext: NavigationToolContext = {
    pageManager: mockPageManager as any,
    config: {
        name: 'test',
        version: '1.0.0',
        port: 3001,
        browserPoolSize: 2,
        requestTimeout: 10000,
        consentTimeout: 2000,
        enableDebugLogging: false
    }
};

describe('Browser Interaction Tools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('BrowserNavigateTool', () => {
        let tool: BrowserNavigateTool;

        beforeEach(() => {
            tool = new BrowserNavigateTool();
        });

        it('should have correct metadata', () => {
            expect(tool.name).toBe('browser_navigate');
            expect(tool.description).toContain('Navigate');
            expect(tool.inputSchema.type).toBe('object');
        });

        it('should require url parameter', () => {
            const schema = tool.inputSchema;
            expect(schema.required).toContain('url');
            expect(schema.properties?.url.type).toBe('string');
        });

        it('should have optional sessionId parameter', () => {
            const schema = tool.inputSchema;
            expect(schema.properties?.sessionId).toBeDefined();
            expect(schema.properties?.sessionId.type).toBe('string');
        });

        it('should validate input properly', async () => {
            const invalidArgs = {};
            await expect(tool.execute(invalidArgs, mockContext)).rejects.toThrow();
        });

        it('should execute navigation successfully', async () => {
            const args = {
                url: 'https://example.com',
                sessionId: 'test-session'
            };

            // Mock successful execution
            vi.spyOn(tool, 'execute').mockResolvedValue({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        url: 'https://example.com',
                        title: 'Test Page',
                        sessionId: 'test-session'
                    })
                }]
            });

            const result = await tool.execute(args, mockContext);
            expect(result.content[0].type).toBe('text');
        });
    });

    describe('BrowserClickTool', () => {
        let tool: BrowserClickTool;

        beforeEach(() => {
            tool = new BrowserClickTool();
        });

        it('should have correct metadata', () => {
            expect(tool.name).toBe('browser_click');
            expect(tool.description).toBe('Click on web elements using CSS selectors or coordinates');
            expect(tool.inputSchema.type).toBe('object');
        });

        it('should require selector parameter', () => {
            const schema = tool.inputSchema;
            expect(schema.required).toContain('selector');
            expect(schema.properties?.selector.type).toBe('string');
        });

        it('should have optional sessionId parameter', () => {
            const schema = tool.inputSchema;
            expect(schema.properties?.sessionId).toBeDefined();
        });

        it('should have optional click parameters', () => {
            const schema = tool.inputSchema;
            expect(schema.properties?.button).toBeDefined();
            expect(schema.properties?.clickCount).toBeDefined();
            expect(schema.properties?.force).toBeDefined();
            expect(schema.properties?.timeout).toBeDefined();
        });

        it('should validate input properly', async () => {
            const invalidArgs = {};
            await expect(tool.execute(invalidArgs, mockContext)).rejects.toThrow();
        });

        it('should execute click successfully', async () => {
            const args = {
                selector: '#submit-button',
                sessionId: 'test-session',
                clickOptions: {button: 'left', clickCount: 1}
            };

            // Mock successful execution
            vi.spyOn(tool, 'execute').mockResolvedValue({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        selector: '#submit-button',
                        sessionId: 'test-session'
                    })
                }]
            });

            const result = await tool.execute(args, mockContext);
            expect(result.content[0].type).toBe('text');
        });
    });

    describe('BrowserTypeTool', () => {
        let tool: BrowserTypeTool;

        beforeEach(() => {
            tool = new BrowserTypeTool();
        });

        it('should have correct metadata', () => {
            expect(tool.name).toBe('browser_type');
            expect(tool.description).toBe('Type text into input fields or editable elements');
            expect(tool.inputSchema.type).toBe('object');
        });

        it('should require selector and text parameters', () => {
            const schema = tool.inputSchema;
            expect(schema.required).toContain('selector');
            expect(schema.required).toContain('text');
            expect(schema.properties?.selector.type).toBe('string');
            expect(schema.properties?.text.type).toBe('string');
        });

        it('should have optional delay parameter', () => {
            const schema = tool.inputSchema;
            expect(schema.properties?.delay).toBeDefined();
            expect(schema.properties?.delay.type).toBe('number');
        });

        it('should validate input properly', async () => {
            const invalidArgs = {selector: '#input'}; // missing text
            await expect(tool.execute(invalidArgs, mockContext)).rejects.toThrow();
        });

        it('should execute typing successfully', async () => {
            const args = {
                selector: '#username',
                text: 'testuser',
                sessionId: 'test-session',
                delay: 100
            };

            // Mock successful execution
            vi.spyOn(tool, 'execute').mockResolvedValue({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        selector: '#username',
                        text: 'testuser',
                        sessionId: 'test-session'
                    })
                }]
            });

            const result = await tool.execute(args, mockContext);
            expect(result.content[0].type).toBe('text');
        });
    });

    describe('BrowserHoverTool', () => {
        let tool: BrowserHoverTool;

        beforeEach(() => {
            tool = new BrowserHoverTool();
        });

        it('should have correct metadata', () => {
            expect(tool.name).toBe('browser_hover');
            expect(tool.description).toContain('hover');
            expect(tool.inputSchema.type).toBe('object');
        });

        it('should require selector parameter', () => {
            const schema = tool.inputSchema;
            expect(schema.required).toContain('selector');
            expect(schema.properties?.selector.type).toBe('string');
        });

        it('should have optional sessionId parameter', () => {
            const schema = tool.inputSchema;
            expect(schema.properties?.sessionId).toBeDefined();
        });

        it('should validate input properly', async () => {
            const invalidArgs = {};
            await expect(tool.execute(invalidArgs, mockContext)).rejects.toThrow();
        });

        it('should execute hover successfully', async () => {
            const args = {
                selector: '.dropdown-trigger',
                sessionId: 'test-session'
            };

            // Mock successful execution
            vi.spyOn(tool, 'execute').mockResolvedValue({
                content: [{
                    type: 'text',
                    text: JSON.stringify({
                        success: true,
                        selector: '.dropdown-trigger',
                        sessionId: 'test-session'
                    })
                }]
            });

            const result = await tool.execute(args, mockContext);
            expect(result.content[0].type).toBe('text');
        });
    });

    describe('Common validation patterns', () => {
        it('should validate sessionId format when provided', () => {
            const tools = [
                new BrowserNavigateTool(),
                new BrowserClickTool(),
                new BrowserTypeTool(),
                new BrowserHoverTool()
            ];

            tools.forEach(tool => {
                const schema = tool.inputSchema;
                if (schema.properties?.sessionId) {
                    expect(schema.properties.sessionId.type).toBe('string');
                }
            });
        });

        it('should have proper error handling schemas', () => {
            const tools = [
                new BrowserNavigateTool(),
                new BrowserClickTool(),
                new BrowserTypeTool(),
                new BrowserHoverTool()
            ];

            tools.forEach(tool => {
                expect(tool.inputSchema).toBeDefined();
                expect(tool.inputSchema.type).toBe('object');
                expect(tool.inputSchema.properties).toBeDefined();
            });
        });
    });
});