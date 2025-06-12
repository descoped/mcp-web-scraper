/**
 * Rule Effectiveness Analytics and Performance Monitoring
 * Tracks success rates, performance metrics, and optimization opportunities
 */

import {ExtractionResult} from '../types';
import {EnhancedContentQuality} from '../quality/enhancedQualityAnalyzer';

export interface RulePerformanceMetrics {
    ruleId: string;
    ruleName: string;
    domain: string;

    // Success metrics
    totalExtractions: number;
    successfulExtractions: number;
    successRate: number;

    // Quality metrics
    averageQualityScore: number;
    averageConfidence: number;
    frontpageRejections: number;

    // Performance metrics
    averageExtractionTime: number;
    minExtractionTime: number;
    maxExtractionTime: number;

    // Detailed breakdowns
    fieldSuccessRates: {
        title: number;
        content: number;
        author: number;
        date: number;
        summary: number;
    };

    // Time series data
    recentPerformance: PerformanceDataPoint[];

    // Last updated
    lastUpdated: Date;
    firstSeen: Date;
}

export interface PerformanceDataPoint {
    timestamp: Date;
    successRate: number;
    qualityScore: number;
    extractionTime: number;
    frontpageRisk: number;
}

export interface UniversalDetectorMetrics {
    totalExtractions: number;
    successfulExtractions: number;
    successRate: number;
    averageQualityScore: number;
    averageConfidence: number;
    averageExtractionTime: number;

    // Breakdown by detection method
    methodBreakdown: {
        'structured-data': PerformanceDataPoint[];
        'semantic-html5': PerformanceDataPoint[];
        'hybrid': PerformanceDataPoint[];
    };

    // Domain performance without rules
    domainPerformance: Map<string, {
        extractions: number;
        successRate: number;
        averageQuality: number;
    }>;
}

export interface RuleOptimizationSuggestion {
    ruleId: string;
    type: 'selector_improvement' | 'new_selector' | 'rule_expansion' | 'performance_tuning';
    priority: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    currentPerformance: number;
    estimatedImprovement: number;
    implementationComplexity: 'simple' | 'moderate' | 'complex';

    // Specific suggestions
    suggestedChanges?: {
        selectors?: {
            field: string;
            currentSelectors: string[];
            suggestedSelectors: string[];
            reason: string;
        }[];
        contentProcessing?: {
            currentRules: string[];
            suggestedRules: string[];
            reason: string;
        };
    };
}

export class RuleEffectivenessTracker {
    private ruleMetrics: Map<string, RulePerformanceMetrics> = new Map();
    private universalMetrics: UniversalDetectorMetrics;
    private maxHistoryLength: number = 100;

    constructor() {
        this.universalMetrics = {
            totalExtractions: 0,
            successfulExtractions: 0,
            successRate: 0,
            averageQualityScore: 0,
            averageConfidence: 0,
            averageExtractionTime: 0,
            methodBreakdown: {
                'structured-data': [],
                'semantic-html5': [],
                'hybrid': []
            },
            domainPerformance: new Map()
        };
    }

    recordExtractionResult(
        url: string,
        extractionResult: ExtractionResult,
        qualityMetrics: EnhancedContentQuality,
        ruleId?: string,
        ruleName?: string
    ): void {
        const timestamp = new Date();
        const domain = this.extractDomain(url);

        const dataPoint: PerformanceDataPoint = {
            timestamp,
            successRate: extractionResult.success ? 1 : 0,
            qualityScore: qualityMetrics.score,
            extractionTime: extractionResult.metadata.extraction_time || 0,
            frontpageRisk: qualityMetrics.frontpageRisk.riskScore
        };

        if (ruleId && ruleName) {
            this.recordRulePerformance(ruleId, ruleName, domain, extractionResult, qualityMetrics, dataPoint);
        } else {
            this.recordUniversalPerformance(domain, extractionResult, qualityMetrics, dataPoint);
        }
    }

    private recordRulePerformance(
        ruleId: string,
        ruleName: string,
        domain: string,
        extractionResult: ExtractionResult,
        qualityMetrics: EnhancedContentQuality,
        dataPoint: PerformanceDataPoint
    ): void {

        let metrics = this.ruleMetrics.get(ruleId);
        const now = new Date();

        if (!metrics) {
            metrics = {
                ruleId,
                ruleName,
                domain,
                totalExtractions: 0,
                successfulExtractions: 0,
                successRate: 0,
                averageQualityScore: 0,
                averageConfidence: 0,
                frontpageRejections: 0,
                averageExtractionTime: 0,
                minExtractionTime: Infinity,
                maxExtractionTime: 0,
                fieldSuccessRates: {
                    title: 0,
                    content: 0,
                    author: 0,
                    date: 0,
                    summary: 0
                },
                recentPerformance: [],
                lastUpdated: now,
                firstSeen: now
            };
            this.ruleMetrics.set(ruleId, metrics);
        }

        // Update basic metrics
        metrics.totalExtractions++;
        if (extractionResult.success) {
            metrics.successfulExtractions++;
        }
        metrics.successRate = metrics.successfulExtractions / metrics.totalExtractions;

        // Update quality metrics
        const totalQuality = metrics.averageQualityScore * (metrics.totalExtractions - 1) + qualityMetrics.score;
        metrics.averageQualityScore = totalQuality / metrics.totalExtractions;

        const totalConfidence = metrics.averageConfidence * (metrics.totalExtractions - 1) + extractionResult.confidence;
        metrics.averageConfidence = totalConfidence / metrics.totalExtractions;

        if (qualityMetrics.frontpageRisk.recommendation === 'reject') {
            metrics.frontpageRejections++;
        }

        // Update timing metrics
        const extractionTime = extractionResult.metadata.extraction_time || 0;
        const totalTime = metrics.averageExtractionTime * (metrics.totalExtractions - 1) + extractionTime;
        metrics.averageExtractionTime = totalTime / metrics.totalExtractions;
        metrics.minExtractionTime = Math.min(metrics.minExtractionTime, extractionTime);
        metrics.maxExtractionTime = Math.max(metrics.maxExtractionTime, extractionTime);

        // Update field success rates
        this.updateFieldSuccessRates(metrics, extractionResult.data);

        // Add to recent performance (keep last N data points)
        metrics.recentPerformance.push(dataPoint);
        if (metrics.recentPerformance.length > this.maxHistoryLength) {
            metrics.recentPerformance.shift();
        }

        metrics.lastUpdated = now;
    }

    private recordUniversalPerformance(
        domain: string,
        extractionResult: ExtractionResult,
        qualityMetrics: EnhancedContentQuality,
        dataPoint: PerformanceDataPoint
    ): void {

        // Update overall universal metrics
        this.universalMetrics.totalExtractions++;
        if (extractionResult.success) {
            this.universalMetrics.successfulExtractions++;
        }
        this.universalMetrics.successRate = this.universalMetrics.successfulExtractions / this.universalMetrics.totalExtractions;

        const totalQuality = this.universalMetrics.averageQualityScore * (this.universalMetrics.totalExtractions - 1) + qualityMetrics.score;
        this.universalMetrics.averageQualityScore = totalQuality / this.universalMetrics.totalExtractions;

        const totalConfidence = this.universalMetrics.averageConfidence * (this.universalMetrics.totalExtractions - 1) + extractionResult.confidence;
        this.universalMetrics.averageConfidence = totalConfidence / this.universalMetrics.totalExtractions;

        const extractionTime = extractionResult.metadata.extraction_time || 0;
        const totalTime = this.universalMetrics.averageExtractionTime * (this.universalMetrics.totalExtractions - 1) + extractionTime;
        this.universalMetrics.averageExtractionTime = totalTime / this.universalMetrics.totalExtractions;

        // Update method breakdown
        const method = extractionResult.method as keyof typeof this.universalMetrics.methodBreakdown;
        if (this.universalMetrics.methodBreakdown[method]) {
            this.universalMetrics.methodBreakdown[method].push(dataPoint);
            if (this.universalMetrics.methodBreakdown[method].length > this.maxHistoryLength) {
                this.universalMetrics.methodBreakdown[method].shift();
            }
        }

        // Update domain performance
        let domainPerf = this.universalMetrics.domainPerformance.get(domain);
        if (!domainPerf) {
            domainPerf = {
                extractions: 0,
                successRate: 0,
                averageQuality: 0
            };
            this.universalMetrics.domainPerformance.set(domain, domainPerf);
        }

        domainPerf.extractions++;
        const successCount = domainPerf.successRate * (domainPerf.extractions - 1) + (extractionResult.success ? 1 : 0);
        domainPerf.successRate = successCount / domainPerf.extractions;

        const qualityTotal = domainPerf.averageQuality * (domainPerf.extractions - 1) + qualityMetrics.score;
        domainPerf.averageQuality = qualityTotal / domainPerf.extractions;
    }

    private updateFieldSuccessRates(metrics: RulePerformanceMetrics, data: Partial<ExtractionResult['data']>): void {
        const fields = ['title', 'content', 'author', 'date', 'summary'] as const;

        for (const field of fields) {
            const hasField = data[field] && (data[field] as string).trim().length > 0;
            const currentSuccess = metrics.fieldSuccessRates[field] * (metrics.totalExtractions - 1);
            const newSuccess = currentSuccess + (hasField ? 1 : 0);
            metrics.fieldSuccessRates[field] = newSuccess / metrics.totalExtractions;
        }
    }

    getRuleMetrics(ruleId: string): RulePerformanceMetrics | undefined {
        return this.ruleMetrics.get(ruleId);
    }

    getAllRuleMetrics(): Map<string, RulePerformanceMetrics> {
        return new Map(this.ruleMetrics);
    }

    getUniversalMetrics(): UniversalDetectorMetrics {
        return {...this.universalMetrics};
    }

    generateOptimizationSuggestions(): RuleOptimizationSuggestion[] {
        const suggestions: RuleOptimizationSuggestion[] = [];

        // Analyze each rule for optimization opportunities
        for (const [ruleId, metrics] of this.ruleMetrics) {
            suggestions.push(...this.analyzeRuleForOptimization(metrics));
        }

        // Suggest new rules for domains with poor universal performance
        suggestions.push(...this.suggestNewRules());

        // Sort by priority and estimated improvement
        return suggestions.sort((a, b) => {
            const priorityOrder = {critical: 4, high: 3, medium: 2, low: 1};
            const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return b.estimatedImprovement - a.estimatedImprovement;
        });
    }

    private analyzeRuleForOptimization(metrics: RulePerformanceMetrics): RuleOptimizationSuggestion[] {
        const suggestions: RuleOptimizationSuggestion[] = [];

        // Check for low success rate
        if (metrics.successRate < 0.8) {
            suggestions.push({
                ruleId: metrics.ruleId,
                type: 'selector_improvement',
                priority: metrics.successRate < 0.5 ? 'critical' : 'high',
                description: `Rule ${metrics.ruleName} has low success rate (${(metrics.successRate * 100).toFixed(1)}%)`,
                currentPerformance: metrics.successRate,
                estimatedImprovement: 0.9 - metrics.successRate,
                implementationComplexity: 'moderate'
            });
        }

        // Check for poor field extraction rates
        const poorFields = Object.entries(metrics.fieldSuccessRates)
            .filter(([_, rate]) => rate < 0.7)
            .map(([field, rate]) => ({field, rate}));

        if (poorFields.length > 0) {
            suggestions.push({
                ruleId: metrics.ruleId,
                type: 'new_selector',
                priority: poorFields.length > 2 ? 'high' : 'medium',
                description: `Poor extraction rates for fields: ${poorFields.map(f => f.field).join(', ')}`,
                currentPerformance: Math.min(...poorFields.map(f => f.rate)),
                estimatedImprovement: 0.85 - Math.min(...poorFields.map(f => f.rate)),
                implementationComplexity: 'simple',
                suggestedChanges: {
                    selectors: poorFields.map(f => ({
                        field: f.field,
                        currentSelectors: [], // Would need rule data to populate
                        suggestedSelectors: [], // Would need analysis to suggest
                        reason: `Current success rate: ${(f.rate * 100).toFixed(1)}%`
                    }))
                }
            });
        }

        // Check for slow performance
        if (metrics.averageExtractionTime > 1000) { // > 1 second
            suggestions.push({
                ruleId: metrics.ruleId,
                type: 'performance_tuning',
                priority: metrics.averageExtractionTime > 3000 ? 'high' : 'medium',
                description: `Slow extraction time: ${metrics.averageExtractionTime.toFixed(0)}ms average`,
                currentPerformance: 1000 / metrics.averageExtractionTime, // Inverse for performance
                estimatedImprovement: 0.5,
                implementationComplexity: 'moderate'
            });
        }

        // Check for high frontpage rejection rate
        const frontpageRate = metrics.frontpageRejections / metrics.totalExtractions;
        if (frontpageRate > 0.1) {
            suggestions.push({
                ruleId: metrics.ruleId,
                type: 'selector_improvement',
                priority: frontpageRate > 0.3 ? 'high' : 'medium',
                description: `High frontpage rejection rate: ${(frontpageRate * 100).toFixed(1)}%`,
                currentPerformance: 1 - frontpageRate,
                estimatedImprovement: frontpageRate * 0.7, // Can eliminate 70% of false positives
                implementationComplexity: 'moderate'
            });
        }

        return suggestions;
    }

    private suggestNewRules(): RuleOptimizationSuggestion[] {
        const suggestions: RuleOptimizationSuggestion[] = [];

        // Find domains with many extractions but no rules and poor performance
        for (const [domain, perf] of this.universalMetrics.domainPerformance) {
            if (perf.extractions >= 10 && perf.successRate < 0.6 && !this.hasRuleForDomain(domain)) {
                suggestions.push({
                    ruleId: `new-rule-${domain}`,
                    type: 'rule_expansion',
                    priority: perf.extractions > 50 ? 'high' : 'medium',
                    description: `Create bespoke rule for ${domain} (${perf.extractions} extractions, ${(perf.successRate * 100).toFixed(1)}% success)`,
                    currentPerformance: perf.successRate,
                    estimatedImprovement: 0.85 - perf.successRate,
                    implementationComplexity: 'complex'
                });
            }
        }

        return suggestions;
    }

    private hasRuleForDomain(domain: string): boolean {
        for (const metrics of this.ruleMetrics.values()) {
            if (metrics.domain === domain) {
                return true;
            }
        }
        return false;
    }

    private extractDomain(url: string): string {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace(/^www\./, '');
        } catch {
            return 'unknown';
        }
    }

    exportMetrics(): {
        rules: RulePerformanceMetrics[];
        universal: UniversalDetectorMetrics;
        optimizationSuggestions: RuleOptimizationSuggestion[];
        summary: {
            totalRules: number;
            averageRuleSuccessRate: number;
            topPerformingRules: string[];
            underperformingRules: string[];
            universalSuccessRate: number;
            totalExtractions: number;
        };
    } {

        const rulesArray = Array.from(this.ruleMetrics.values());
        const averageRuleSuccessRate = rulesArray.length > 0 ?
            rulesArray.reduce((sum, rule) => sum + rule.successRate, 0) / rulesArray.length : 0;

        const sortedRules = rulesArray.sort((a, b) => b.successRate - a.successRate);
        const topPerformingRules = sortedRules.slice(0, 3).map(rule => rule.ruleName);
        const underperformingRules = sortedRules.filter(rule => rule.successRate < 0.7).map(rule => rule.ruleName);

        return {
            rules: rulesArray,
            universal: this.getUniversalMetrics(),
            optimizationSuggestions: this.generateOptimizationSuggestions(),
            summary: {
                totalRules: rulesArray.length,
                averageRuleSuccessRate,
                topPerformingRules,
                underperformingRules,
                universalSuccessRate: this.universalMetrics.successRate,
                totalExtractions: this.universalMetrics.totalExtractions + rulesArray.reduce((sum, rule) => sum + rule.totalExtractions, 0)
            }
        };
    }

    // Reset metrics (useful for testing)
    reset(): void {
        this.ruleMetrics.clear();
        this.universalMetrics = {
            totalExtractions: 0,
            successfulExtractions: 0,
            successRate: 0,
            averageQualityScore: 0,
            averageConfidence: 0,
            averageExtractionTime: 0,
            methodBreakdown: {
                'structured-data': [],
                'semantic-html5': [],
                'hybrid': []
            },
            domainPerformance: new Map()
        };
    }
}