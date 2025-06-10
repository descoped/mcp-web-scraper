/**
 * Integration tests for MCP Protocol compliance
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {PlaywrightMCPServer} from '@/server.js';
import type {ServerConfig} from '@/types/index.js';

describe('MCP Protocol Integration', () => {
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
        if (server) {
            await server.stop();
        }
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

    describe('Tool Registration', () => {
        it('should register all 29 tools', () => {
            const tools = server.toolRegistry.getAllTools();
            expect(tools).toHaveLength(29);
        });

        it('should have core scraping tools', () => {
            const toolNames = server.toolRegistry.getToolNames();

            const coreTools = [
                'scrape_article_content',
                'get_page_screenshot',
                'handle_cookie_consent'
            ];

            coreTools.forEach(toolName => {
                expect(toolNames).toContain(toolName);
            });
        });

        it('should have browser interaction tools', () => {
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
                expect(toolNames).toContain(toolName);
            });
        });

        it('should have advanced feature tools', () => {
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
                expect(toolNames).toContain(toolName);
            });
        });

        it('should have session management tools', () => {
            const toolNames = server.toolRegistry.getToolNames();

            const sessionTools = [
                'manage_tabs',
                'monitor_network',
                'drag_drop',
                'navigate_history'
            ];

            sessionTools.forEach(toolName => {
                expect(toolNames).toContain(toolName);
            });
        });

        it('should have AI-powered vision tools', () => {
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
                expect(toolNames).toContain(toolName);
            });
        });
    });

    describe('Microsoft Playwright MCP Parity', () => {
        it('should have 100% tool parity (29/29)', () => {
            const tools = server.toolRegistry.getAllTools();
            expect(tools).toHaveLength(29);
        });

        it('should have all Microsoft tool equivalents', () => {
            const toolNames = server.toolRegistry.getToolNames();

            // Complete Microsoft Playwright MCP tool list
            const microsoftTools = [
                // Core interactions (our scraping tools)
                'scrape_article_content', // Our specialization
                'get_page_screenshot',    // = browser_take_screenshot
                'handle_cookie_consent',  // Our unique advantage

                // Navigation
                'browser_navigate',       // = browser_navigate
                'navigate_history',       // = browser_navigate_back/forward

                // Interactions
                'browser_click',          // = browser_click
                'browser_type',           // = browser_type
                'browser_hover',          // = browser_hover
                'browser_select_option',  // = browser_select_option
                'browser_press_key',      // = browser_press_key
                'drag_drop',              // = browser_drag
                'browser_handle_dialog',  // = browser_handle_dialog
                'browser_file_upload',    // = browser_file_upload
                'browser_resize',         // = browser_resize

                // Resources
                'browser_pdf_save',       // = browser_pdf_save
                'browser_console_messages', // = browser_console_messages
                'monitor_network',        // = browser_network_requests

                // Management
                'browser_install',        // = browser_install
                'browser_close',          // = browser_close
                'manage_tabs',            // = browser_tab_* (4 tools)

                // Testing
                'browser_generate_playwright_test', // = browser_generate_playwright_test
                'browser_snapshot',       // Accessibility testing

                // AI Vision Tools (our simplified implementations)
                'browser_find_text',
                'browser_find_element',
                'browser_describe_element',
                'browser_annotate_page',
                'browser_get_element_text',
                'browser_wait_for_page_state',
                'browser_execute_javascript'
            ];

            expect(toolNames).toHaveLength(microsoftTools.length);

            microsoftTools.forEach(toolName => {
                expect(toolNames, `Missing Microsoft equivalent: ${toolName}`).toContain(toolName);
            });
        });
    });

    describe('Tool Schema Validation', () => {
        it('should have valid schemas for all tools', () => {
            const tools = server.toolRegistry.getAllTools();

            tools.forEach(tool => {
                expect(tool.inputSchema, `Tool ${tool.name} missing schema`).toBeDefined();
                expect(tool.inputSchema.type, `Tool ${tool.name} schema invalid`).toBe('object');
            });
        });
    });
});