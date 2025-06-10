/**
 * Unit tests for ToolRegistry
 */

import {beforeEach, describe, expect, it} from 'vitest';
import {ToolRegistry} from '@/core/toolRegistry.js';
import {BaseTool} from '@/tools/baseTool.js';
import type {NavigationToolContext, ToolResult} from '@/types/index.js';

// Mock tool for testing
class MockTool extends BaseTool {
    public readonly name = 'mock_tool';
    public readonly description = 'A mock tool for testing';
    public readonly inputSchema = {type: 'object', properties: {}};

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        return this.createResult({mockData: 'test'});
    }
}

describe('ToolRegistry', () => {
    let toolRegistry: ToolRegistry;

    beforeEach(() => {
        toolRegistry = new ToolRegistry();
    });

    describe('registerTool', () => {
        it('should register a tool successfully', () => {
            const mockTool = new MockTool();
            toolRegistry.registerTool(mockTool);

            expect(toolRegistry.hasTool('mock_tool')).toBe(true);
        });

        it('should throw error when registering duplicate tool', () => {
            const mockTool = new MockTool();
            toolRegistry.registerTool(mockTool);

            expect(() => toolRegistry.registerTool(mockTool))
                .toThrowError('Tool mock_tool is already registered');
        });
    });

    describe('getTool', () => {
        it('should retrieve registered tool', () => {
            const mockTool = new MockTool();
            toolRegistry.registerTool(mockTool);

            const retrieved = toolRegistry.getTool('mock_tool');
            expect(retrieved).toBe(mockTool);
        });

        it('should throw error for non-existent tool', () => {
            expect(() => toolRegistry.getTool('non_existent'))
                .toThrowError('Tool non_existent not found');
        });
    });

    describe('getAllTools', () => {
        it('should return all registered tools', () => {
            const mockTool = new MockTool();
            toolRegistry.registerTool(mockTool);

            const tools = toolRegistry.getAllTools();
            expect(tools).toHaveLength(1);
            expect(tools[0]).toBe(mockTool);
        });

        it('should return empty array when no tools registered', () => {
            const tools = toolRegistry.getAllTools();
            expect(tools).toHaveLength(0);
        });
    });

    describe('getToolNames', () => {
        it('should return tool names', () => {
            const mockTool = new MockTool();
            toolRegistry.registerTool(mockTool);

            const names = toolRegistry.getToolNames();
            expect(names).toEqual(['mock_tool']);
        });
    });

    describe('executeTool', () => {
        it('should execute tool successfully', async () => {
            const mockTool = new MockTool();
            toolRegistry.registerTool(mockTool);

            const context = {} as NavigationToolContext;
            const result = await toolRegistry.executeTool('mock_tool', {}, context);

            expect(result.content).toBeDefined();
        });

        it('should throw error for non-existent tool execution', async () => {
            const context = {} as NavigationToolContext;

            await expect(toolRegistry.executeTool('non_existent', {}, context))
                .rejects.toThrowError('Tool non_existent not found');
        });
    });
});