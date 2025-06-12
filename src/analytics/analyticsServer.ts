/**
 * Analytics Server for Phase 4A.2 - Real-time Analytics Dashboard
 * Standalone analytics server with web dashboard interface
 */

import express from 'express';
import path from 'path';
import {fileURLToPath} from 'url';
import {AnalyticsEndpoints} from '@/analytics/analyticsEndpoints.js';
import {RuleEffectivenessTracker} from '@/content/analytics/ruleEffectivenessTracker.js';
import {ExtractionCache} from '@/content/caching/extractionCache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface AnalyticsServerConfig {
    port: number;
    host: string;
    enableWebDashboard: boolean;
    enableApiDocs: boolean;
    corsOrigins?: string[];
    authToken?: string;
}

export class AnalyticsServer {
    private app: express.Application;
    private config: AnalyticsServerConfig;
    private analyticsEndpoints: AnalyticsEndpoints;

    constructor(
        ruleTracker: RuleEffectivenessTracker,
        extractionCache: ExtractionCache,
        config: Partial<AnalyticsServerConfig> = {}
    ) {
        this.config = {
            port: 3002,
            host: '0.0.0.0',
            enableWebDashboard: true,
            enableApiDocs: true,
            ...config
        };

        this.app = express();
        this.analyticsEndpoints = new AnalyticsEndpoints(ruleTracker, extractionCache, {
            enableCors: true,
            authToken: this.config.authToken
        });

        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware(): void {
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`[Analytics] ${new Date().toISOString()} ${req.method} ${req.path}`);
            next();
        });

        // Static file serving for dashboard
        if (this.config.enableWebDashboard) {
            this.app.use('/dashboard', express.static(path.join(__dirname, '../../dashboard')));
        }

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                service: 'mcp-analytics-server',
                version: '4A.2',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                endpoints: {
                    analytics_api: '/analytics',
                    web_dashboard: this.config.enableWebDashboard ? '/dashboard' : 'disabled',
                    api_docs: this.config.enableApiDocs ? '/docs' : 'disabled'
                }
            });
        });
    }

    private setupRoutes(): void {
        // Analytics API routes
        this.app.use('/analytics', this.analyticsEndpoints.createRouter());

        // Web dashboard
        if (this.config.enableWebDashboard) {
            this.app.get('/dashboard', (req, res) => {
                res.sendFile(path.join(__dirname, '../../dashboard/index.html'));
            });

            // Redirect root to dashboard
            this.app.get('/', (req, res) => {
                res.redirect('/dashboard');
            });
        }

        // API documentation
        if (this.config.enableApiDocs) {
            this.app.get('/docs', (req, res) => {
                res.json({
                    title: 'MCP Web Scraper Analytics API',
                    version: '4A.2',
                    description: 'Real-time analytics and performance monitoring for MCP Web Scraper',
                    base_url: `http://${this.config.host}:${this.config.port}`,
                    endpoints: {
                        'GET /analytics/rules': {
                            description: 'Rule performance metrics',
                            parameters: {rule_id: 'optional filter by rule ID'},
                            response: 'Rule performance data with success rates and trends'
                        },
                        'GET /analytics/cache': {
                            description: 'Cache performance metrics',
                            response: 'Cache hit rates, optimization opportunities'
                        },
                        'GET /analytics/suggestions': {
                            description: 'Auto-generated improvement recommendations',
                            parameters: {
                                priority: 'filter by priority (high/medium/low)',
                                type: 'filter by type (rule_improvement/cache_optimization/etc)'
                            },
                            response: 'Optimization suggestions with impact estimates'
                        },
                        'GET /analytics/domains': {
                            description: 'Domain-specific performance breakdown',
                            parameters: {
                                region: 'filter by region (scandinavian/european/american)',
                                status: 'filter by status (excellent/good/needs_improvement/critical)',
                                limit: 'limit number of results (default: 50)'
                            },
                            response: 'Domain performance metrics and recent trends'
                        },
                        'GET /analytics/quality': {
                            description: 'Content quality trends and frontpage detection',
                            response: 'Quality metrics, distribution, and problem areas'
                        },
                        'GET /analytics/summary': {
                            description: 'Comprehensive analytics overview',
                            response: 'Complete dashboard data with health indicators'
                        },
                        'POST /analytics/extraction': {
                            description: 'Record new extraction for analytics',
                            body: {url: 'string', analytics: 'ExtractionAnalytics object'},
                            response: 'Confirmation of recording'
                        }
                    },
                    authentication: this.config.authToken ? 'Bearer token required' : 'None required',
                    examples: {
                        'Get rule performance': `GET ${this.config.host}:${this.config.port}/analytics/rules`,
                        'Get high priority suggestions': `GET ${this.config.host}:${this.config.port}/analytics/suggestions?priority=high`,
                        'Get Norwegian domains': `GET ${this.config.host}:${this.config.port}/analytics/domains?region=scandinavian&limit=20`
                    }
                });
            });
        }

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                error: 'Not Found',
                message: `Path ${req.path} not found`,
                available_endpoints: [
                    '/health',
                    '/analytics/*',
                    this.config.enableWebDashboard ? '/dashboard' : null,
                    this.config.enableApiDocs ? '/docs' : null
                ].filter(Boolean)
            });
        });

        // Error handler
        this.app.use((error: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
            console.error('[Analytics Server Error]:', error);
            res.status(500).json({
                error: 'Internal Server Error',
                message: 'An unexpected error occurred',
                timestamp: new Date().toISOString()
            });
        });
    }

    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            const server = this.app.listen(this.config.port, this.config.host, () => {
                console.log('🚀 Analytics Server started successfully!');
                console.log(`📊 Dashboard: http://${this.config.host}:${this.config.port}/dashboard`);
                console.log(`🔌 API: http://${this.config.host}:${this.config.port}/analytics`);
                console.log(`📚 Docs: http://${this.config.host}:${this.config.port}/docs`);
                console.log('');
                resolve();
            });

            server.on('error', reject);
        });
    }

    getAnalyticsManager() {
        return this.analyticsEndpoints.getAnalyticsManager();
    }

    getApp(): express.Application {
        return this.app;
    }
}