/**
 * Base class for all MCP tools
 */

import { z } from 'zod';
import { ToolContext } from '../types/index.js';

export interface ITool {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<any>;
  execute(args: any, context: ToolContext): Promise<any>;
}

export abstract class BaseTool implements ITool {
  abstract name: string;
  abstract description: string;
  abstract inputSchema: z.ZodSchema<any>;
  abstract execute(args: any, context: ToolContext): Promise<any>;

  async initialize(context: ToolContext): Promise<void> {
    // Override in subclasses if initialization is needed
  }

  protected createResult(data: any): any {
    return {
      success: true,
      ...data,
      timestamp: new Date().toISOString()
    };
  }

  protected createError(message: string, details: any = {}): any {
    return {
      success: false,
      error: message,
      details,
      timestamp: new Date().toISOString()
    };
  }
}