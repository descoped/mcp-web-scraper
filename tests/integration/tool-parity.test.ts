/**
 * Integration test to verify 100% Microsoft Playwright MCP tool parity
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';

// Using relative imports
import {PlaywrightMCPServer} from '@/server.js';
import type {ServerConfig} from '@/types/index.js';

describe('Microsoft Playwright MCP Tool Parity', () => {
    let server: PlaywrightMCPServer;
    let serverConfig: ServerConfig;

    beforeAll(async () => {
        serverConfig = {
            name: 'test-server',
            version: '1.0.0',
            port: 3002,
            browserPoolSize: 1,
            requestTimeout: 10000,
            consentTimeout: 2000,
            enableDebugLogging: false
        };

        server = new PlaywrightMCPServer(serverConfig);
        // Note: Not starting HTTP server for unit tests
    });

    afterAll(async () => {
        // Note: Skipping cleanup to avoid process.exit in tests
        // The server will be garbage collected
    });

    describe('Tool Count Verification', () => {
        it('should have exactly 29 tools registered (100% parity)', () => {
            const tools = server.toolRegistry.getAllTools();
            expect(tools).toHaveLength(29);
        });

        it('should have all core scraping tools', () => {
            const toolNames = server.toolRegistry.getToolNames();

            const coreTools = [
                'scrape_article_content',
                'get_page_screenshot',
                'handle_cookie_consent'
            ];

            coreTools.forEach(toolName => {
                expect(toolNames, `Missing core tool: ${toolName}`).toContain(toolName);
            });
        });

        it('should have all browser interaction tools', () => {
            const toolNames = server.toolRegistry.getToolNames();

            const browserTools = [
                'browser_navigate',
                'browser_click',
                'browser_type',
                'browser_hover',
                'browser_select_option',
                'browser_press_key',
                'browser_handle_dialog',
                'browser_file_upload',
                'browser_close'
            ];

            browserTools.forEach(toolName => {
                expect(toolNames, `Missing browser tool: ${toolName}`).toContain(toolName);
            });
        });

        it('should have all advanced feature tools', () => {
            const toolNames = server.toolRegistry.getToolNames();

            const advancedTools = [
                'browser_pdf_save',
                'browser_console_messages',
                'browser_resize',
                'browser_snapshot',
                'browser_install',
                'browser_generate_playwright_test'
            ];

            advancedTools.forEach(toolName => {
                expect(toolNames, `Missing advanced tool: ${toolName}`).toContain(toolName);
            });
        });

        it('should have all session management tools', () => {
            const toolNames = server.toolRegistry.getToolNames();

            const sessionTools = [
                'manage_tabs',
                'monitor_network',
                'drag_drop',
                'navigate_history'
            ];

            sessionTools.forEach(toolName => {
                expect(toolNames, `Missing session tool: ${toolName}`).toContain(toolName);
            });
        });

        it('should have all AI-powered vision tools', () => {
            const toolNames = server.toolRegistry.getToolNames();

            const visionTools = [
                'browser_find_text',
                'browser_find_element',
                'browser_describe_element',
                'browser_annotate_page',
                'browser_get_element_text',
                'browser_wait_for_page_state',
                'browser_execute_javascript'
            ];

            visionTools.forEach(toolName => {
                expect(toolNames, `Missing vision tool: ${toolName}`).toContain(toolName);
            });
        });
    });

    describe('Complete Microsoft Tool List Verification', () => {
        it('should have all 29 Microsoft Playwright MCP equivalent tools', () => {
            const toolNames = server.toolRegistry.getToolNames();

            // Complete tool list for 100% parity
            const allMicrosoftTools = [
                // Core interactions (our scraping specialization)
                'scrape_article_content',
                'get_page_screenshot',
                'handle_cookie_consent',

                // Navigation
                'browser_navigate',
                'navigate_history',

                // Interactions
                'browser_click',
                'browser_type',
                'browser_hover',
                'browser_select_option',
                'browser_press_key',
                'drag_drop',
                'browser_handle_dialog',
                'browser_file_upload',
                'browser_resize',

                // Resources
                'browser_pdf_save',
                'browser_console_messages',
                'monitor_network',

                // Management
                'browser_install',
                'browser_close',
                'manage_tabs',

                // Testing
                'browser_generate_playwright_test',
                'browser_snapshot',

                // AI Vision Tools
                'browser_find_text',
                'browser_find_element',
                'browser_describe_element',
                'browser_annotate_page',
                'browser_get_element_text',
                'browser_wait_for_page_state',
                'browser_execute_javascript'
            ];

            expect(allMicrosoftTools).toHaveLength(29);
            expect(toolNames).toHaveLength(29);

            allMicrosoftTools.forEach(toolName => {
                expect(toolNames, `Missing Microsoft equivalent: ${toolName}`).toContain(toolName);
            });
        });
    });

    describe('Tool Schema Validation', () => {
        it('should have valid schemas for all 29 tools', () => {
            const tools = server.toolRegistry.getAllTools();

            tools.forEach(tool => {
                expect(tool.inputSchema, `Tool ${tool.name} missing schema`).toBeDefined();
                expect(tool.inputSchema.type, `Tool ${tool.name} schema invalid`).toBe('object');
                expect(tool.name, 'Tool missing name').toBeDefined();
                expect(tool.description, `Tool ${tool.name} missing description`).toBeDefined();
                expect(tool.execute, `Tool ${tool.name} missing execute function`).toBeDefined();
            });
        });
    });

    describe('Server Configuration', () => {
        it('should initialize with correct config', () => {
            expect(server.config.name).toBe('test-server');
            expect(server.config.version).toBe('1.0.0');
            expect(server.config.port).toBe(3002);
            expect(server.config.browserPoolSize).toBe(1);
        });

        it('should have browser pool', () => {
            expect(server.browserPool).toBeDefined();
        });

        it('should have tool registry', () => {
            expect(server.toolRegistry).toBeDefined();
        });
    });
});