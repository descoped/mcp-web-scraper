/**
 * Core type definitions for MCP Playwright Server
 * Following Microsoft's Playwright MCP patterns
 */

import { z } from 'zod';
import type { BrowserContext, Page, Browser } from 'playwright';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * Server configuration schema
 */
export const ServerConfigSchema = z.object({
  name: z.string().default('mcp-web-scraper'),
  version: z.string().default('1.0.0'),
  port: z.number().int().min(1).max(65535).default(3001),
  browserPoolSize: z.number().int().min(1).max(10).default(5),
  requestTimeout: z.number().int().min(1000).max(60000).default(30000),
  consentTimeout: z.number().int().min(1000).max(10000).default(3000),
  enableDebugLogging: z.boolean().default(false),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

/**
 * Cookie consent detection patterns
 */
export interface ConsentPatterns {
  attributes: string[];
  textPatterns: string[];
  frameworks: string[];
  containers: string[];
}

/**
 * Cookie consent result
 */
export const ConsentResultSchema = z.object({
  success: z.boolean(),
  reason: z.string(),
  method: z.string().optional(),
  verification: z.object({
    success: z.boolean(),
    dialogsRemoved: z.boolean(),
    consentCookiesSet: z.number(),
    noBlockingOverlays: z.boolean(),
    postClickDialogs: z.number(),
    postClickOverlays: z.number(),
  }).optional(),
  error: z.string().optional(),
});

export type ConsentResult = z.infer<typeof ConsentResultSchema>;

/**
 * Dialog detection state
 */
export interface DialogState {
  hasDialogs: boolean;
  mainFrameDialogs: Array<{
    tagName: string;
    className: string;
    id: string;
    visible: boolean;
    zIndex: string;
  }>;
  iframeDialogs: Array<{
    url: string;
    isConsentFrame: boolean;
  }>;
  overlays: Array<{
    className: string;
    visible: boolean;
    zIndex: string;
  }>;
}

/**
 * Browser pool interface
 */
export interface IBrowserPool {
  getBrowser(): Promise<Browser | null>;
  releaseBrowser(browser: Browser): void;
  cleanup(): Promise<void>;
  readonly maxBrowsers: number;
  readonly activeBrowsers: number;
  readonly availableBrowsers: number;
}

/**
 * MCP connection interface
 */
export interface IMCPConnection {
  readonly id: string;
  readonly createdAt: Date;
  clientVersion: string | null;
  setClientVersion(version: string): void;
  cleanup(): void;
  close(): void;
  sendNotification(notification: { method: string; params: any }): Promise<void>;
  getTransport(): Transport;
}

/**
 * Tool execution context
 */
export interface ToolContext {
  browserPool: IBrowserPool;
  config: ServerConfig;
  consentPatterns: ConsentPatterns;
  progressToken?: string | number;
  sendProgressNotification?: (progress: number, message: string, total?: number) => Promise<void>;
  connectionManager?: IConnectionManager;
  streamingEnabled?: boolean;
  streamingManager?: import('../core/streamingManager.js').StreamingManager;
}

/**
 * Base tool interface
 */
export interface ITool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

/**
 * Tool result schema
 */
export const ToolResultSchema = z.object({
  content: z.array(z.object({
    type: z.literal('text'),
    text: z.string(),
  })),
  isError: z.boolean().optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

/**
 * Article scraping arguments
 */
export const ScrapeArticleArgsSchema = z.object({
  url: z.string().url(),
  waitForSelector: z.string().optional(),
  extractSelectors: z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    author: z.string().optional(),
    date: z.string().optional(),
    summary: z.string().optional(),
  }).optional(),
});

export type ScrapeArticleArgs = z.infer<typeof ScrapeArticleArgsSchema>;

/**
 * Screenshot arguments
 */
export const ScreenshotArgsSchema = z.object({
  url: z.string().url(),
  fullPage: z.boolean().default(false),
});

export type ScreenshotArgs = z.infer<typeof ScreenshotArgsSchema>;

/**
 * Cookie consent arguments
 */
export const ConsentArgsSchema = z.object({
  url: z.string().url(),
  timeout: z.number().int().min(1000).max(10000).default(3000),
});

export type ConsentArgs = z.infer<typeof ConsentArgsSchema>;

/**
 * Article scraping result
 */
export const ArticleResultSchema = z.object({
  url: z.string(),
  extracted: z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    author: z.string().optional(),
    date: z.string().optional(),
    summary: z.string().optional(),
  }),
  fullText: z.string(),
  timestamp: z.string(),
  cookieConsent: ConsentResultSchema,
});

export type ArticleResult = z.infer<typeof ArticleResultSchema>;

/**
 * Screenshot result
 */
export const ScreenshotResultSchema = z.object({
  success: z.boolean(),
  url: z.string(),
  screenshotSize: z.number(),
  cookieConsent: ConsentResultSchema,
  timestamp: z.string(),
});

export type ScreenshotResult = z.infer<typeof ScreenshotResultSchema>;

/**
 * Tool registry interface
 */
export interface IToolRegistry {
  registerTool(tool: ITool): void;
  getTool(name: string): ITool | undefined;
  getAllTools(): ITool[];
  getToolNames(): string[];
  executeTool(name: string, args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

/**
 * Server interface
 */
export interface IPlaywrightMCPServer {
  readonly config: ServerConfig;
  readonly browserPool: IBrowserPool;
  readonly toolRegistry: IToolRegistry;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Connection manager interface
 */
export interface IConnectionManager {
  createConnection(transport: Transport, server: Server): IMCPConnection;
  getConnection(id: string): IMCPConnection | undefined;
  getAllConnections(): IMCPConnection[];
  removeConnection(id: string): void;
  cleanup(): void;
  broadcastNotification(notification: { method: string; params: any }): Promise<void>;
}

/**
 * Utility type for browser context options
 */
export interface BrowserContextOptions {
  userAgent: string;
  viewport: {
    width: number;
    height: number;
  };
}

/**
 * Default browser context options
 */
export const DEFAULT_BROWSER_CONTEXT: BrowserContextOptions = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1920, height: 1080 },
} as const;

// Export progress-related types
export * from './progress.js';

// Export monitoring-related types
export * from './monitoring.js';

// Export rate limiting types
export * from './rateLimiting.js';