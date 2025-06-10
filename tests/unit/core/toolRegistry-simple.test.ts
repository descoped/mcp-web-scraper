/**
 * Unit tests for ToolRegistry - using relative imports
 */

import {beforeEach, describe, expect, it} from 'vitest';

// Using relative path instead of alias
import {ToolRegistry} from '../../../src/core/toolRegistry.js';

describe('ToolRegistry', () => {
    let toolRegistry: ToolRegistry;

    beforeEach(() => {
        toolRegistry = new ToolRegistry();
    });

    describe('initialization', () => {
        it('should initialize with empty tool registry', () => {
            const tools = toolRegistry.getAllTools();
            expect(tools).toHaveLength(0);
        });

        it('should initialize with empty tool names', () => {
            const toolNames = toolRegistry.getToolNames();
            expect(toolNames).toHaveLength(0);
        });
    });

    describe('tool registration', () => {
        it('should register a tool successfully', () => {
            // Create a mock tool
            const mockTool = {
                name: 'test_tool',
                description: 'A test tool',
                inputSchema: {
                    type: 'object' as const,
                    properties: {},
                    required: []
                },
                execute: async () => ({content: [{type: 'text' as const, text: 'test'}]})
            };

            toolRegistry.registerTool(mockTool);

            const tools = toolRegistry.getAllTools();
            expect(tools).toHaveLength(1);
            expect(tools[0].name).toBe('test_tool');
        });

        it('should register multiple tools', () => {
            const mockTool1 = {
                name: 'tool_1',
                description: 'First tool',
                inputSchema: {
                    type: 'object' as const,
                    properties: {},
                    required: []
                },
                execute: async () => ({content: [{type: 'text' as const, text: 'test1'}]})
            };

            const mockTool2 = {
                name: 'tool_2',
                description: 'Second tool',
                inputSchema: {
                    type: 'object' as const,
                    properties: {},
                    required: []
                },
                execute: async () => ({content: [{type: 'text' as const, text: 'test2'}]})
            };

            toolRegistry.registerTool(mockTool1);
            toolRegistry.registerTool(mockTool2);

            const tools = toolRegistry.getAllTools();
            expect(tools).toHaveLength(2);

            const toolNames = toolRegistry.getToolNames();
            expect(toolNames).toContain('tool_1');
            expect(toolNames).toContain('tool_2');
        });
    });

    describe('tool retrieval', () => {
        it('should retrieve tool by name', () => {
            const mockTool = {
                name: 'retrieval_test',
                description: 'A tool for testing retrieval',
                inputSchema: {
                    type: 'object' as const,
                    properties: {},
                    required: []
                },
                execute: async () => ({content: [{type: 'text' as const, text: 'test'}]})
            };

            toolRegistry.registerTool(mockTool);

            const retrievedTool = toolRegistry.getTool('retrieval_test');
            expect(retrievedTool).toBeDefined();
            expect(retrievedTool?.name).toBe('retrieval_test');
        });

        it('should return undefined for non-existent tool', () => {
            const retrievedTool = toolRegistry.getTool('non_existent');
            expect(retrievedTool).toBeUndefined();
        });
    });

    describe('tool validation', () => {
        it('should prevent duplicate tool registration', () => {
            const mockTool1 = {
                name: 'duplicate_test',
                description: 'First version',
                inputSchema: {
                    type: 'object' as const,
                    properties: {},
                    required: []
                },
                execute: async () => ({content: [{type: 'text' as const, text: 'test1'}]})
            };

            const mockTool2 = {
                name: 'duplicate_test',
                description: 'Second version',
                inputSchema: {
                    type: 'object' as const,
                    properties: {},
                    required: []
                },
                execute: async () => ({content: [{type: 'text' as const, text: 'test2'}]})
            };

            toolRegistry.registerTool(mockTool1);

            // Should throw when registering duplicate
            expect(() => {
                toolRegistry.registerTool(mockTool2);
            }).toThrow();
        });

        it('should accept tools with valid structure', () => {
            const validTool = {
                name: 'valid_tool',
                description: 'Valid tool with proper schema',
                inputSchema: {
                    type: 'object' as const,
                    properties: {
                        param: {type: 'string' as const}
                    },
                    required: ['param']
                },
                execute: async () => ({content: [{type: 'text' as const, text: 'test'}]})
            };

            // Should not throw for valid tool
            expect(() => {
                toolRegistry.registerTool(validTool);
            }).not.toThrow();

            const tools = toolRegistry.getAllTools();
            expect(tools.some(tool => tool.name === 'valid_tool')).toBe(true);
        });
    });
});