/**
 * MCP-Compliant Playwright Server (TypeScript Implementation)
 * Phase 2: Enhanced architecture with proper type safety and modular design
 * Following Microsoft's Playwright MCP patterns
 */

import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {SSEServerTransport} from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  InitializeRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';

import {BrowserPool} from './core/browserPool.js';
import {ConnectionManager} from './core/connectionManager.js';
import {ToolRegistry} from './core/toolRegistry.js';
import {ConsentHandler} from './core/consentHandler.js';
import {PageManager} from './core/pageManager.js';
import {StreamingManager} from './core/streamingManager.js';
import {createMonitorManager} from './core/monitorManager.js';
import {setupMonitoringEndpoints} from './core/monitoringEndpoints.js';
import {RateLimiter} from './core/rateLimiter.js';
import {RateLimitingManager} from './core/rateLimitingMiddleware.js';

// Import tools
import {ScrapeArticleTool} from './tools/scrapeArticleTool.js';
import {ScreenshotTool} from './tools/screenshotTool.js';
import {ConsentTool} from './tools/consentTool.js';

// Import navigation tools (temporarily disabled for build)
// import { NavigateTool } from './tools/navigateTool.js';
// import { ClickTool } from './tools/clickTool.js';
// import { TypeTool } from './tools/typeTool.js';
// import { GetPageStateTool } from './tools/getPageStateTool.js';
// import { LoginFlowTool } from './tools/loginFlowTool.js';
// import { ScrapeWithSessionTool } from './tools/scrapeWithSessionTool.js';
// Import hybrid automation tools
import {ManageTabsTool} from './tools/manageTabsTool.js';
import {MonitorNetworkTool} from './tools/monitorNetworkTool.js';
import {DragDropTool} from './tools/dragDropTool.js';
import {NavigateHistoryTool} from './tools/navigateHistoryTool.js';

// Import high priority core browser interaction tools
import {BrowserNavigateTool} from './tools/browserNavigateTool.js';
import {BrowserClickTool} from './tools/browserClickTool.js';
import {BrowserTypeTool} from './tools/browserTypeTool.js';
import {BrowserHoverTool} from './tools/browserHoverTool.js';
import {BrowserSelectOptionTool} from './tools/browserSelectOptionTool.js';
import {BrowserPressKeyTool} from './tools/browserPressKeyTool.js';
import {BrowserHandleDialogTool} from './tools/browserHandleDialogTool.js';
import {BrowserFileUploadTool} from './tools/browserFileUploadTool.js';
import {BrowserCloseTool} from './tools/browserCloseTool.js';

// Import medium priority tools
import {BrowserPdfSaveTool} from './tools/browserPdfSaveTool.js';
import {BrowserConsoleMessagesTool} from './tools/browserConsoleMessagesTool.js';
import {BrowserResizeTool} from './tools/browserResizeTool.js';
import {BrowserSnapshotTool} from './tools/browserSnapshotTool.js';
import {BrowserInstallTool} from './tools/browserInstallTool.js';
import {BrowserGenerateTestTool} from './tools/browserGenerateTestTool.js';

import type {
  IBrowserPool,
  IConnectionManager,
  IPlaywrightMCPServer,
  IToolRegistry,
  NavigationToolContext,
  ServerConfig
} from './types/index.js';
import {ServerConfigSchema} from './types/index.js';
import type {IMonitorManager} from './types/monitoring.js';
import {LogLevel, OperationType} from './types/monitoring.js';

export class PlaywrightMCPServer implements IPlaywrightMCPServer {
  public readonly config: ServerConfig;
  public readonly browserPool: IBrowserPool;
  public readonly toolRegistry: IToolRegistry;
  
  private readonly server: Server;
  private readonly connectionManager: IConnectionManager;
  private readonly consentHandler: ConsentHandler;
  private readonly streamingManager: StreamingManager;
  private readonly pageManager: PageManager;
  private readonly monitor: IMonitorManager;
  private readonly rateLimitingManager: RateLimitingManager;
  private readonly app: express.Application;
  private isShuttingDown: boolean = false;
  private httpServer: any = null;

  constructor(config: Partial<ServerConfig> = {}) {
    // Validate and merge configuration
    this.config = ServerConfigSchema.parse(config);
    
    // Initialize core components
    this.browserPool = new BrowserPool(this.config.browserPoolSize);
    this.connectionManager = new ConnectionManager();
    this.toolRegistry = new ToolRegistry();
    this.consentHandler = new ConsentHandler();
    this.streamingManager = new StreamingManager({}, this.connectionManager);
    
    // Initialize monitoring system
    this.monitor = createMonitorManager(
      this.browserPool,
      this.connectionManager,
      this.toolRegistry,
      this.streamingManager,
      {
        logging: {
          level: this.config.enableDebugLogging ? LogLevel.DEBUG : LogLevel.INFO,
          enableStructuredLogs: true,
          enableConsoleOutput: true,
          enableFileOutput: false,
          maxLogFileSize: 100 * 1024 * 1024,
          maxLogFiles: 5
        },
        metrics: {
          enableMetrics: true,
          metricsRetentionHours: 24,
          aggregationIntervalMs: 60000,
          maxMetricEntries: 10000
        },
        healthCheck: {
          enableHealthEndpoint: true,
          healthCheckIntervalMs: 30000,
          degradedThresholds: {
            errorRate: 0.05,
            responseTime: 5000,
            memoryUsage: 512 * 1024 * 1024
          },
          unhealthyThresholds: {
            errorRate: 0.20,
            responseTime: 10000,
            memoryUsage: 1024 * 1024 * 1024
          }
        },
        errorTracking: {
          enableErrorTracking: true,
          maxRecentErrors: 100,
          errorRetentionHours: 24
        }
      }
    );

    // Initialize PageManager for navigation tools
    this.pageManager = new PageManager(
        {
          sessionTimeout: 300000, // 5 minutes
          maxSessions: 10,
          autoHandleConsent: true
        },
        this.monitor.logger,
        this.consentHandler
    );
    
    // Initialize rate limiting system
    const rateLimiter = new RateLimiter(
      {
        enabled: true,
        enableGlobalLimits: true,
        enablePerConnectionLimits: true,
        defaultLimits: {
          requestsPerMinute: 60,
          maxConcurrentRequests: 5,
          requestTimeoutMs: 30000
        },
        monitoring: {
          logViolations: true,
          logSuccess: false,
          emitMetrics: true,
          includeContext: this.config.enableDebugLogging
        },
        cleanup: {
          intervalMs: 300000, // 5 minutes
          retentionMs: 3600000, // 1 hour
          maxEntries: 10000
        }
      },
      this.monitor.logger,
      this.monitor.metrics
    );
    
    this.rateLimitingManager = new RateLimitingManager(rateLimiter, this.monitor.logger);
    
    // Initialize MCP server
    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {
            listChanged: true
          },
        },
      }
    );

    // Initialize Express app
    this.app = express();
    
    // Setup everything
    this.setupTools();
    this.setupMCPHandlers();
    this.setupProgressNotifications();
    this.setupHttpServer();
    this.setupSignalHandlers();
  }

  /**
   * Register all available tools
   */
  private setupTools(): void {
    // Register core tools
    this.toolRegistry.registerTool(new ScrapeArticleTool());
    this.toolRegistry.registerTool(new ScreenshotTool());
    this.toolRegistry.registerTool(new ConsentTool());

    // Register navigation tools (temporarily disabled for build)
    // this.toolRegistry.registerTool(new NavigateTool());
    // this.toolRegistry.registerTool(new ClickTool());
    // this.toolRegistry.registerTool(new TypeTool());
    // this.toolRegistry.registerTool(new GetPageStateTool());
    // this.toolRegistry.registerTool(new LoginFlowTool());
    // this.toolRegistry.registerTool(new ScrapeWithSessionTool());

    // Register hybrid automation tools
    this.toolRegistry.registerTool(new ManageTabsTool());
    this.toolRegistry.registerTool(new MonitorNetworkTool());
    this.toolRegistry.registerTool(new DragDropTool());
    this.toolRegistry.registerTool(new NavigateHistoryTool());

    // Register high priority core browser interaction tools
    this.toolRegistry.registerTool(new BrowserNavigateTool());
    this.toolRegistry.registerTool(new BrowserClickTool());
    this.toolRegistry.registerTool(new BrowserTypeTool());
    this.toolRegistry.registerTool(new BrowserHoverTool());
    this.toolRegistry.registerTool(new BrowserSelectOptionTool());
    this.toolRegistry.registerTool(new BrowserPressKeyTool());
    this.toolRegistry.registerTool(new BrowserHandleDialogTool());
    this.toolRegistry.registerTool(new BrowserFileUploadTool());
    this.toolRegistry.registerTool(new BrowserCloseTool());

    // Register medium priority tools
    this.toolRegistry.registerTool(new BrowserPdfSaveTool());
    this.toolRegistry.registerTool(new BrowserConsoleMessagesTool());
    this.toolRegistry.registerTool(new BrowserResizeTool());
    this.toolRegistry.registerTool(new BrowserSnapshotTool());
    this.toolRegistry.registerTool(new BrowserInstallTool());
    this.toolRegistry.registerTool(new BrowserGenerateTestTool());
    
    console.log(`Registered ${this.toolRegistry.getAllTools().length} tools`);
  }

  /**
   * Setup MCP protocol handlers
   */
  private setupMCPHandlers(): void {
    // Initialize request handler
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
      const { clientInfo } = request.params;
      
      console.log(`MCP initialization from client: ${clientInfo?.name || 'unknown'} v${clientInfo?.version || 'unknown'}`);
      
      return {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {
            listChanged: true
          }
        },
        serverInfo: {
          name: this.config.name,
          version: this.config.version
        }
      };
    });

    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.toolRegistry.getAllTools();
      
      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        }))
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: args } = request.params;
      
      // Extract progress token and streaming preference if client requested
      const progressToken = request.params._meta?.progressToken;
      const enableStreaming = request.params._meta?.enableStreaming === true;

      // Create tool context with progress notification and streaming capability
      const context: NavigationToolContext = {
        browserPool: this.browserPool,
        config: this.config,
        consentPatterns: this.consentHandler.getPatterns(),
        connectionManager: this.connectionManager,
        streamingEnabled: enableStreaming,
        streamingManager: this.streamingManager,
        pageManager: this.pageManager,
        ...(progressToken !== undefined && {
          progressToken,
          sendProgressNotification: async (progress: number, message: string, total: number = 100) => {
            // Send notification via MCP request handler (direct HTTP response)
            await extra.sendNotification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress,
                total,
                message
              }
            });
            
            // Also broadcast to all SSE connections for real-time updates
            await this.connectionManager.broadcastNotification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress,
                total,
                message
              }
            });
          }
        })
      };

      // Create operation tracker for monitoring
      const operation = this.monitor.startOperation(OperationType.TOOL_EXECUTION, {
        toolName: name,
        ...(progressToken && { requestId: progressToken.toString() })
      });

      try {
        // Execute tool with rate limiting
        const mcpWrapper = this.rateLimitingManager.createMCPWrapper();
        const connectionId = `mcp_${Date.now()}_${Math.random()}`;
        
        const result = await mcpWrapper.wrapToolExecution(
          name,
          connectionId,
          async () => {
            return await this.toolRegistry.executeTool(name, args || {}, context);
          },
          {
            ...(progressToken && { requestId: progressToken.toString() })
          }
        );
        
        operation.complete('success', `Tool ${name} executed successfully`);
        return result;
      } catch (error) {
        operation.fail(error instanceof Error ? error : new Error(String(error)), `Tool ${name} execution failed`);
        this.monitor.recordError(error instanceof Error ? error : new Error(String(error)), {
          toolName: name,
          ...(progressToken && { requestId: progressToken.toString() })
        });
        throw error;
      }
    });
  }

  /**
   * Setup progress notifications to be sent via MCP protocol
   */
  private setupProgressNotifications(): void {
    console.log('Progress notifications system initialized (via MCP request context)');
  }

  /**
   * Setup HTTP server for health checks and MCP endpoint
   */
  private setupHttpServer(): void {
    this.app.use(cors());
    this.app.use(express.json());

    // Add rate limiting middleware for HTTP requests
    this.app.use(this.rateLimitingManager.createHttpMiddleware());

    // Setup monitoring endpoints (includes enhanced /health)
    setupMonitoringEndpoints(this.app, this.monitor);

    // MCP SSE endpoint - proper per-connection handling
    this.app.get('/mcp', (req, res) => {
      console.log('New MCP connection request');
      
      try {
        // Create transport for this specific connection
        const transport = new SSEServerTransport('/mcp', res);
        
        // Create connection wrapper for lifecycle management
        const connection = this.connectionManager.createConnection(transport, this.server);
        
        // Connect server to transport
        this.server.connect(transport);
        
        // Handle connection cleanup
        req.on('close', () => {
          console.log(`Client disconnected: ${connection.id}`);
          this.connectionManager.removeConnection(connection.id);
        });

        req.on('error', (error) => {
          console.error(`Connection error: ${connection.id}`, error);
          this.connectionManager.removeConnection(connection.id);
        });
        
        console.log(`MCP connection established: ${connection.id}`);
      } catch (error) {
        console.error('Error setting up MCP connection:', error);
        res.status(500).json({ error: 'Failed to establish MCP connection' });
      }
    });

    // MCP Request endpoint for bidirectional communication
    this.app.post('/mcp-request', async (req, res): Promise<void> => {
      try {
        const request = req.body;
        console.log('MCP request received:', { method: request.method, id: request.id });

        // Validate JSON-RPC request
        if (!request.jsonrpc || request.jsonrpc !== '2.0' || !request.method || !request.id) {
          res.status(400).json({
            jsonrpc: '2.0',
            id: request.id || null,
            error: { code: -32600, message: 'Invalid Request' }
          });
          return;
        }

        // Handle requests directly (simulating server.handleRequest)
        let result;
        
        switch (request.method) {
          case 'initialize':
            result = {
              protocolVersion: "2024-11-05",
              capabilities: { tools: { listChanged: true } },
              serverInfo: { name: this.config.name, version: this.config.version }
            };
            break;

          case 'tools/list':
            const tools = this.toolRegistry.getAllTools();
            result = {
              tools: tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema
              }))
            };
            break;

          case 'tools/call':
            const { name, arguments: args, _meta } = request.params;
            const progressToken = _meta?.progressToken;
            const enableStreaming = _meta?.enableStreaming === true;

            // Create tool context with progress notification and streaming capability
            const context: NavigationToolContext = {
              browserPool: this.browserPool,
              config: this.config,
              consentPatterns: this.consentHandler.getPatterns(),
              connectionManager: this.connectionManager,
              streamingEnabled: enableStreaming,
              streamingManager: this.streamingManager,
              pageManager: this.pageManager,
              ...(progressToken !== undefined && {
                progressToken,
                sendProgressNotification: async (progress: number, message: string, total: number = 100) => {
                  // Log for HTTP requests (immediate response)
                  console.log(`Progress (HTTP): [${progressToken}] ${message} - ${progress}/${total}`);
                  
                  // Also broadcast to SSE connections for real-time updates
                  await this.connectionManager.broadcastNotification({
                    method: "notifications/progress",
                    params: {
                      progressToken,
                      progress,
                      total,
                      message
                    }
                  });
                }
              })
            };

            result = await this.toolRegistry.executeTool(name, args || {}, context);
            break;

          default:
            res.status(400).json({
              jsonrpc: '2.0',
              id: request.id,
              error: { code: -32601, message: 'Method not found' }
            });
            return;
        }

        // Send successful response
        res.json({
          jsonrpc: '2.0',
          id: request.id,
          result
        });

      } catch (error) {
        console.error('MCP request error:', error);
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body?.id || null,
          error: {
            code: -32603,
            message: 'Internal error',
            data: (error as Error).message
          }
        });
      }
    });

    // TEMPORARY: Compatibility endpoint for Python backend migration
    // TODO: Remove when Python backend is updated to use MCP protocol
    this.app.post('/scrape', async (req, res) => {
      console.log('WARNING: Using deprecated /scrape endpoint. Update Python backend to use MCP protocol.');
      
      try {
        const { url } = req.body;
        if (!url) {
          res.status(400).json({ error: 'URL is required' });
          return;
        }

        // Create tool context
        const context: NavigationToolContext = {
          browserPool: this.browserPool,
          config: this.config,
          consentPatterns: this.consentHandler.getPatterns(),
          pageManager: this.pageManager
        };

        // Execute scrape tool directly
        const result = await this.toolRegistry.executeTool('scrape_article_content', { url }, context);
        
        // Extract and parse the JSON content from MCP response
        const content = result.content;
        if (Array.isArray(content) && content[0]?.type === 'text') {
          // Parse the JSON string from MCP response
          const jsonData = JSON.parse(content[0].text);
          res.json(jsonData);
        } else {
          // Fallback to direct content
          res.json(content);
        }
        
      } catch (error) {
        console.error('Scrape endpoint error:', error);
        res.status(500).json({ error: 'Scraping failed', details: (error as Error).message });
      }
    });

    // 404 handler for other removed endpoints
    this.app.use((req, res) => {
      res.status(404).json({ 
        error: 'Endpoint not found',
        message: 'Only /health, /mcp, and /scrape (deprecated) endpoints are available',
        mcpCompliant: true
      });
    });
  }

  /**
   * Setup graceful shutdown signal handlers
   */
  private setupSignalHandlers(): void {
    const gracefulShutdown = async (signal: string) => {
      console.log(`Received ${signal}, initiating graceful shutdown...`);
      await this.stop();
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    // Start monitoring system
    await this.monitor.start();
    this.monitor.logger.info('Starting MCP Playwright server', undefined, {
      version: this.config.version,
      port: this.config.port,
      browserPoolSize: this.config.browserPoolSize
    });

    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.app.listen(this.config.port, () => {
          console.log(`MCP-Compliant Playwright server v${this.config.version} running on http://localhost:${this.config.port}`);
          console.log(`Health check: http://localhost:${this.config.port}/health`);
          console.log(`Monitoring dashboard: http://localhost:${this.config.port}/dashboard`);
          console.log(`MCP endpoint: http://localhost:${this.config.port}/mcp`);
          console.log(`Browser pool size: ${this.config.browserPoolSize}`);
          console.log(`Request timeout: ${this.config.requestTimeout}ms`);
          console.log(`Consent timeout: ${this.config.consentTimeout}ms`);
          console.log(`Registered tools: ${this.toolRegistry.getToolNames().join(', ')}`);
          
          this.monitor.logger.info('Server started successfully', undefined, {
            endpoints: ['/health', '/dashboard', '/metrics', '/mcp'],
            tools: this.toolRegistry.getToolNames()
          });
          
          resolve();
        });

        this.httpServer.on('error', (error: Error) => {
          this.monitor.logger.error('HTTP server error', error);
          reject(error);
        });
      } catch (error) {
        this.monitor.logger.error('Server startup failed', error instanceof Error ? error : new Error(String(error)));
        reject(error);
      }
    });
  }

  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log('Starting graceful shutdown...');
    
    try {
      // Close HTTP server
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer.close(() => {
            console.log('HTTP server closed');
            resolve();
          });
        });
      }

      // Close all MCP connections
      this.connectionManager.cleanup();

      // Cleanup browser pool
      console.log('Cleaning up browser pool...');
      await this.browserPool.cleanup();

      // Cleanup page manager sessions
      console.log('Cleaning up page manager...');
      await this.pageManager.cleanup();

      // Stop monitoring system
      this.monitor.logger.info('Stopping monitoring system');
      await this.monitor.stop();

      // Cleanup rate limiting
      this.monitor.logger.info('Cleaning up rate limiting');
      await this.rateLimitingManager.cleanup();
      this.rateLimitingManager.destroy();

      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      this.monitor.logger.error('Shutdown error', error instanceof Error ? error : new Error(String(error)));
      process.exit(1);
    }
  }

  /**
   * Get server statistics for monitoring
   */
  getStats(): {
    config: ServerConfig;
    uptime: number;
    isShuttingDown: boolean;
    browserPool: any;
    connections: any;
    tools: any;
  } {
    const startTime = Date.now(); // Would be set in constructor in real implementation
    
    return {
      config: this.config,
      uptime: Date.now() - startTime,
      isShuttingDown: this.isShuttingDown,
      browserPool: this.browserPool instanceof BrowserPool ? (this.browserPool as any).getStats() : {},
      connections: this.connectionManager instanceof ConnectionManager ? (this.connectionManager as any).getStats() : {},
      tools: this.toolRegistry instanceof ToolRegistry ? (this.toolRegistry as any).getStats() : {}
    };
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Create server with configuration from environment
    const config: Partial<ServerConfig> = {
      port: parseInt(process.env.MCP_SERVER_PORT || '3001'),
      browserPoolSize: parseInt(process.env.BROWSER_POOL_SIZE || '5'),
      requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000'),
      consentTimeout: parseInt(process.env.CONSENT_TIMEOUT || '3000'),
      enableDebugLogging: process.env.DEBUG_LOGGING === 'true'
    };

    const server = new PlaywrightMCPServer(config);
    await server.start();
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

// Start server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}