/**
 * Analytics Manager for Phase 4A.2 - Real-time Analytics Dashboard
 * Collects and processes extraction analytics data for operational insights
 */

import {RuleEffectivenessTracker} from '@/content/analytics/ruleEffectivenessTracker.js';
import {ExtractionCache} from '@/content/caching/extractionCache.js';
import type {ExtractionAnalytics} from '@/types/index.js';

export interface RulePerformanceMetrics {
    rule_id: string;
    rule_name: string;
    domains: string[];
    total_extractions: number;
    successful_extractions: number;
    success_rate: number;
    average_confidence: number;
    average_quality_score: number;
    average_extraction_time: number;
    last_used: string;
    trend_7d: {
        success_rate_change: number;
        quality_change: number;
        usage_change: number;
    };
}

export interface CachePerformanceMetrics {
    total_entries: number;
    hit_rate: number;
    miss_rate: number;
    average_age_hours: number;
    size_mb: number;
    top_domains: Array<{
        domain: string;
        cache_entries: number;
        hit_rate: number;
    }>;
    optimization_opportunities: Array<{
        domain: string;
        potential_savings: string;
        recommendation: string;
    }>;
}

export interface OptimizationSuggestion {
    id: string;
    type: 'rule_improvement' | 'cache_optimization' | 'quality_enhancement' | 'performance_boost';
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    impact_estimate: string;
    implementation_effort: 'low' | 'medium' | 'high';
    affected_domains: string[];
    metrics: {
        current_success_rate?: number;
        potential_improvement?: number;
        estimated_time_savings?: number;
    };
    action_items: string[];
    auto_applicable: boolean;
}

export interface DomainPerformanceMetrics {
    domain: string;
    region: string;
    total_extractions: number;
    success_rate: number;
    average_quality: number;
    has_bespoke_rule: boolean;
    rule_effectiveness: number;
    frontpage_risk_rate: number;
    cache_hit_rate: number;
    average_extraction_time: number;
    recent_performance: Array<{
        date: string;
        success_rate: number;
        quality_score: number;
        extraction_count: number;
    }>;
    optimization_status: 'excellent' | 'good' | 'needs_improvement' | 'critical';
}

export interface QualityTrendMetrics {
    overall_quality_score: number;
    quality_trend_7d: number;
    frontpage_detection_rate: number;
    structured_data_rate: number;
    metadata_completeness_rate: number;
    content_quality_distribution: {
        excellent: number; // 0.8-1.0
        good: number;      // 0.6-0.8
        fair: number;      // 0.4-0.6
        poor: number;      // 0.0-0.4
    };
    problem_areas: Array<{
        issue: string;
        affected_domains: string[];
        severity: 'high' | 'medium' | 'low';
        suggested_fix: string;
    }>;
}

export class AnalyticsManager {
    private extractionHistory: Array<{
        timestamp: Date;
        url: string;
        domain: string;
        analytics: ExtractionAnalytics;
    }> = [];

    private ruleTracker: RuleEffectivenessTracker;
    private extractionCache: ExtractionCache;
    private maxHistoryEntries: number;

    constructor(ruleTracker: RuleEffectivenessTracker, extractionCache: ExtractionCache, maxHistoryEntries = 10000) {
        this.ruleTracker = ruleTracker;
        this.extractionCache = extractionCache;
        this.maxHistoryEntries = maxHistoryEntries;
    }

    /**
     * Record extraction analytics for dashboard insights
     */
    recordExtraction(url: string, analytics: ExtractionAnalytics): void {
        const domain = this.extractDomain(url);

        this.extractionHistory.push({
            timestamp: new Date(),
            url,
            domain,
            analytics
        });

        // Maintain history size limit
        if (this.extractionHistory.length > this.maxHistoryEntries) {
            this.extractionHistory = this.extractionHistory.slice(-this.maxHistoryEntries);
        }
    }

    /**
     * Get rule performance metrics
     */
    async getRulePerformanceMetrics(): Promise<RulePerformanceMetrics[]> {
        const exportedMetrics = this.ruleTracker.exportMetrics();
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const ruleMetrics: RulePerformanceMetrics[] = [];

        for (const ruleData of exportedMetrics.rules) {
            // Calculate recent trends
            const recentExtractions = this.extractionHistory.filter(entry =>
                entry.analytics.rule_effectiveness.rule_id === ruleData.ruleId &&
                entry.timestamp >= sevenDaysAgo
            );

            const olderExtractions = this.extractionHistory.filter(entry =>
                entry.analytics.rule_effectiveness.rule_id === ruleData.ruleId &&
                entry.timestamp < sevenDaysAgo &&
                entry.timestamp >= new Date(sevenDaysAgo.getTime() - 7 * 24 * 60 * 60 * 1000)
            );

            // Calculate trend changes
            const recentSuccessRate = recentExtractions.length > 0
                ? recentExtractions.filter(e => e.analytics.quality_metrics.overall_score > 0.4).length / recentExtractions.length
                : 0;

            const olderSuccessRate = olderExtractions.length > 0
                ? olderExtractions.filter(e => e.analytics.quality_metrics.overall_score > 0.4).length / olderExtractions.length
                : 0;

            const recentQuality = recentExtractions.length > 0
                ? recentExtractions.reduce((sum, e) => sum + e.analytics.quality_metrics.overall_score, 0) / recentExtractions.length
                : 0;

            const olderQuality = olderExtractions.length > 0
                ? olderExtractions.reduce((sum, e) => sum + e.analytics.quality_metrics.overall_score, 0) / olderExtractions.length
                : 0;

            ruleMetrics.push({
                rule_id: ruleData.ruleId,
                rule_name: ruleData.ruleName || ruleData.ruleId,
                domains: [ruleData.domain],
                total_extractions: ruleData.totalExtractions || 0,
                successful_extractions: ruleData.successfulExtractions || 0,
                success_rate: ruleData.successRate || 0,
                average_confidence: ruleData.averageConfidence || 0,
                average_quality_score: ruleData.averageQualityScore || 0,
                average_extraction_time: ruleData.averageExtractionTime || 0,
                last_used: ruleData.lastUpdated?.toISOString() || new Date().toISOString(),
                trend_7d: {
                    success_rate_change: recentSuccessRate - olderSuccessRate,
                    quality_change: recentQuality - olderQuality,
                    usage_change: recentExtractions.length - olderExtractions.length
                }
            });
        }

        return ruleMetrics.sort((a, b) => b.total_extractions - a.total_extractions);
    }

    /**
     * Get cache performance metrics
     */
    async getCachePerformanceMetrics(): Promise<CachePerformanceMetrics> {
        const cacheStats = this.extractionCache.getStats();

        // Calculate optimization opportunities
        const optimizationOpportunities: Array<{
            domain: string;
            potential_savings: string;
            recommendation: string;
        }> = [];

        for (const domainStat of cacheStats.topDomains) {
            if (domainStat.count > 10) {
                // Domains with many extractions but potentially low cache hit rates
                const domainExtractions = this.extractionHistory.filter(e => e.domain === domainStat.domain);
                const cacheHits = domainExtractions.filter(e => e.analytics.performance_metrics.cache_hit).length;
                const hitRate = domainExtractions.length > 0 ? cacheHits / domainExtractions.length : 0;

                if (hitRate < 0.3) {
                    optimizationOpportunities.push({
                        domain: domainStat.domain,
                        potential_savings: `${((1 - hitRate) * domainStat.count * 2).toFixed(1)}s potential time savings`,
                        recommendation: 'Increase cache retention time or improve URL pattern matching'
                    });
                }
            }
        }

        return {
            total_entries: cacheStats.totalEntries,
            hit_rate: cacheStats.hitRate,
            miss_rate: 1 - cacheStats.hitRate,
            average_age_hours: cacheStats.averageAge / (1000 * 60 * 60),
            size_mb: cacheStats.memoryUsage / (1024 * 1024),
            top_domains: cacheStats.topDomains.map(d => ({
                domain: d.domain,
                cache_entries: d.count,
                hit_rate: 0.5 // TODO: Calculate actual hit rate per domain
            })),
            optimization_opportunities: optimizationOpportunities
        };
    }

    /**
     * Generate optimization suggestions based on analytics data
     */
    async generateOptimizationSuggestions(): Promise<OptimizationSuggestion[]> {
        const suggestions: OptimizationSuggestion[] = [];
        const ruleMetrics = await this.getRulePerformanceMetrics();
        const domainMetrics = await this.getDomainPerformanceMetrics();

        // Rule improvement suggestions
        for (const rule of ruleMetrics) {
            if (rule.success_rate < 0.6 && rule.total_extractions > 20) {
                suggestions.push({
                    id: `rule-improvement-${rule.rule_id}`,
                    type: 'rule_improvement',
                    priority: rule.success_rate < 0.3 ? 'high' : 'medium',
                    title: `Improve ${rule.rule_name} Rule`,
                    description: `Rule ${rule.rule_name} has ${(rule.success_rate * 100).toFixed(1)}% success rate across ${rule.total_extractions} extractions`,
                    impact_estimate: `Potential +${((0.8 - rule.success_rate) * 100).toFixed(1)}% success rate improvement`,
                    implementation_effort: 'medium',
                    affected_domains: rule.domains,
                    metrics: {
                        current_success_rate: rule.success_rate,
                        potential_improvement: 0.8 - rule.success_rate
                    },
                    action_items: [
                        'Review and update CSS selectors',
                        'Test with recent articles from affected domains',
                        'Consider domain-specific selector variations'
                    ],
                    auto_applicable: false
                });
            }
        }

        // Cache optimization suggestions
        const cacheMetrics = await this.getCachePerformanceMetrics();
        if (cacheMetrics.hit_rate < 0.4) {
            suggestions.push({
                id: 'cache-optimization-general',
                type: 'cache_optimization',
                priority: 'medium',
                title: 'Optimize Cache Performance',
                description: `Current cache hit rate is ${(cacheMetrics.hit_rate * 100).toFixed(1)}%, below optimal 40%+`,
                impact_estimate: `+${((0.6 - cacheMetrics.hit_rate) * 100).toFixed(1)}% potential hit rate improvement`,
                implementation_effort: 'low',
                affected_domains: cacheMetrics.top_domains.map(d => d.domain),
                metrics: {
                    current_success_rate: cacheMetrics.hit_rate,
                    potential_improvement: 0.6 - cacheMetrics.hit_rate
                },
                action_items: [
                    'Increase cache retention time',
                    'Improve URL pattern normalization',
                    'Review cache size limits'
                ],
                auto_applicable: true
            });
        }

        // Domain-specific suggestions
        for (const domain of domainMetrics) {
            if (!domain.has_bespoke_rule && domain.success_rate < 0.5 && domain.total_extractions > 10) {
                suggestions.push({
                    id: `bespoke-rule-${domain.domain.replace(/\./g, '-')}`,
                    type: 'rule_improvement',
                    priority: domain.success_rate < 0.3 ? 'high' : 'medium',
                    title: `Create Bespoke Rule for ${domain.domain}`,
                    description: `${domain.domain} has ${(domain.success_rate * 100).toFixed(1)}% success rate without bespoke rules`,
                    impact_estimate: 'Potential +30-50% success rate improvement',
                    implementation_effort: 'medium',
                    affected_domains: [domain.domain],
                    metrics: {
                        current_success_rate: domain.success_rate,
                        potential_improvement: 0.4
                    },
                    action_items: [
                        'Analyze DOM structure for optimal selectors',
                        'Create domain-specific rule configuration',
                        'Test with sample articles'
                    ],
                    auto_applicable: false
                });
            }
        }

        return suggestions.sort((a, b) => {
            const priorityOrder = {high: 3, medium: 2, low: 1};
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    /**
     * Get domain-specific performance breakdown
     */
    async getDomainPerformanceMetrics(): Promise<DomainPerformanceMetrics[]> {
        const domainStats = new Map<string, {
            extractions: Array<{
                timestamp: Date;
                url: string;
                domain: string;
                analytics: ExtractionAnalytics;
            }>;
            region: string;
        }>();

        // Group extractions by domain
        for (const extraction of this.extractionHistory) {
            if (!domainStats.has(extraction.domain)) {
                domainStats.set(extraction.domain, {
                    extractions: [],
                    region: this.inferRegion(extraction.domain)
                });
            }
            domainStats.get(extraction.domain)!.extractions.push(extraction);
        }

        const domainMetrics: DomainPerformanceMetrics[] = [];

        for (const [domain, stats] of domainStats) {
            const extractions = stats.extractions;
            const totalExtractions = extractions.length;

            if (totalExtractions === 0) continue;

            const successfulExtractions = extractions.filter(e => e.analytics.quality_metrics.overall_score > 0.4);
            const successRate = successfulExtractions.length / totalExtractions;

            const averageQuality = extractions.reduce((sum, e) => sum + e.analytics.quality_metrics.overall_score, 0) / totalExtractions;
            const hasBespokeRule = extractions.some(e => e.analytics.rule_effectiveness.bespoke_rule_used);
            const frontpageRiskRate = extractions.filter(e => e.analytics.quality_metrics.frontpage_risk > 0.6).length / totalExtractions;
            const cacheHitRate = extractions.filter(e => e.analytics.performance_metrics.cache_hit).length / totalExtractions;
            const averageExtractionTime = extractions.reduce((sum, e) => sum + e.analytics.performance_metrics.extraction_time_ms, 0) / totalExtractions;

            // Determine optimization status
            let optimizationStatus: DomainPerformanceMetrics['optimization_status'];
            if (successRate >= 0.8 && averageQuality >= 0.7) {
                optimizationStatus = 'excellent';
            } else if (successRate >= 0.6 && averageQuality >= 0.5) {
                optimizationStatus = 'good';
            } else if (successRate >= 0.4 && averageQuality >= 0.3) {
                optimizationStatus = 'needs_improvement';
            } else {
                optimizationStatus = 'critical';
            }

            // Calculate recent performance (last 7 days)
            const now = new Date();
            const recentPerformance: DomainPerformanceMetrics['recent_performance'] = [];

            for (let i = 6; i >= 0; i--) {
                const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

                const dayExtractions = extractions.filter(e =>
                    e.timestamp >= dayStart && e.timestamp < dayEnd
                );

                if (dayExtractions.length > 0) {
                    const daySuccessRate = dayExtractions.filter(e => e.analytics.quality_metrics.overall_score > 0.4).length / dayExtractions.length;
                    const dayQualityScore = dayExtractions.reduce((sum, e) => sum + e.analytics.quality_metrics.overall_score, 0) / dayExtractions.length;

                    recentPerformance.push({
                        date: dayStart.toISOString().split('T')[0],
                        success_rate: daySuccessRate,
                        quality_score: dayQualityScore,
                        extraction_count: dayExtractions.length
                    });
                }
            }

            domainMetrics.push({
                domain,
                region: stats.region,
                total_extractions: totalExtractions,
                success_rate: successRate,
                average_quality: averageQuality,
                has_bespoke_rule: hasBespokeRule,
                rule_effectiveness: hasBespokeRule ? successRate : 0,
                frontpage_risk_rate: frontpageRiskRate,
                cache_hit_rate: cacheHitRate,
                average_extraction_time: averageExtractionTime,
                recent_performance: recentPerformance,
                optimization_status: optimizationStatus
            });
        }

        return domainMetrics.sort((a, b) => b.total_extractions - a.total_extractions);
    }

    /**
     * Get quality trend metrics
     */
    async getQualityTrendMetrics(): Promise<QualityTrendMetrics> {
        const allExtractions = this.extractionHistory;
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const recentExtractions = allExtractions.filter(e => e.timestamp >= sevenDaysAgo);
        const olderExtractions = allExtractions.filter(e =>
            e.timestamp < sevenDaysAgo &&
            e.timestamp >= new Date(sevenDaysAgo.getTime() - 7 * 24 * 60 * 60 * 1000)
        );

        // Overall quality metrics
        const overallQualityScore = allExtractions.length > 0
            ? allExtractions.reduce((sum, e) => sum + e.analytics.quality_metrics.overall_score, 0) / allExtractions.length
            : 0;

        const recentQuality = recentExtractions.length > 0
            ? recentExtractions.reduce((sum, e) => sum + e.analytics.quality_metrics.overall_score, 0) / recentExtractions.length
            : 0;

        const olderQuality = olderExtractions.length > 0
            ? olderExtractions.reduce((sum, e) => sum + e.analytics.quality_metrics.overall_score, 0) / olderExtractions.length
            : 0;

        // Quality distribution
        const qualityDistribution = {
            excellent: allExtractions.filter(e => e.analytics.quality_metrics.overall_score >= 0.8).length / allExtractions.length,
            good: allExtractions.filter(e => e.analytics.quality_metrics.overall_score >= 0.6 && e.analytics.quality_metrics.overall_score < 0.8).length / allExtractions.length,
            fair: allExtractions.filter(e => e.analytics.quality_metrics.overall_score >= 0.4 && e.analytics.quality_metrics.overall_score < 0.6).length / allExtractions.length,
            poor: allExtractions.filter(e => e.analytics.quality_metrics.overall_score < 0.4).length / allExtractions.length
        };

        // Detection rates
        const frontpageDetectionRate = allExtractions.filter(e => e.analytics.quality_metrics.frontpage_risk > 0.6).length / Math.max(allExtractions.length, 1);
        const structuredDataRate = allExtractions.filter(e => e.analytics.quality_metrics.has_structured_data).length / Math.max(allExtractions.length, 1);
        const metadataCompletenessRate = allExtractions.filter(e => e.analytics.quality_metrics.metadata_complete).length / Math.max(allExtractions.length, 1);

        // Identify problem areas
        const problemAreas: QualityTrendMetrics['problem_areas'] = [];

        if (qualityDistribution.poor > 0.2) {
            problemAreas.push({
                issue: 'High rate of poor quality extractions',
                affected_domains: [...new Set(allExtractions
                    .filter(e => e.analytics.quality_metrics.overall_score < 0.4)
                    .map(e => e.domain)
                )].slice(0, 5),
                severity: 'high',
                suggested_fix: 'Review and improve bespoke rules for affected domains'
            });
        }

        if (frontpageDetectionRate > 0.15) {
            problemAreas.push({
                issue: 'High frontpage false positive rate',
                affected_domains: [...new Set(allExtractions
                    .filter(e => e.analytics.quality_metrics.frontpage_risk > 0.6)
                    .map(e => e.domain)
                )].slice(0, 5),
                severity: 'medium',
                suggested_fix: 'Improve article URL validation and frontpage detection algorithms'
            });
        }

        if (structuredDataRate < 0.3) {
            problemAreas.push({
                issue: 'Low structured data utilization',
                affected_domains: [...new Set(allExtractions
                    .filter(e => !e.analytics.quality_metrics.has_structured_data)
                    .map(e => e.domain)
                )].slice(0, 5),
                severity: 'low',
                suggested_fix: 'Enhance structured data detection patterns'
            });
        }

        return {
            overall_quality_score: overallQualityScore,
            quality_trend_7d: recentQuality - olderQuality,
            frontpage_detection_rate: frontpageDetectionRate,
            structured_data_rate: structuredDataRate,
            metadata_completeness_rate: metadataCompletenessRate,
            content_quality_distribution: qualityDistribution,
            problem_areas: problemAreas
        };
    }

    /**
     * Get comprehensive analytics summary
     */
    async getAnalyticsSummary() {
        const [ruleMetrics, cacheMetrics, suggestions, domainMetrics, qualityMetrics] = await Promise.all([
            this.getRulePerformanceMetrics(),
            this.getCachePerformanceMetrics(),
            this.generateOptimizationSuggestions(),
            this.getDomainPerformanceMetrics(),
            this.getQualityTrendMetrics()
        ]);

        return {
            timestamp: new Date().toISOString(),
            summary: {
                total_extractions: this.extractionHistory.length,
                unique_domains: new Set(this.extractionHistory.map(e => e.domain)).size,
                overall_success_rate: domainMetrics.reduce((sum, d) => sum + d.success_rate, 0) / Math.max(domainMetrics.length, 1),
                cache_hit_rate: cacheMetrics.hit_rate,
                active_bespoke_rules: ruleMetrics.filter(r => r.total_extractions > 0).length,
                pending_optimizations: suggestions.filter(s => s.priority === 'high').length
            },
            rule_performance: ruleMetrics,
            cache_performance: cacheMetrics,
            optimization_suggestions: suggestions,
            domain_performance: domainMetrics,
            quality_trends: qualityMetrics
        };
    }

    private extractDomain(url: string): string {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch {
            return 'unknown';
        }
    }

    private inferRegion(domain: string): string {
        if (domain.endsWith('.no') || domain.endsWith('.se') || domain.endsWith('.dk') || domain.endsWith('.fi')) {
            return 'scandinavian';
        }
        if (domain.endsWith('.com') || domain.endsWith('.org')) {
            return 'american';
        }
        return 'european';
    }
}