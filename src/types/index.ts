/**
 * Core type definitions for MCP Playwright Server
 * Following Microsoft's Playwright MCP patterns
 */

import {z} from 'zod';
import type {Browser} from 'playwright';
import type {Server} from '@modelcontextprotocol/sdk/server/index.js';
import type {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';

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

    sendNotification(notification: { method: string; params: Record<string, unknown> }): Promise<void>;
  getTransport(): Transport;
}

/**
 * Request metadata for correlation and tracking
 */
export interface RequestMetadata {
    correlationId?: string;        // Client-provided correlation ID (e.g., async-task-worker task_id)
    requestId?: string;            // MCP request ID
    connectionId?: string;         // SSE connection ID
    clientInfo?: {
        name?: string;
        version?: string;
        userAgent?: string;
    };
    timestamp?: string;
}

/**
 * Tool execution context
 */
export interface ToolContext {
  browserPool: IBrowserPool;
  config: ServerConfig;
  consentPatterns: ConsentPatterns;
  progressToken?: string | number;
    correlationId?: string;        // NEW: Primary correlation identifier
    requestMetadata?: RequestMetadata; // NEW: Rich request context
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
    content: z.array(z.union([
        z.object({
            type: z.literal('text'),
            text: z.string(),
        }),
        z.object({
            type: z.literal('image'),
            data: z.string(), // base64 encoded
            mimeType: z.string(),
        })
    ])),
    isError: z.boolean().optional(),
});

export type ToolResult = z.infer<typeof ToolResultSchema>;

/**
 * Output format types
 */
export const OutputFormatSchema = z.enum(['text', 'html', 'markdown']);
export type OutputFormat = z.infer<typeof OutputFormatSchema>;

/**
 * Article scraping arguments
 */
export const ScrapeArticleArgsSchema = z.object({
    url: z.string().url(),
    outputFormats: z.array(OutputFormatSchema).default(['text']),
    correlation_id: z.string().optional(),
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
    correlation_id: z.string().optional(),
});

export type ScreenshotArgs = z.infer<typeof ScreenshotArgsSchema>;

/**
 * Cookie consent arguments
 */
export const ConsentArgsSchema = z.object({
    url: z.string().url(),
    timeout: z.number().int().min(1000).max(10000).default(3000),
    correlation_id: z.string().optional(),
});

export type ConsentArgs = z.infer<typeof ConsentArgsSchema>;

/**
 * Phase 4A.1: Enhanced analytics schemas
 */
export const RuleEffectivenessSchema = z.object({
    rule_id: z.string().nullable(),
    rule_name: z.string().nullable(),
    rule_domain_match: z.boolean(),
    bespoke_rule_used: z.boolean(),
    universal_fallback: z.boolean()
});

export const QualityMetricsSchema = z.object({
    overall_score: z.number(),
    word_count: z.number(),
    metadata_complete: z.boolean(),
    has_structured_data: z.boolean(),
    frontpage_risk: z.number(),
    content_completeness: z.object({
        title_present: z.boolean(),
        content_present: z.boolean(),
        author_present: z.boolean(),
        date_present: z.boolean(),
        summary_present: z.boolean()
    })
});

export const PerformanceMetricsSchema = z.object({
    extraction_time_ms: z.number(),
    cache_hit: z.boolean(),
    cache_key: z.string().nullable(),
    retry_count: z.number()
});

export const ExtractionAnalyticsSchema = z.object({
    method: z.string(),
    confidence: z.number(),
    rule_effectiveness: RuleEffectivenessSchema,
    quality_metrics: QualityMetricsSchema,
    performance_metrics: PerformanceMetricsSchema
});

/**
 * Article scraping result with Phase 4A.1 enhancements
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
    fullText: z.string().optional(),
    fullHtml: z.string().optional(),
    fullMarkdown: z.string().optional(),
    timestamp: z.string(),
    cookieConsent: ConsentResultSchema,
    // Phase 4A.1: Enhanced analytics (optional for backward compatibility)
    extraction_analytics: ExtractionAnalyticsSchema.optional(),
});

export type ArticleResult = z.infer<typeof ArticleResultSchema>;
export type RuleEffectiveness = z.infer<typeof RuleEffectivenessSchema>;
export type QualityMetrics = z.infer<typeof QualityMetricsSchema>;
export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;
export type ExtractionAnalytics = z.infer<typeof ExtractionAnalyticsSchema>;

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

    getConsentPatterns(): ConsentPatterns;
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

    broadcastNotification(notification: { method: string; params: Record<string, unknown> }): Promise<void>;
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
    viewport: {width: 1920, height: 1080},
} as const;

/**
 * Navigation tool schemas and types
 */

// Page session configuration
export interface PageSessionConfig {
    sessionTimeout: number;
    maxSessions: number;
    autoHandleConsent: boolean;
}

// Navigation tool context
export interface NavigationToolContext extends ToolContext {
    pageManager: import('../core/pageManager.js').PageManager;
}

// Navigate tool arguments
export const NavigateArgsSchema = z.object({
    url: z.string().url(),
    sessionId: z.string().optional(),
    handleConsent: z.boolean().default(true),
    waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).default('domcontentloaded'),
});

export type NavigateArgs = z.infer<typeof NavigateArgsSchema>;

// Click tool arguments
export const ClickArgsSchema = z.object({
    sessionId: z.string(),
    selector: z.string().optional(),
    text: z.string().optional(),
    coordinate: z.object({
        x: z.number(),
        y: z.number(),
    }).optional(),
});

export type ClickArgs = z.infer<typeof ClickArgsSchema>;

// Type tool arguments
export const TypeArgsSchema = z.object({
    sessionId: z.string(),
    selector: z.string(),
    text: z.string(),
    submit: z.boolean().default(false),
    clear: z.boolean().default(true),
});

export type TypeArgs = z.infer<typeof TypeArgsSchema>;

// Page state tool arguments
export const PageStateArgsSchema = z.object({
    sessionId: z.string(),
    mode: z.enum(['snapshot', 'vision']).default('snapshot'),
    includeScreenshot: z.boolean().default(false),
});

export type PageStateArgs = z.infer<typeof PageStateArgsSchema>;

// Login flow arguments
export const LoginFlowArgsSchema = z.object({
    loginUrl: z.string().url(),
    username: z.string(),
    password: z.string(),
    usernameSelector: z.string().default('#username, [name="username"], [type="email"]'),
    passwordSelector: z.string().default('#password, [name="password"], [type="password"]'),
    submitSelector: z.string().default('#submit, [type="submit"], button[type="submit"]'),
});

export type LoginFlowArgs = z.infer<typeof LoginFlowArgsSchema>;

// Session scrape arguments
export const SessionScrapeArgsSchema = z.object({
    sessionId: z.string(),
    extractSelectors: z.object({
        title: z.string().optional(),
        content: z.string().optional(),
        author: z.string().optional(),
        date: z.string().optional(),
        summary: z.string().optional(),
    }).optional(),
});

export type SessionScrapeArgs = z.infer<typeof SessionScrapeArgsSchema>;

// Critical missing tool schemas

// Tab management arguments
export const TabManageArgsSchema = z.object({
    action: z.enum(['list', 'new', 'switch', 'close']),
    tabIndex: z.number().optional(),
    url: z.string().url().optional(),
});

export type TabManageArgs = z.infer<typeof TabManageArgsSchema>;

// Network monitoring arguments
export const NetworkMonitorArgsSchema = z.object({
    sessionId: z.string(),
    action: z.enum(['start', 'stop', 'get']),
    filterUrl: z.string().optional(),
});

export type NetworkMonitorArgs = z.infer<typeof NetworkMonitorArgsSchema>;

// Drag and drop arguments
export const DragDropArgsSchema = z.object({
    sessionId: z.string(),
    sourceSelector: z.string(),
    targetSelector: z.string(),
    sourceCoordinate: z.object({
        x: z.number(),
        y: z.number(),
    }).optional(),
    targetCoordinate: z.object({
        x: z.number(),
        y: z.number(),
    }).optional(),
});

export type DragDropArgs = z.infer<typeof DragDropArgsSchema>;

// History navigation arguments
export const HistoryNavigateArgsSchema = z.object({
    sessionId: z.string(),
    direction: z.enum(['back', 'forward']),
    steps: z.number().default(1),
});

export type HistoryNavigateArgs = z.infer<typeof HistoryNavigateArgsSchema>;

// === HIGH PRIORITY CORE BROWSER INTERACTION TOOLS ===

// Browser navigate arguments
export const BrowserNavigateArgsSchema = z.object({
    sessionId: z.string(),
    url: z.string().url(),
    waitUntil: z.enum(['load', 'domcontentloaded', 'networkidle']).default('domcontentloaded'),
    timeout: z.number().optional(),
});

export type BrowserNavigateArgs = z.infer<typeof BrowserNavigateArgsSchema>;

// Browser click arguments
export const BrowserClickArgsSchema = z.object({
    sessionId: z.string(),
    selector: z.string(),
    button: z.enum(['left', 'right', 'middle']).default('left'),
    clickCount: z.number().min(1).max(3).default(1),
    modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift'])).default([]),
    position: z.object({
        x: z.number(),
        y: z.number(),
    }).optional(),
    force: z.boolean().default(false),
    timeout: z.number().optional(),
});

export type BrowserClickArgs = z.infer<typeof BrowserClickArgsSchema>;

// Browser type arguments
export const BrowserTypeArgsSchema = z.object({
    sessionId: z.string(),
    selector: z.string(),
    text: z.string(),
    delay: z.number().min(0).default(0),
    clear: z.boolean().default(false),
    timeout: z.number().optional(),
});

export type BrowserTypeArgs = z.infer<typeof BrowserTypeArgsSchema>;

// Browser hover arguments
export const BrowserHoverArgsSchema = z.object({
    sessionId: z.string(),
    selector: z.string(),
    position: z.object({
        x: z.number(),
        y: z.number(),
    }).optional(),
    force: z.boolean().default(false),
    timeout: z.number().optional(),
});

export type BrowserHoverArgs = z.infer<typeof BrowserHoverArgsSchema>;

// Browser select option arguments
export const BrowserSelectOptionArgsSchema = z.object({
    sessionId: z.string(),
    selector: z.string(),
    values: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
    indices: z.array(z.number()).optional(),
    timeout: z.number().optional(),
});

export type BrowserSelectOptionArgs = z.infer<typeof BrowserSelectOptionArgsSchema>;

// Browser press key arguments
export const BrowserPressKeyArgsSchema = z.object({
    sessionId: z.string(),
    key: z.string(),
    selector: z.string().optional(),
    modifiers: z.array(z.enum(['Alt', 'Control', 'Meta', 'Shift'])).default([]),
    delay: z.number().min(0).default(0),
    timeout: z.number().optional(),
});

export type BrowserPressKeyArgs = z.infer<typeof BrowserPressKeyArgsSchema>;

// Browser handle dialog arguments
export const BrowserHandleDialogArgsSchema = z.object({
    sessionId: z.string(),
    action: z.enum(['accept', 'dismiss', 'message']),
    promptText: z.string().optional(),
    timeout: z.number().optional(),
});

export type BrowserHandleDialogArgs = z.infer<typeof BrowserHandleDialogArgsSchema>;

// Browser file upload arguments
export const BrowserFileUploadArgsSchema = z.object({
    sessionId: z.string(),
    selector: z.string(),
    files: z.array(z.string()),
    timeout: z.number().optional(),
});

export type BrowserFileUploadArgs = z.infer<typeof BrowserFileUploadArgsSchema>;

// Browser close arguments
export const BrowserCloseArgsSchema = z.object({
    sessionId: z.string(),
    runBeforeUnload: z.boolean().default(false),
});

export type BrowserCloseArgs = z.infer<typeof BrowserCloseArgsSchema>;

// === MEDIUM PRIORITY ADVANCED BROWSER TOOLS ===

// Browser PDF save arguments
export const BrowserPdfSaveArgsSchema = z.object({
    sessionId: z.string(),
    path: z.string().optional(),
    format: z.enum(['A4', 'A3', 'A2', 'A1', 'A0', 'Letter', 'Legal', 'Tabloid', 'Ledger']).default('A4'),
    width: z.string().optional(),
    height: z.string().optional(),
    scale: z.number().min(0.1).max(2).default(1),
    displayHeaderFooter: z.boolean().default(false),
    headerTemplate: z.string().optional(),
    footerTemplate: z.string().optional(),
    printBackground: z.boolean().default(false),
    landscape: z.boolean().default(false),
    pageRanges: z.string().optional(),
    preferCSSPageSize: z.boolean().default(false),
    margin: z.object({
        top: z.string().optional(),
        right: z.string().optional(),
        bottom: z.string().optional(),
        left: z.string().optional(),
    }).optional(),
});

export type BrowserPdfSaveArgs = z.infer<typeof BrowserPdfSaveArgsSchema>;

// Browser console messages arguments
export const BrowserConsoleMessagesArgsSchema = z.object({
    sessionId: z.string(),
    action: z.enum(['start', 'stop', 'get', 'clear']),
    level: z.enum(['log', 'info', 'warn', 'error', 'debug', 'trace']).optional(),
    limit: z.number().min(1).max(1000).default(100),
});

export type BrowserConsoleMessagesArgs = z.infer<typeof BrowserConsoleMessagesArgsSchema>;

// Browser resize arguments
export const BrowserResizeArgsSchema = z.object({
    sessionId: z.string(),
    width: z.number().min(100).max(4000),
    height: z.number().min(100).max(4000),
    deviceScaleFactor: z.number().min(0.1).max(5).default(1),
});

export type BrowserResizeArgs = z.infer<typeof BrowserResizeArgsSchema>;

// Browser snapshot arguments
export const BrowserSnapshotArgsSchema = z.object({
    sessionId: z.string(),
    interestingOnly: z.boolean().default(true),
    root: z.string().optional(),
});

export type BrowserSnapshotArgs = z.infer<typeof BrowserSnapshotArgsSchema>;

// Browser install arguments
export const BrowserInstallArgsSchema = z.object({
    browser: z.enum(['chromium', 'firefox', 'webkit', 'chrome', 'msedge']),
    version: z.string().optional(),
    force: z.boolean().default(false),
});

export type BrowserInstallArgs = z.infer<typeof BrowserInstallArgsSchema>;

// Browser generate playwright test arguments
export const BrowserGenerateTestArgsSchema = z.object({
    sessionId: z.string(),
    outputPath: z.string(),
    testName: z.string(),
    includeAssertions: z.boolean().default(true),
    language: z.enum(['javascript', 'typescript', 'python', 'java', 'csharp']).default('typescript'),
});

export type BrowserGenerateTestArgs = z.infer<typeof BrowserGenerateTestArgsSchema>;

// Browser find text arguments
export const BrowserFindTextArgsSchema = z.object({
    sessionId: z.string(),
    text: z.string(),
    strategy: z.enum(['exact', 'partial', 'regex', 'case-insensitive']).default('partial'),
    maxResults: z.number().min(1).max(100).default(10),
    includeHidden: z.boolean().default(false),
    timeout: z.number().optional(),
});

export type BrowserFindTextArgs = z.infer<typeof BrowserFindTextArgsSchema>;

// Browser find element arguments
export const BrowserFindElementArgsSchema = z.object({
    sessionId: z.string(),
    description: z.string(),
    strategy: z.enum(['text', 'aria-label', 'placeholder', 'title', 'alt', 'combined']).default('combined'),
    maxResults: z.number().min(1).max(20).default(5),
    includeHidden: z.boolean().default(false),
    timeout: z.number().optional(),
});

export type BrowserFindElementArgs = z.infer<typeof BrowserFindElementArgsSchema>;

// Browser describe element arguments
export const BrowserDescribeElementArgsSchema = z.object({
    sessionId: z.string(),
    selector: z.string(),
    includePosition: z.boolean().default(true),
    includeStyles: z.boolean().default(false),
    includeAccessibility: z.boolean().default(true),
    includeContext: z.boolean().default(true),
});

export type BrowserDescribeElementArgs = z.infer<typeof BrowserDescribeElementArgsSchema>;

// Browser annotate page arguments
export const BrowserAnnotatePageArgsSchema = z.object({
    sessionId: z.string(),
    annotations: z.array(z.object({
        type: z.enum(['highlight', 'arrow', 'text', 'box', 'circle']),
        selector: z.string().optional(),
        position: z.object({
            x: z.number(),
            y: z.number(),
        }).optional(),
        text: z.string().optional(),
        color: z.string().default('#ff0000'),
        fontSize: z.number().default(16),
        width: z.number().optional(),
        height: z.number().optional(),
    })),
    outputPath: z.string().optional(),
    includeOriginal: z.boolean().default(true),
});

export type BrowserAnnotatePageArgs = z.infer<typeof BrowserAnnotatePageArgsSchema>;

// Browser get element text arguments
export const BrowserGetElementTextArgsSchema = z.object({
    sessionId: z.string(),
    selector: z.string(),
    extraction: z.enum(['textContent', 'innerText', 'innerHTML', 'outerHTML', 'value']).default('textContent'),
    trim: z.boolean().default(true),
    includeChildren: z.boolean().default(true),
    timeout: z.number().optional(),
});

export type BrowserGetElementTextArgs = z.infer<typeof BrowserGetElementTextArgsSchema>;

// Browser wait for page state arguments
export const BrowserWaitForPageStateArgsSchema = z.object({
    sessionId: z.string(),
    state: z.enum(['load', 'domcontentloaded', 'networkidle']).default('load'),
    condition: z.object({
        selector: z.string().optional(),
        text: z.string().optional(),
        url: z.string().optional(),
        function: z.string().optional(),
    }).optional(),
    timeout: z.number().default(30000),
    pollInterval: z.number().default(100),
});

export type BrowserWaitForPageStateArgs = z.infer<typeof BrowserWaitForPageStateArgsSchema>;

// Browser execute javascript arguments
export const BrowserExecuteJavascriptArgsSchema = z.object({
    sessionId: z.string(),
    script: z.string(),
    args: z.array(z.any()).default([]),
    includeResult: z.boolean().default(true),
    timeout: z.number().default(10000),
    context: z.enum(['page', 'frame', 'worker']).default('page'),
});

export type BrowserExecuteJavascriptArgs = z.infer<typeof BrowserExecuteJavascriptArgsSchema>;

// Export progress-related types
export * from '@/types/progress.js';

// Export monitoring-related types
export * from '@/types/monitoring.js';

// Export rate limiting types
export * from '@/types/rateLimiting.js';

// Export PageSession from pageManager
export type {PageSession, PageManagerConfig} from '@/core/pageManager.js';