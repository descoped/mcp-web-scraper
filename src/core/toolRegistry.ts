/**
 * Tool registry for managing MCP tools
 * Provides registration, discovery, and execution management
 */

import type { ITool, IToolRegistry, ToolResult, ToolContext } from '../types/index.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

export class ToolRegistry implements IToolRegistry {
  private readonly tools = new Map<string, ITool>();

  registerTool(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }
    
    this.tools.set(tool.name, tool);
    console.log(`Tool registered: ${tool.name}`);
  }

  getTool(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ITool[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Execute a tool with proper error handling
   */
  async executeTool(name: string, args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const tool = this.getTool(name);
    
    if (!tool) {
      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${name}`
      );
    }

    try {
      return await tool.execute(args, context);
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      
      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get tool statistics for monitoring
   */
  getStats(): {
    totalTools: number;
    toolNames: string[];
    toolDescriptions: Array<{ name: string; description: string }>;
  } {
    const tools = this.getAllTools();
    
    return {
      totalTools: tools.length,
      toolNames: tools.map(t => t.name),
      toolDescriptions: tools.map(t => ({ name: t.name, description: t.description })),
    };
  }
}

/**
 * Abstract base class for MCP tools
 */
export abstract class BaseTool implements ITool {
  public abstract readonly name: string;
  public abstract readonly description: string;
  public abstract readonly inputSchema: Record<string, unknown>;

  public abstract execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;

  /**
   * Helper method to create successful tool result
   */
  protected createResult(data: unknown): ToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2)
        }
      ]
    };
  }

  /**
   * Helper method to validate arguments against schema
   */
  protected validateArgs<T>(args: Record<string, unknown>, schema: any): T {
    try {
      return schema.parse(args) as T;
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Invalid arguments: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Helper method for resource cleanup
   */
  protected async executeWithCleanup<T>(
    operation: () => Promise<T>,
    cleanup: () => Promise<void>
  ): Promise<T> {
    try {
      return await operation();
    } finally {
      try {
        await cleanup();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
  }
}