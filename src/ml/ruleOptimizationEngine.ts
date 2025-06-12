/**
 * Phase 4B.1 - Performance-Driven Rule Optimization Engine
 * Automatically optimizes extraction rules based on performance analytics
 */

import {type DOMAnalysisResult, DOMPatternAnalyzer, type ExtractedPattern} from './domPatternAnalyzer.js';
import {RuleEffectivenessTracker} from '../content/analytics/ruleEffectivenessTracker.js';
import type {SiteRule} from '../content/rules/types.js';
import type {Page} from 'playwright';

export interface RuleMetrics {
    ruleId: string;
    ruleName: string;
    domain: string;
    successRate: number;
    averageQualityScore: number;
    averageExtractionTime: number;
    totalExtractions: number;
    fieldSuccessRates?: Record<string, number>;
}

export interface OptimizationCandidate {
    ruleId: string;
    ruleName: string;
    domain: string;
    currentPerformance: {
        successRate: number;
        averageQuality: number;
        averageTime: number;
        totalExtractions: number;
    };
    issues: RuleIssue[];
    optimizationPotential: number; // 0-1 score
    priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface RuleIssue {
    type: 'low_success_rate' | 'poor_quality' | 'slow_performance' | 'outdated_selectors' | 'missing_fields';
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    affectedFields: string[];
    suggestedFix: string;
    confidence: number;
}

export interface OptimizedRule {
    originalRule: SiteRule;
    optimizedRule: SiteRule;
    improvements: RuleImprovement[];
    expectedImpact: {
        successRateImprovement: number;
        qualityScoreImprovement: number;
        performanceImprovement: number;
    };
    testPlan: TestPlan;
}

export interface RuleImprovement {
    type: 'selector_update' | 'new_selector' | 'selector_removal' | 'priority_change' | 'transformer_addition';
    field: string;
    oldValue: string;
    newValue: string;
    reasoning: string;
    confidence: number;
}

export interface TestPlan {
    testUrls: string[];
    successCriteria: {
        minimumSuccessRate: number;
        minimumQualityScore: number;
        maximumTimeIncrease: number;
    };
    abTestDuration: number; // in hours
    trafficSplit: number; // 0-1, percentage of traffic to new rule
}

export class RuleOptimizationEngine {
    private domAnalyzer: DOMPatternAnalyzer;
    private ruleTracker: RuleEffectivenessTracker;
    private optimizationHistory: Map<string, OptimizationAttempt[]> = new Map();

    constructor(ruleTracker: RuleEffectivenessTracker) {
        this.domAnalyzer = new DOMPatternAnalyzer();
        this.ruleTracker = ruleTracker;
    }

    /**
     * Identify rules that need optimization based on performance analytics
     */
    async identifyOptimizationCandidates(): Promise<OptimizationCandidate[]> {
        console.log('🔍 Identifying rule optimization candidates...');

        const exportedMetrics = this.ruleTracker.exportMetrics();
        const candidates: OptimizationCandidate[] = [];

        for (const ruleMetrics of exportedMetrics.rules) {
            // Skip rules with insufficient data
            if (ruleMetrics.totalExtractions < 10) continue;

            const issues = this.analyzeRuleIssues(ruleMetrics);
            if (issues.length === 0) continue;

            const optimizationPotential = this.calculateOptimizationPotential(ruleMetrics, issues);
            const priority = this.determinePriority(ruleMetrics, issues);

            candidates.push({
                ruleId: ruleMetrics.ruleId,
                ruleName: ruleMetrics.ruleName,
                domain: ruleMetrics.domain,
                currentPerformance: {
                    successRate: ruleMetrics.successRate,
                    averageQuality: ruleMetrics.averageQualityScore,
                    averageTime: ruleMetrics.averageExtractionTime,
                    totalExtractions: ruleMetrics.totalExtractions
                },
                issues,
                optimizationPotential,
                priority
            });
        }

        // Sort by optimization potential and priority
        candidates.sort((a, b) => {
            const priorityOrder = {critical: 4, high: 3, medium: 2, low: 1};
            const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return b.optimizationPotential - a.optimizationPotential;
        });

        console.log(`🎯 Found ${candidates.length} optimization candidates`);
        return candidates;
    }

    /**
     * Generate optimized rule for a specific domain using ML analysis
     */
    async optimizeRule(candidate: OptimizationCandidate, testUrls: string[], page: Page): Promise<OptimizedRule | null> {
        console.log(`🔧 Optimizing rule: ${candidate.ruleName} for ${candidate.domain}`);

        try {
            // Analyze current performance on test URLs
            const analysisResults: DOMAnalysisResult[] = [];

            for (const url of testUrls.slice(0, 3)) { // Limit to 3 URLs for performance
                try {
                    await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 10000});
                    const analysis = await this.domAnalyzer.analyzePage(page);
                    analysisResults.push(analysis);
                } catch (error) {
                    console.warn(`Failed to analyze ${url}:`, error);
                }
            }

            if (analysisResults.length === 0) {
                console.error('No successful analysis results');
                return null;
            }

            // Find the original rule (simulated - would load from rule system)
            const originalRule = await this.loadOriginalRule(candidate.ruleId);
            if (!originalRule) {
                console.error(`Original rule not found: ${candidate.ruleId}`);
                return null;
            }

            // Generate optimized selectors
            const optimizedRule = await this.generateOptimizedRule(originalRule, analysisResults, candidate);

            // Calculate expected improvements
            const expectedImpact = this.calculateExpectedImpact(candidate, analysisResults);

            // Generate test plan
            const testPlan = this.generateTestPlan(candidate, testUrls);

            // Document improvements
            const improvements = this.documentImprovements(originalRule, optimizedRule);

            console.log(`✅ Generated optimized rule with ${improvements.length} improvements`);

            return {
                originalRule,
                optimizedRule,
                improvements,
                expectedImpact,
                testPlan
            };

        } catch (error) {
            console.error(`Failed to optimize rule ${candidate.ruleId}:`, error);
            return null;
        }
    }

    /**
     * Analyze issues with a rule based on performance metrics
     */
    private analyzeRuleIssues(ruleMetrics: RuleMetrics): RuleIssue[] {
        const issues: RuleIssue[] = [];

        // Low success rate issue
        if (ruleMetrics.successRate < 0.7) {
            issues.push({
                type: 'low_success_rate',
                severity: ruleMetrics.successRate < 0.4 ? 'critical' : 'high',
                description: `Success rate is ${(ruleMetrics.successRate * 100).toFixed(1)}% (target: 80%+)`,
                affectedFields: ['all'],
                suggestedFix: 'Update selectors to match current DOM structure',
                confidence: 0.9
            });
        }

        // Poor quality issue
        if (ruleMetrics.averageQualityScore < 0.6) {
            issues.push({
                type: 'poor_quality',
                severity: ruleMetrics.averageQualityScore < 0.4 ? 'critical' : 'medium',
                description: `Quality score is ${(ruleMetrics.averageQualityScore * 100).toFixed(1)}% (target: 70%+)`,
                affectedFields: this.identifyPoorQualityFields(ruleMetrics),
                suggestedFix: 'Improve selector specificity and add fallback selectors',
                confidence: 0.8
            });
        }

        // Slow performance issue
        if (ruleMetrics.averageExtractionTime > 2000) {
            issues.push({
                type: 'slow_performance',
                severity: ruleMetrics.averageExtractionTime > 5000 ? 'high' : 'medium',
                description: `Average extraction time is ${ruleMetrics.averageExtractionTime}ms (target: <2000ms)`,
                affectedFields: ['all'],
                suggestedFix: 'Optimize selectors for better performance',
                confidence: 0.7
            });
        }

        // Field-specific issues
        if (ruleMetrics.fieldSuccessRates) {
            for (const [field, rate] of Object.entries(ruleMetrics.fieldSuccessRates)) {
                if ((rate as number) < 0.6) {
                    issues.push({
                        type: 'missing_fields',
                        severity: (rate as number) < 0.3 ? 'high' : 'medium',
                        description: `${field} extraction rate is ${((rate as number) * 100).toFixed(1)}%`,
                        affectedFields: [field],
                        suggestedFix: `Add better selectors for ${field} field`,
                        confidence: 0.85
                    });
                }
            }
        }

        return issues;
    }

    /**
     * Calculate optimization potential score
     */
    private calculateOptimizationPotential(ruleMetrics: RuleMetrics, issues: RuleIssue[]): number {
        let potential = 0;

        // Base potential from current performance gaps
        potential += Math.max(0, 0.9 - ruleMetrics.successRate) * 0.4;
        potential += Math.max(0, 0.8 - ruleMetrics.averageQualityScore) * 0.3;

        // Additional potential from specific issues
        for (const issue of issues) {
            switch (issue.severity) {
                case 'critical':
                    potential += 0.3;
                    break;
                case 'high':
                    potential += 0.2;
                    break;
                case 'medium':
                    potential += 0.1;
                    break;
                case 'low':
                    potential += 0.05;
                    break;
            }
        }

        // Scale by extraction volume (more extractions = higher priority)
        const volumeMultiplier = Math.min(1.2, 1 + Math.log10(ruleMetrics.totalExtractions) / 10);
        potential *= volumeMultiplier;

        return Math.min(potential, 1.0);
    }

    /**
     * Determine optimization priority
     */
    private determinePriority(ruleMetrics: RuleMetrics, issues: RuleIssue[]): 'critical' | 'high' | 'medium' | 'low' {
        const hasCriticalIssues = issues.some(issue => issue.severity === 'critical');
        const hasHighIssues = issues.some(issue => issue.severity === 'high');
        const isHighVolume = ruleMetrics.totalExtractions > 100;

        if (hasCriticalIssues || (hasHighIssues && isHighVolume)) return 'critical';
        if (hasHighIssues || (isHighVolume && ruleMetrics.successRate < 0.6)) return 'high';
        if (ruleMetrics.successRate < 0.7 || ruleMetrics.averageQualityScore < 0.6) return 'medium';
        return 'low';
    }

    /**
     * Generate optimized rule based on ML analysis
     */
    private async generateOptimizedRule(
        originalRule: SiteRule,
        analysisResults: DOMAnalysisResult[],
        candidate: OptimizationCandidate
    ): Promise<SiteRule> {
        const optimizedRule: SiteRule = JSON.parse(JSON.stringify(originalRule)); // Deep clone

        // Aggregate patterns from all analysis results
        const fieldPatterns = new Map<string, ExtractedPattern[]>();

        for (const result of analysisResults) {
            for (const pattern of result.patterns) {
                if (!fieldPatterns.has(pattern.field)) {
                    fieldPatterns.set(pattern.field, []);
                }
                fieldPatterns.get(pattern.field)!.push(pattern);
            }
        }

        // Update selectors for each field
        for (const [field, patterns] of fieldPatterns) {
            if (patterns.length === 0) continue;

            // Find best performing pattern
            const bestPattern = patterns.reduce((best, current) =>
                current.confidence > best.confidence ? current : best
            );

            // Update rule selectors
            if (optimizedRule.selectors[field as keyof typeof optimizedRule.selectors]) {
                // Combine ML-generated selectors with existing ones, prioritizing ML results
                const newSelectors = [
                    ...bestPattern.selectors.slice(0, 2), // Top 2 ML selectors
                    ...optimizedRule.selectors[field as keyof typeof optimizedRule.selectors] // Existing selectors as fallback
                ].slice(0, 4); // Limit to 4 selectors per field

                (optimizedRule.selectors as Record<string, string[]>)[field] = newSelectors;

                console.log(`🔄 Updated ${field} selectors:`, newSelectors);
            }
        }

        // Add metadata about optimization
        optimizedRule.metadata = {
            ...optimizedRule.metadata,
            optimized: true,
            optimizationDate: new Date().toISOString(),
            optimizationReason: `ML-based optimization for ${candidate.issues.map(i => i.type).join(', ')}`,
            mlConfidence: analysisResults.reduce((sum, r) => sum + r.overallConfidence, 0) / analysisResults.length
        };

        return optimizedRule;
    }

    /**
     * Calculate expected impact of optimization
     */
    private calculateExpectedImpact(candidate: OptimizationCandidate, analysisResults: DOMAnalysisResult[]) {
        const avgConfidence = analysisResults.reduce((sum, r) => sum + r.overallConfidence, 0) / analysisResults.length;

        return {
            successRateImprovement: Math.max(0, avgConfidence - candidate.currentPerformance.successRate) * 0.8,
            qualityScoreImprovement: Math.max(0, avgConfidence - candidate.currentPerformance.averageQuality) * 0.7,
            performanceImprovement: candidate.issues.some(i => i.type === 'slow_performance') ? 0.3 : 0.1
        };
    }

    /**
     * Generate test plan for A/B testing the optimized rule
     */
    private generateTestPlan(candidate: OptimizationCandidate, testUrls: string[]): TestPlan {
        return {
            testUrls: testUrls.slice(0, 10), // Limit test URLs
            successCriteria: {
                minimumSuccessRate: Math.max(candidate.currentPerformance.successRate + 0.1, 0.7),
                minimumQualityScore: Math.max(candidate.currentPerformance.averageQuality + 0.1, 0.6),
                maximumTimeIncrease: candidate.currentPerformance.averageTime * 1.2 // Allow 20% time increase
            },
            abTestDuration: candidate.priority === 'critical' ? 24 : 72, // Hours
            trafficSplit: candidate.priority === 'critical' ? 0.5 : 0.2 // Percentage to new rule
        };
    }

    /**
     * Document improvements made to the rule
     */
    private documentImprovements(originalRule: SiteRule, optimizedRule: SiteRule): RuleImprovement[] {
        const improvements: RuleImprovement[] = [];

        // Compare selectors for each field
        for (const field of ['title', 'content', 'author', 'date', 'summary']) {
            const originalSelectors = (originalRule.selectors as Record<string, string[]>)[field] || [];
            const optimizedSelectors = (optimizedRule.selectors as Record<string, string[]>)[field] || [];

            if (JSON.stringify(originalSelectors) !== JSON.stringify(optimizedSelectors)) {
                improvements.push({
                    type: optimizedSelectors.length > originalSelectors.length ? 'new_selector' : 'selector_update',
                    field,
                    oldValue: originalSelectors.join(', '),
                    newValue: optimizedSelectors.join(', '),
                    reasoning: 'ML analysis suggested better performing selectors',
                    confidence: 0.8
                });
            }
        }

        return improvements;
    }

    /**
     * Load original rule (simulated - would integrate with rule loading system)
     */
    private async loadOriginalRule(ruleId: string): Promise<SiteRule | null> {
        // This would integrate with the actual rule loading system
        // For now, return a simulated rule structure
        return {
            id: ruleId,
            name: `Rule for ${ruleId}`,
            domains: [ruleId.replace('-enhanced', '')],
            selectors: {
                title: ['h1', '.headline', '.title'],
                content: ['.article-body', '.content', 'article'],
                author: ['.author', '.byline'],
                date: ['.date', 'time', '.published'],
                summary: ['.summary', '.excerpt', '.lead']
            },
            priority: 1,
            metadata: {
                version: '1.0',
                created: new Date().toISOString()
            }
        };
    }

    /**
     * Identify fields with poor quality extraction
     */
    private identifyPoorQualityFields(ruleMetrics: RuleMetrics): string[] {
        const poorFields: string[] = [];

        if (ruleMetrics.fieldSuccessRates) {
            for (const [field, rate] of Object.entries(ruleMetrics.fieldSuccessRates)) {
                if ((rate as number) < 0.6) {
                    poorFields.push(field);
                }
            }
        }

        return poorFields.length > 0 ? poorFields : ['content']; // Default to content if no specific data
    }
}

interface OptimizationAttempt {
    timestamp: Date;
    ruleId: string;
    result: 'success' | 'failure' | 'rollback';
    metrics: {
        beforeSuccessRate: number;
        afterSuccessRate: number;
        beforeQuality: number;
        afterQuality: number;
    };
}