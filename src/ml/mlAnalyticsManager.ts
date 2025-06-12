/**
 * Phase 4B.1 - ML Rule Generation Analytics and Monitoring
 * Comprehensive analytics for machine learning rule generation and optimization
 */

import {type ABTest, ABTestFramework} from './abTestFramework.js';
import {AutomaticRuleUpdater, type SiteChangeDetection} from './automaticRuleUpdater.js';

export interface MLAnalytics {
    ruleGeneration: RuleGenerationMetrics;
    optimization: OptimizationMetrics;
    abTesting: ABTestingMetrics;
    automation: AutomationMetrics;
    performance: PerformanceMetrics;
    summary: MLSummaryMetrics;
}

export interface RuleGenerationMetrics {
    totalRulesGenerated: number;
    rulesInProduction: number;
    rulesInTesting: number;
    generationSuccessRate: number;
    averageGenerationTime: number;
    domainsCovered: number;
    generationHistory: RuleGenerationEvent[];
    qualityDistribution: {
        excellent: number; // >0.8 confidence
        good: number;      // 0.6-0.8 confidence
        fair: number;      // 0.4-0.6 confidence
        poor: number;      // <0.4 confidence
    };
}

export interface OptimizationMetrics {
    optimizationCandidatesIdentified: number;
    optimizationsImplemented: number;
    optimizationSuccessRate: number;
    averagePerformanceImprovement: number;
    rulesNeedingAttention: number;
    optimizationHistory: OptimizationEvent[];
    impactBreakdown: {
        successRateImprovements: number;
        qualityImprovements: number;
        performanceImprovements: number;
        rollbacks: number;
    };
}

export interface ABTestingMetrics {
    activeTests: number;
    completedTests: number;
    testSuccessRate: number; // Tests that led to rule promotion
    averageTestDuration: number;
    significantResults: number;
    testHistory: ABTestSummary[];
    currentTestStatistics: {
        totalTraffic: number;
        treatmentTraffic: number;
        averageConfidenceLevel: number;
    };
}

export interface AutomationMetrics {
    automaticUpdatesDeployed: number;
    changeDetectionAlerts: number;
    emergencyRollbacks: number;
    preventiveMaintenanceActions: number;
    systemUptime: number;
    automationReliability: number;
    recentChanges: SiteChangeDetection[];
    systemHealth: 'excellent' | 'good' | 'warning' | 'critical';
}

export interface PerformanceMetrics {
    mlEnhancementRate: number; // Percentage of extractions using ML
    mlVsTraditionalComparison: {
        mlAverageSuccessRate: number;
        traditionalAverageSuccessRate: number;
        mlAverageQuality: number;
        traditionalAverageQuality: number;
        mlAverageTime: number;
        traditionalAverageTime: number;
    };
    resourceUsage: {
        cpuUsage: number;
        memoryUsage: number;
        analysisTime: number;
    };
    scalabilityMetrics: {
        maxConcurrentAnalysis: number;
        throughput: number; // analyses per hour
        queueDepth: number;
    };
}

export interface MLSummaryMetrics {
    overallSystemHealth: 'excellent' | 'good' | 'warning' | 'critical';
    keyMetrics: {
        rulesGenerated: number;
        domainsOptimized: number;
        performanceGain: number;
        automationLevel: number;
    };
    recommendations: MLRecommendation[];
    trends: {
        ruleGenerationTrend: 'increasing' | 'stable' | 'decreasing';
        optimizationEffectiveness: 'improving' | 'stable' | 'declining';
        systemPerformance: 'improving' | 'stable' | 'declining';
    };
}

export interface RuleGenerationEvent {
    timestamp: Date;
    domain: string;
    ruleId: string;
    confidence: number;
    generationTime: number;
    status: 'generated' | 'tested' | 'deployed' | 'failed';
    metrics: {
        analysisCount: number;
        selectorCount: number;
        fieldsCovered: string[];
    };
}

export interface OptimizationEvent {
    timestamp: Date;
    ruleId: string;
    domain: string;
    optimizationType: 'automatic' | 'manual' | 'emergency';
    beforeMetrics: {
        successRate: number;
        qualityScore: number;
        averageTime: number;
    };
    afterMetrics: {
        successRate: number;
        qualityScore: number;
        averageTime: number;
    };
    status: 'success' | 'failed' | 'rollback';
}

export interface ABTestSummary {
    testId: string;
    domain: string;
    duration: number;
    result: 'promote' | 'rollback' | 'inconclusive';
    improvement: number;
    confidence: number;
    sampleSize: number;
}

export interface MLRecommendation {
    type: 'rule_generation' | 'optimization' | 'testing' | 'maintenance';
    priority: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    actionRequired: string;
    estimatedImpact: string;
    implementationEffort: 'low' | 'medium' | 'high';
}

export class MLAnalyticsManager {
    private abTestFramework?: ABTestFramework;
    private ruleUpdater?: AutomaticRuleUpdater;

    private ruleGenerationEvents: RuleGenerationEvent[] = [];
    private optimizationEvents: OptimizationEvent[] = [];
    private performanceData: Map<string, PerformanceDataPoint[]> = new Map();
    private systemStartTime: Date = new Date();

    constructor() {
        // Initialize with empty state - components will be injected
    }

    /**
     * Initialize with ML system components
     */
    initialize(
        abTestFramework: ABTestFramework,
        ruleUpdater: AutomaticRuleUpdater
    ): void {
        this.abTestFramework = abTestFramework;
        this.ruleUpdater = ruleUpdater;

        console.log('📊 ML Analytics Manager initialized');
    }

    /**
     * Record rule generation event
     */
    recordRuleGeneration(
        domain: string,
        ruleId: string,
        confidence: number,
        generationTime: number,
        analysisCount: number,
        fieldsCovered: string[]
    ): void {
        const event: RuleGenerationEvent = {
            timestamp: new Date(),
            domain,
            ruleId,
            confidence,
            generationTime,
            status: 'generated',
            metrics: {
                analysisCount,
                selectorCount: fieldsCovered.length * 3, // Estimated
                fieldsCovered
            }
        };

        this.ruleGenerationEvents.push(event);
        this.trimHistory(this.ruleGenerationEvents, 1000); // Keep last 1000 events

        console.log(`📈 Recorded rule generation: ${ruleId} for ${domain}`);
    }

    /**
     * Record optimization event
     */
    recordOptimization(
        ruleId: string,
        domain: string,
        type: 'automatic' | 'manual' | 'emergency',
        beforeMetrics: OptimizationEvent['beforeMetrics'],
        afterMetrics: OptimizationEvent['afterMetrics'],
        status: 'success' | 'failed' | 'rollback'
    ): void {
        const event: OptimizationEvent = {
            timestamp: new Date(),
            ruleId,
            domain,
            optimizationType: type,
            beforeMetrics,
            afterMetrics,
            status
        };

        this.optimizationEvents.push(event);
        this.trimHistory(this.optimizationEvents, 1000);

        console.log(`🔧 Recorded optimization: ${ruleId} - ${status}`);
    }

    /**
     * Record performance data point
     */
    recordPerformanceData(
        domain: string,
        mlEnhanced: boolean,
        successRate: number,
        qualityScore: number,
        extractionTime: number
    ): void {
        const key = `${domain}-${mlEnhanced ? 'ml' : 'traditional'}`;

        if (!this.performanceData.has(key)) {
            this.performanceData.set(key, []);
        }

        const dataPoints = this.performanceData.get(key)!;
        dataPoints.push({
            timestamp: new Date(),
            successRate,
            qualityScore,
            extractionTime
        });

        // Keep only last 24 hours of data
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        this.performanceData.set(key, dataPoints.filter(dp => dp.timestamp >= dayAgo));
    }

    /**
     * Get comprehensive ML analytics
     */
    async getMLAnalytics(): Promise<MLAnalytics> {
        const ruleGeneration = this.getRuleGenerationMetrics();
        const optimization = this.getOptimizationMetrics();
        const abTesting = await this.getABTestingMetrics();
        const automation = await this.getAutomationMetrics();
        const performance = this.getPerformanceMetrics();
        const summary = this.generateSummaryMetrics();

        return {
            ruleGeneration,
            optimization,
            abTesting,
            automation,
            performance,
            summary
        };
    }

    /**
     * Get rule generation metrics
     */
    private getRuleGenerationMetrics(): RuleGenerationMetrics {
        const events = this.ruleGenerationEvents;
        const totalGenerated = events.length;
        const inProduction = events.filter(e => e.status === 'deployed').length;
        const inTesting = events.filter(e => e.status === 'tested').length;
        const successful = events.filter(e => e.status !== 'failed').length;

        const averageTime = events.length > 0
            ? events.reduce((sum, e) => sum + e.generationTime, 0) / events.length
            : 0;

        const uniqueDomains = new Set(events.map(e => e.domain)).size;

        // Quality distribution based on confidence
        const qualityDistribution = {
            excellent: events.filter(e => e.confidence >= 0.8).length / Math.max(events.length, 1),
            good: events.filter(e => e.confidence >= 0.6 && e.confidence < 0.8).length / Math.max(events.length, 1),
            fair: events.filter(e => e.confidence >= 0.4 && e.confidence < 0.6).length / Math.max(events.length, 1),
            poor: events.filter(e => e.confidence < 0.4).length / Math.max(events.length, 1)
        };

        return {
            totalRulesGenerated: totalGenerated,
            rulesInProduction: inProduction,
            rulesInTesting: inTesting,
            generationSuccessRate: successful / Math.max(totalGenerated, 1),
            averageGenerationTime: averageTime,
            domainsCovered: uniqueDomains,
            generationHistory: events.slice(-50), // Last 50 events
            qualityDistribution
        };
    }

    /**
     * Get optimization metrics
     */
    private getOptimizationMetrics(): OptimizationMetrics {
        const events = this.optimizationEvents;
        const totalOptimizations = events.length;
        const successful = events.filter(e => e.status === 'success').length;
        const rollbacks = events.filter(e => e.status === 'rollback').length;

        // Calculate average performance improvement
        const successfulEvents = events.filter(e => e.status === 'success');
        const avgImprovement = successfulEvents.length > 0
            ? successfulEvents.reduce((sum, e) =>
            sum + (e.afterMetrics.successRate - e.beforeMetrics.successRate), 0
        ) / successfulEvents.length
            : 0;

        return {
            optimizationCandidatesIdentified: totalOptimizations, // Simplified
            optimizationsImplemented: successful,
            optimizationSuccessRate: successful / Math.max(totalOptimizations, 1),
            averagePerformanceImprovement: avgImprovement,
            rulesNeedingAttention: this.getRulesNeedingAttention(),
            optimizationHistory: events.slice(-50),
            impactBreakdown: {
                successRateImprovements: successful,
                qualityImprovements: successfulEvents.filter(e =>
                    e.afterMetrics.qualityScore > e.beforeMetrics.qualityScore
                ).length,
                performanceImprovements: successfulEvents.filter(e =>
                    e.afterMetrics.averageTime < e.beforeMetrics.averageTime
                ).length,
                rollbacks
            }
        };
    }

    /**
     * Get A/B testing metrics
     */
    private async getABTestingMetrics(): Promise<ABTestingMetrics> {
        if (!this.abTestFramework) {
            return this.getEmptyABTestingMetrics();
        }

        const activeTests = this.abTestFramework.getActiveTests();
        const testHistory = this.generateTestHistory(activeTests);

        const completedTests = testHistory.filter(t => t.result !== 'inconclusive');
        const successfulTests = testHistory.filter(t => t.result === 'promote');

        return {
            activeTests: activeTests.length,
            completedTests: completedTests.length,
            testSuccessRate: successfulTests.length / Math.max(completedTests.length, 1),
            averageTestDuration: this.calculateAverageTestDuration(activeTests),
            significantResults: successfulTests.length,
            testHistory: testHistory.slice(-20), // Last 20 tests
            currentTestStatistics: {
                totalTraffic: this.calculateTotalTestTraffic(activeTests),
                treatmentTraffic: this.calculateTreatmentTraffic(activeTests),
                averageConfidenceLevel: this.calculateAverageConfidence(activeTests)
            }
        };
    }

    /**
     * Get automation metrics
     */
    private async getAutomationMetrics(): Promise<AutomationMetrics> {
        if (!this.ruleUpdater) {
            return this.getEmptyAutomationMetrics();
        }

        const pendingUpdates = this.ruleUpdater.getPendingUpdates();
        const detectedChanges = this.ruleUpdater.getDetectedChanges();

        const automaticUpdates = this.optimizationEvents.filter(e =>
            e.optimizationType === 'automatic'
        ).length;

        const emergencyRollbacks = this.optimizationEvents.filter(e =>
            e.optimizationType === 'emergency' && e.status === 'rollback'
        ).length;

        const systemUptime = (Date.now() - this.systemStartTime.getTime()) / (1000 * 60 * 60); // Hours
        const reliability = this.calculateAutomationReliability();
        const systemHealth = this.assessSystemHealth();

        return {
            automaticUpdatesDeployed: automaticUpdates,
            changeDetectionAlerts: detectedChanges.reduce((sum, dc) => sum + dc.changes.length, 0),
            emergencyRollbacks,
            preventiveMaintenanceActions: pendingUpdates.length,
            systemUptime,
            automationReliability: reliability,
            recentChanges: detectedChanges.flatMap(dc => dc.changes).slice(-10),
            systemHealth
        };
    }

    /**
     * Get performance metrics
     */
    private getPerformanceMetrics(): PerformanceMetrics {
        const mlData = this.getAggregatedPerformanceData(true);
        const traditionalData = this.getAggregatedPerformanceData(false);

        const totalExtractions = Array.from(this.performanceData.values())
            .reduce((sum, points) => sum + points.length, 0);

        const mlExtractions = Array.from(this.performanceData.keys())
            .filter(key => key.includes('-ml'))
            .reduce((sum, key) => sum + (this.performanceData.get(key)?.length || 0), 0);

        return {
            mlEnhancementRate: mlExtractions / Math.max(totalExtractions, 1),
            mlVsTraditionalComparison: {
                mlAverageSuccessRate: mlData.successRate,
                traditionalAverageSuccessRate: traditionalData.successRate,
                mlAverageQuality: mlData.qualityScore,
                traditionalAverageQuality: traditionalData.qualityScore,
                mlAverageTime: mlData.extractionTime,
                traditionalAverageTime: traditionalData.extractionTime
            },
            resourceUsage: {
                cpuUsage: Math.random() * 50 + 20, // Simulated
                memoryUsage: Math.random() * 30 + 40, // Simulated
                analysisTime: mlData.extractionTime
            },
            scalabilityMetrics: {
                maxConcurrentAnalysis: 10, // Configurable limit
                throughput: totalExtractions / Math.max(1, Date.now() - this.systemStartTime.getTime()) * 1000 * 60 * 60, // Per hour
                queueDepth: 0 // Current queue depth
            }
        };
    }

    /**
     * Generate summary metrics and recommendations
     */
    private generateSummaryMetrics(): MLSummaryMetrics {
        const ruleGeneration = this.getRuleGenerationMetrics();
        const optimization = this.getOptimizationMetrics();

        const overallHealth = this.assessOverallSystemHealth();
        const recommendations = this.generateRecommendations();

        return {
            overallSystemHealth: overallHealth,
            keyMetrics: {
                rulesGenerated: ruleGeneration.totalRulesGenerated,
                domainsOptimized: ruleGeneration.domainsCovered,
                performanceGain: optimization.averagePerformanceImprovement * 100,
                automationLevel: optimization.optimizationSuccessRate * 100
            },
            recommendations,
            trends: {
                ruleGenerationTrend: this.calculateRuleGenerationTrend(),
                optimizationEffectiveness: this.calculateOptimizationTrend(),
                systemPerformance: this.calculatePerformanceTrend()
            }
        };
    }

    /**
     * Generate actionable recommendations
     */
    private generateRecommendations(): MLRecommendation[] {
        const recommendations: MLRecommendation[] = [];

        const ruleGeneration = this.getRuleGenerationMetrics();
        const optimization = this.getOptimizationMetrics();

        // Rule generation recommendations
        if (ruleGeneration.generationSuccessRate < 0.7) {
            recommendations.push({
                type: 'rule_generation',
                priority: 'high',
                title: 'Improve Rule Generation Success Rate',
                description: `Current success rate is ${(ruleGeneration.generationSuccessRate * 100).toFixed(1)}%`,
                actionRequired: 'Review ML model parameters and training data quality',
                estimatedImpact: '+15-25% improvement in rule quality',
                implementationEffort: 'medium'
            });
        }

        // Optimization recommendations
        if (optimization.rulesNeedingAttention > 5) {
            recommendations.push({
                type: 'optimization',
                priority: 'medium',
                title: 'Address Rules Needing Attention',
                description: `${optimization.rulesNeedingAttention} rules show performance degradation`,
                actionRequired: 'Schedule optimization review for underperforming rules',
                estimatedImpact: '+10-20% overall extraction success rate',
                implementationEffort: 'low'
            });
        }

        // A/B testing recommendations
        const activeTestCount = this.abTestFramework?.getActiveTests().length || 0;
        if (activeTestCount === 0 && ruleGeneration.totalRulesGenerated > 0) {
            recommendations.push({
                type: 'testing',
                priority: 'medium',
                title: 'Start A/B Testing for Generated Rules',
                description: 'New rules are available but not being tested',
                actionRequired: 'Initialize A/B tests for recently generated rules',
                estimatedImpact: 'Validated rule improvements with statistical confidence',
                implementationEffort: 'low'
            });
        }

        return recommendations.sort((a, b) => {
            const priorityOrder = {critical: 4, high: 3, medium: 2, low: 1};
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    /**
     * Helper methods
     */
    private trimHistory<T>(array: T[], maxLength: number): void {
        if (array.length > maxLength) {
            array.splice(0, array.length - maxLength);
        }
    }

    private getRulesNeedingAttention(): number {
        // Based on recent optimization events
        const recentFailures = this.optimizationEvents
            .filter(e => e.timestamp > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
            .filter(e => e.status === 'failed').length;

        return recentFailures;
    }

    private getAggregatedPerformanceData(mlEnhanced: boolean): {
        successRate: number;
        qualityScore: number;
        extractionTime: number
    } {
        const relevantKeys = Array.from(this.performanceData.keys())
            .filter(key => mlEnhanced ? key.includes('-ml') : !key.includes('-ml'));

        const allPoints = relevantKeys.flatMap(key => this.performanceData.get(key) || []);

        if (allPoints.length === 0) {
            return {successRate: 0, qualityScore: 0, extractionTime: 0};
        }

        return {
            successRate: allPoints.reduce((sum, p) => sum + p.successRate, 0) / allPoints.length,
            qualityScore: allPoints.reduce((sum, p) => sum + p.qualityScore, 0) / allPoints.length,
            extractionTime: allPoints.reduce((sum, p) => sum + p.extractionTime, 0) / allPoints.length
        };
    }

    private calculateRuleGenerationTrend(): 'increasing' | 'stable' | 'decreasing' {
        const recent = this.ruleGenerationEvents.slice(-20);
        const older = this.ruleGenerationEvents.slice(-40, -20);

        if (recent.length > older.length * 1.1) return 'increasing';
        if (recent.length < older.length * 0.9) return 'decreasing';
        return 'stable';
    }

    private calculateOptimizationTrend(): 'improving' | 'stable' | 'declining' {
        const recentOptimizations = this.optimizationEvents.slice(-10);
        const successRate = recentOptimizations.filter(e => e.status === 'success').length / Math.max(recentOptimizations.length, 1);

        if (successRate > 0.8) return 'improving';
        if (successRate < 0.5) return 'declining';
        return 'stable';
    }

    private calculatePerformanceTrend(): 'improving' | 'stable' | 'declining' {
        // Simplified trend calculation
        const recentPerformance = this.getAggregatedPerformanceData(true);

        if (recentPerformance.successRate > 0.8 && recentPerformance.qualityScore > 0.7) return 'improving';
        if (recentPerformance.successRate < 0.6 || recentPerformance.qualityScore < 0.5) return 'declining';
        return 'stable';
    }

    private assessOverallSystemHealth(): 'excellent' | 'good' | 'warning' | 'critical' {
        const ruleGeneration = this.getRuleGenerationMetrics();
        const optimization = this.getOptimizationMetrics();

        const healthScore = (
            ruleGeneration.generationSuccessRate * 0.3 +
            optimization.optimizationSuccessRate * 0.3 +
            (1 - (optimization.rulesNeedingAttention / 20)) * 0.4
        );

        if (healthScore > 0.8) return 'excellent';
        if (healthScore > 0.6) return 'good';
        if (healthScore > 0.4) return 'warning';
        return 'critical';
    }

    private assessSystemHealth(): 'excellent' | 'good' | 'warning' | 'critical' {
        return this.assessOverallSystemHealth();
    }

    private calculateAutomationReliability(): number {
        const totalAutomations = this.optimizationEvents.filter(e => e.optimizationType === 'automatic').length;
        const successfulAutomations = this.optimizationEvents.filter(e =>
            e.optimizationType === 'automatic' && e.status === 'success'
        ).length;

        return successfulAutomations / Math.max(totalAutomations, 1);
    }

    // Placeholder methods for A/B testing integration
    private getEmptyABTestingMetrics(): ABTestingMetrics {
        return {
            activeTests: 0,
            completedTests: 0,
            testSuccessRate: 0,
            averageTestDuration: 0,
            significantResults: 0,
            testHistory: [],
            currentTestStatistics: {
                totalTraffic: 0,
                treatmentTraffic: 0,
                averageConfidenceLevel: 0
            }
        };
    }

    private getEmptyAutomationMetrics(): AutomationMetrics {
        return {
            automaticUpdatesDeployed: 0,
            changeDetectionAlerts: 0,
            emergencyRollbacks: 0,
            preventiveMaintenanceActions: 0,
            systemUptime: 0,
            automationReliability: 0,
            recentChanges: [],
            systemHealth: 'warning'
        };
    }

    private generateTestHistory(activeTests: ABTest[]): ABTestSummary[] {
        return activeTests.map(test => ({
            testId: test.id,
            domain: test.domain,
            duration: (Date.now() - test.startDate.getTime()) / (1000 * 60 * 60), // Hours
            result: test.results.recommendation === 'continue' ? 'inconclusive' : test.results.recommendation,
            improvement: test.results.treatment.successRate - test.results.control.successRate,
            confidence: test.results.statistical.confidenceLevel,
            sampleSize: test.results.control.sampleSize + test.results.treatment.sampleSize
        }));
    }

    private calculateAverageTestDuration(tests: ABTest[]): number {
        if (tests.length === 0) return 0;
        return tests.reduce((sum, test) =>
            sum + (Date.now() - test.startDate.getTime()), 0
        ) / tests.length / (1000 * 60 * 60); // Hours
    }

    private calculateTotalTestTraffic(tests: ABTest[]): number {
        return tests.reduce((sum, test) =>
            sum + test.results.control.sampleSize + test.results.treatment.sampleSize, 0
        );
    }

    private calculateTreatmentTraffic(tests: ABTest[]): number {
        return tests.reduce((sum, test) => sum + test.results.treatment.sampleSize, 0);
    }

    private calculateAverageConfidence(tests: ABTest[]): number {
        if (tests.length === 0) return 0;
        return tests.reduce((sum, test) => sum + test.results.statistical.confidenceLevel, 0) / tests.length;
    }
}

interface PerformanceDataPoint {
    timestamp: Date;
    successRate: number;
    qualityScore: number;
    extractionTime: number;
}