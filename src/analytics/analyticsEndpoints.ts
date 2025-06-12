/**
 * Analytics API Endpoints for Phase 4A.2 - Real-time Analytics Dashboard
 * Provides REST API endpoints for extraction analytics and performance monitoring
 */

import express from 'express';
import {AnalyticsManager} from '@/analytics/analyticsManager.js';
import {RuleEffectivenessTracker} from '@/content/analytics/ruleEffectivenessTracker.js';
import {ExtractionCache} from '@/content/caching/extractionCache.js';

export interface AnalyticsEndpointsConfig {
    enableCors?: boolean;
    rateLimitRequests?: number; // requests per minute
    requireAuthentication?: boolean;
    authToken?: string;
}

export class AnalyticsEndpoints {
    private analyticsManager: AnalyticsManager;
    private config: AnalyticsEndpointsConfig;

    constructor(
        ruleTracker: RuleEffectivenessTracker,
        extractionCache: ExtractionCache,
        config: AnalyticsEndpointsConfig = {}
    ) {
        this.analyticsManager = new AnalyticsManager(ruleTracker, extractionCache);
        this.config = {
            enableCors: true,
            rateLimitRequests: 60,
            requireAuthentication: false,
            ...config
        };
    }

    /**
     * Set up analytics router with all endpoints
     */
    createRouter(): express.Router {
        const router = express.Router();

        // Middleware
        if (this.config.enableCors) {
            router.use((req, res, next) => {
                res.header('Access-Control-Allow-Origin', '*');
                res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
                res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                next();
            });
        }

        // Authentication middleware
        if (this.config.requireAuthentication) {
            router.use((req, res, next) => {
                const token = req.headers.authorization?.replace('Bearer ', '');
                if (!token || token !== this.config.authToken) {
                    return res.status(401).json({error: 'Unauthorized'});
                }
                next();
            });
        }

        // JSON parsing
        router.use(express.json());

        // Rate limiting (basic implementation)
        const requestCounts = new Map<string, { count: number; resetTime: number }>();
        router.use((req, res, next) => {
            const clientId = req.ip || 'unknown';
            const now = Date.now();
            const windowStart = Math.floor(now / 60000) * 60000; // 1-minute window

            let clientData = requestCounts.get(clientId);
            if (!clientData || clientData.resetTime !== windowStart) {
                clientData = {count: 0, resetTime: windowStart};
                requestCounts.set(clientId, clientData);
            }

            if (clientData.count >= (this.config.rateLimitRequests || 60)) {
                return res.status(429).json({
                    error: 'Rate limit exceeded',
                    retry_after: 60 - Math.floor((now - windowStart) / 1000)
                });
            }

            clientData.count++;
            next();
        });

        // Health check endpoint
        router.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: '4A.2'
            });
        });

        // Analytics endpoints
        this.setupAnalyticsRoutes(router);

        return router;
    }

    /**
     * Set up all analytics routes
     */
    private setupAnalyticsRoutes(router: express.Router): void {
        // GET /analytics/rules - Rule performance metrics
        router.get('/rules', async (req, res) => {
            try {
                const metrics = await this.analyticsManager.getRulePerformanceMetrics();

                // Optional filtering by rule_id
                const ruleId = req.query.rule_id as string;
                const filtered = ruleId ? metrics.filter(m => m.rule_id === ruleId) : metrics;

                res.json({
                    timestamp: new Date().toISOString(),
                    total_rules: filtered.length,
                    rules: filtered,
                    summary: {
                        average_success_rate: filtered.reduce((sum, r) => sum + r.success_rate, 0) / Math.max(filtered.length, 1),
                        top_performing_rule: filtered.sort((a, b) => b.success_rate - a.success_rate)[0]?.rule_id || null,
                        rules_needing_attention: filtered.filter(r => r.success_rate < 0.6).length
                    }
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to retrieve rule metrics',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // GET /analytics/cache - Cache performance metrics
        router.get('/cache', async (req, res) => {
            try {
                const metrics = await this.analyticsManager.getCachePerformanceMetrics();

                res.json({
                    timestamp: new Date().toISOString(),
                    cache_performance: metrics,
                    recommendations: {
                        performance_status: metrics.hit_rate > 0.4 ? 'good' : 'needs_improvement',
                        suggested_actions: metrics.hit_rate < 0.4 ? [
                            'Increase cache retention time',
                            'Optimize URL pattern matching',
                            'Review cache size limits'
                        ] : [
                            'Monitor cache performance trends',
                            'Consider increasing cache size if memory allows'
                        ]
                    }
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to retrieve cache metrics',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // GET /analytics/suggestions - Auto-generated improvement recommendations
        router.get('/suggestions', async (req, res) => {
            try {
                const suggestions = await this.analyticsManager.generateOptimizationSuggestions();

                // Optional filtering by priority or type
                const priority = req.query.priority as string;
                const type = req.query.type as string;

                let filtered = suggestions;
                if (priority) {
                    filtered = filtered.filter(s => s.priority === priority);
                }
                if (type) {
                    filtered = filtered.filter(s => s.type === type);
                }

                res.json({
                    timestamp: new Date().toISOString(),
                    total_suggestions: filtered.length,
                    suggestions: filtered,
                    summary: {
                        high_priority: filtered.filter(s => s.priority === 'high').length,
                        medium_priority: filtered.filter(s => s.priority === 'medium').length,
                        low_priority: filtered.filter(s => s.priority === 'low').length,
                        auto_applicable: filtered.filter(s => s.auto_applicable).length
                    }
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to generate suggestions',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // GET /analytics/domains - Domain-specific performance breakdown
        router.get('/domains', async (req, res) => {
            try {
                const metrics = await this.analyticsManager.getDomainPerformanceMetrics();

                // Optional filtering
                const region = req.query.region as string;
                const status = req.query.status as string;
                const limit = parseInt(req.query.limit as string) || 50;

                let filtered = metrics;
                if (region) {
                    filtered = filtered.filter(m => m.region === region);
                }
                if (status) {
                    filtered = filtered.filter(m => m.optimization_status === status);
                }

                filtered = filtered.slice(0, limit);

                res.json({
                    timestamp: new Date().toISOString(),
                    total_domains: filtered.length,
                    domains: filtered,
                    summary: {
                        by_region: {
                            scandinavian: metrics.filter(d => d.region === 'scandinavian').length,
                            european: metrics.filter(d => d.region === 'european').length,
                            american: metrics.filter(d => d.region === 'american').length
                        },
                        by_status: {
                            excellent: metrics.filter(d => d.optimization_status === 'excellent').length,
                            good: metrics.filter(d => d.optimization_status === 'good').length,
                            needs_improvement: metrics.filter(d => d.optimization_status === 'needs_improvement').length,
                            critical: metrics.filter(d => d.optimization_status === 'critical').length
                        },
                        average_success_rate: metrics.reduce((sum, d) => sum + d.success_rate, 0) / Math.max(metrics.length, 1),
                        bespoke_rule_coverage: metrics.filter(d => d.has_bespoke_rule).length / Math.max(metrics.length, 1)
                    }
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to retrieve domain metrics',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // GET /analytics/quality - Content quality trends and frontpage detection
        router.get('/quality', async (req, res) => {
            try {
                const metrics = await this.analyticsManager.getQualityTrendMetrics();

                res.json({
                    timestamp: new Date().toISOString(),
                    quality_metrics: metrics,
                    insights: {
                        quality_status: metrics.overall_quality_score > 0.7 ? 'excellent' :
                            metrics.overall_quality_score > 0.5 ? 'good' : 'needs_improvement',
                        trend_direction: metrics.quality_trend_7d > 0.05 ? 'improving' :
                            metrics.quality_trend_7d < -0.05 ? 'declining' : 'stable',
                        frontpage_risk_level: metrics.frontpage_detection_rate > 0.2 ? 'high' :
                            metrics.frontpage_detection_rate > 0.1 ? 'medium' : 'low',
                        key_concerns: metrics.problem_areas.filter(p => p.severity === 'high').length
                    }
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to retrieve quality metrics',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // GET /analytics/summary - Comprehensive analytics overview
        router.get('/summary', async (req, res) => {
            try {
                const summary = await this.analyticsManager.getAnalyticsSummary();

                res.json({
                    timestamp: new Date().toISOString(),
                    analytics_summary: summary,
                    dashboard_status: {
                        overall_health: summary.summary.overall_success_rate > 0.7 ? 'healthy' :
                            summary.summary.overall_success_rate > 0.5 ? 'warning' : 'critical',
                        priority_actions: summary.optimization_suggestions
                            .filter(s => s.priority === 'high')
                            .map(s => s.title),
                        performance_indicators: {
                            extraction_success: `${(summary.summary.overall_success_rate * 100).toFixed(1)}%`,
                            cache_efficiency: `${(summary.summary.cache_hit_rate * 100).toFixed(1)}%`,
                            rule_coverage: `${summary.summary.active_bespoke_rules} active rules`,
                            domain_coverage: `${summary.summary.unique_domains} domains monitored`
                        }
                    }
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to retrieve analytics summary',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });

        // POST /analytics/extraction - Record new extraction for analytics
        router.post('/extraction', (req, res) => {
            try {
                const {url, analytics} = req.body;

                if (!url || !analytics) {
                    return res.status(400).json({
                        error: 'Missing required fields: url, analytics'
                    });
                }

                this.analyticsManager.recordExtraction(url, analytics);

                res.json({
                    status: 'recorded',
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    error: 'Failed to record extraction',
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        });
    }

    /**
     * Get the analytics manager instance
     */
    getAnalyticsManager(): AnalyticsManager {
        return this.analyticsManager;
    }
}