/**
 * Base class for all MCP tools
 */

import {z} from 'zod';
import {ToolContext} from '@/types/index.js';

export interface ITool {
  name: string;
  description: string;
    inputSchema: z.ZodSchema<unknown>;

    execute(args: unknown, context: ToolContext): Promise<unknown>;
}

export abstract class BaseTool implements ITool {
  abstract name: string;
  abstract description: string;
    abstract inputSchema: z.ZodSchema<unknown>;

    abstract execute(args: unknown, context: ToolContext): Promise<unknown>;

    async initialize(_context: ToolContext): Promise<void> {
        // Override in subclasses if initialization is needed
    }

    protected createResult(data: Record<string, unknown>): Record<string, unknown> {
        return {
            success: true,
            ...data,
            timestamp: new Date().toISOString()
        };
    }

    protected createError(message: string, details: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            success: false,
            error: message,
            details,
            timestamp: new Date().toISOString()
        };
    }
}