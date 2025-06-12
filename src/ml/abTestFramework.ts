/**
 * Phase 4B.1 - A/B Testing Framework for Rule Improvements
 * Safely tests optimized rules against current rules with statistical significance
 */

import {v4 as uuidv4} from 'uuid';
import type {SiteRule} from '../content/rules/types.js';
import type {ExtractionResult} from '../content/types.js';
import type {EnhancedContentQuality} from '../content/quality/enhancedQualityAnalyzer.js';

export interface ABTest {
    id: string;
    name: string;
    domain: string;
    status: 'running' | 'completed' | 'paused' | 'failed' | 'cancelled';

    // Test configuration
    controlRule: SiteRule;
    treatmentRule: SiteRule;
    trafficSplit: number; // 0-1, percentage to treatment
    startDate: Date;
    plannedEndDate: Date;
    actualEndDate?: Date;

    // Success criteria
    successCriteria: {
        minimumSuccessRate: number;
        minimumQualityScore: number;
        maximumTimeIncrease: number;
        minimumSampleSize: number;
        significanceLevel: number; // p-value threshold (e.g., 0.05)
    };

    // Current results
    results: ABTestResults;

    // Configuration
    config: {
        maxDuration: number; // Maximum test duration in hours
        earlyStoppingEnabled: boolean;
        rollbackThreshold: number; // Performance drop that triggers rollback
    };
}

export interface ABTestResults {
    control: TestVariantResults;
    treatment: TestVariantResults;

    // Statistical analysis
    statistical: {
        successRateSignificance: StatisticalTest;
        qualityScoreSignificance: StatisticalTest;
        extractionTimeSignificance: StatisticalTest;
        overallSignificance: boolean;
        confidenceLevel: number;
    };

    // Recommendations
    recommendation: 'promote' | 'rollback' | 'continue' | 'inconclusive';
    recommendationReason: string;

    // Metadata
    lastUpdated: Date;
    totalExtractions: number;
    testDuration: number; // in hours
}

export interface TestVariantResults {
    ruleId: string;
    ruleName: string;

    // Sample metrics
    sampleSize: number;
    extractions: ExtractionMetric[];

    // Aggregate metrics
    successRate: number;
    averageQualityScore: number;
    averageExtractionTime: number;
    errorRate: number;

    // Field-specific metrics
    fieldSuccessRates: {
        title: number;
        content: number;
        author: number;
        date: number;
        summary: number;
    };

    // Performance distribution
    qualityDistribution: {
        excellent: number; // >0.8
        good: number;      // 0.6-0.8
        fair: number;      // 0.4-0.6
        poor: number;      // <0.4
    };

    // Time series data for trend analysis
    timeSeriesData: TimeSeriesPoint[];
}

export interface ExtractionMetric {
    timestamp: Date;
    url: string;
    success: boolean;
    qualityScore: number;
    extractionTime: number;
    fieldsExtracted: string[];
    errorDetails?: string;
}

export interface StatisticalTest {
    metric: string;
    controlMean: number;
    treatmentMean: number;
    difference: number;
    percentageChange: number;
    pValue: number;
    isSignificant: boolean;
    confidenceInterval: [number, number];
    effectSize: number;
}

export interface TimeSeriesPoint {
    timestamp: Date;
    successRate: number;
    qualityScore: number;
    extractionTime: number;
    sampleCount: number;
}

export class ABTestFramework {
    private activeTests: Map<string, ABTest> = new Map();
    private testHistory: ABTest[] = [];
    private assignmentSeed: number = Date.now();

    /**
     * Start a new A/B test for rule optimization
     */
    async startTest(
        name: string,
        domain: string,
        controlRule: SiteRule,
        treatmentRule: SiteRule,
        config: Partial<ABTest['config']> = {},
        successCriteria: Partial<ABTest['successCriteria']> = {}
    ): Promise<string> {
        const testId = uuidv4();

        const test: ABTest = {
            id: testId,
            name,
            domain,
            status: 'running',
            controlRule,
            treatmentRule,
            trafficSplit: 0.2, // Default 20% to treatment
            startDate: new Date(),
            plannedEndDate: new Date(Date.now() + (config.maxDuration || 72) * 60 * 60 * 1000),

            successCriteria: {
                minimumSuccessRate: 0.7,
                minimumQualityScore: 0.6,
                maximumTimeIncrease: 0.2, // 20% increase
                minimumSampleSize: 50,
                significanceLevel: 0.05,
                ...successCriteria
            },

            results: this.initializeResults(controlRule, treatmentRule),

            config: {
                maxDuration: 72, // 72 hours default
                earlyStoppingEnabled: true,
                rollbackThreshold: 0.15, // 15% performance drop
                ...config
            }
        };

        this.activeTests.set(testId, test);

        console.log(`🧪 Started A/B test: ${name} (${testId})`);
        console.log(`📊 Control: ${controlRule.name}, Treatment: ${treatmentRule.name}`);
        console.log(`🎯 Traffic split: ${(test.trafficSplit * 100)}% to treatment`);

        return testId;
    }

    /**
     * Determine which rule variant to use for a given URL
     */
    assignVariant(testId: string, url: string): 'control' | 'treatment' | null {
        const test = this.activeTests.get(testId);
        if (!test || test.status !== 'running') {
            return null;
        }

        // Use consistent hash-based assignment
        const hash = this.hashUrl(url, test.id);
        const assignment = hash < test.trafficSplit ? 'treatment' : 'control';

        return assignment;
    }

    /**
     * Record extraction result for A/B test analysis
     */
    recordExtractionResult(
        testId: string,
        variant: 'control' | 'treatment',
        url: string,
        extractionResult: ExtractionResult,
        qualityMetrics: EnhancedContentQuality,
        extractionTime: number
    ): void {
        const test = this.activeTests.get(testId);
        if (!test || test.status !== 'running') {
            return;
        }

        const metric: ExtractionMetric = {
            timestamp: new Date(),
            url,
            success: extractionResult.success,
            qualityScore: qualityMetrics.score,
            extractionTime,
            fieldsExtracted: Object.keys(extractionResult.data).filter(key =>
                extractionResult.data[key as keyof typeof extractionResult.data]
            ),
            errorDetails: extractionResult.success ? undefined : 'Extraction failed'
        };

        // Add to appropriate variant
        const variantResults = test.results[variant];
        variantResults.extractions.push(metric);
        variantResults.sampleSize++;

        // Update aggregate metrics
        this.updateAggregateMetrics(variantResults);

        // Update time series data
        this.updateTimeSeriesData(variantResults);

        // Perform statistical analysis
        this.updateStatisticalAnalysis(test);

        // Check for early stopping conditions
        if (test.config.earlyStoppingEnabled) {
            this.checkEarlyStoppingConditions(test);
        }

        console.log(`📈 Recorded ${variant} result for test ${testId}: success=${extractionResult.success}, quality=${qualityMetrics.score.toFixed(2)}`);
    }

    /**
     * Get current test results
     */
    getTestResults(testId: string): ABTestResults | null {
        const test = this.activeTests.get(testId);
        return test ? test.results : null;
    }

    /**
     * Get all active tests
     */
    getActiveTests(): ABTest[] {
        return Array.from(this.activeTests.values());
    }

    /**
     * Stop a test manually
     */
    async stopTest(testId: string, reason: string = 'Manual stop'): Promise<void> {
        const test = this.activeTests.get(testId);
        if (!test) {
            throw new Error(`Test ${testId} not found`);
        }

        test.status = 'completed';
        test.actualEndDate = new Date();

        // Final statistical analysis
        this.updateStatisticalAnalysis(test);
        this.generateFinalRecommendation(test, reason);

        // Move to history
        this.testHistory.push(test);
        this.activeTests.delete(testId);

        console.log(`🏁 Stopped A/B test ${testId}: ${reason}`);
        console.log(`📊 Final recommendation: ${test.results.recommendation}`);
    }

    /**
     * Initialize empty results structure
     */
    private initializeResults(controlRule: SiteRule, treatmentRule: SiteRule): ABTestResults {
        const createVariantResults = (rule: SiteRule): TestVariantResults => ({
            ruleId: rule.id,
            ruleName: rule.name,
            sampleSize: 0,
            extractions: [],
            successRate: 0,
            averageQualityScore: 0,
            averageExtractionTime: 0,
            errorRate: 0,
            fieldSuccessRates: {
                title: 0,
                content: 0,
                author: 0,
                date: 0,
                summary: 0
            },
            qualityDistribution: {
                excellent: 0,
                good: 0,
                fair: 0,
                poor: 0
            },
            timeSeriesData: []
        });

        return {
            control: createVariantResults(controlRule),
            treatment: createVariantResults(treatmentRule),
            statistical: {
                successRateSignificance: this.createEmptyStatTest('Success Rate'),
                qualityScoreSignificance: this.createEmptyStatTest('Quality Score'),
                extractionTimeSignificance: this.createEmptyStatTest('Extraction Time'),
                overallSignificance: false,
                confidenceLevel: 0
            },
            recommendation: 'continue',
            recommendationReason: 'Test in progress',
            lastUpdated: new Date(),
            totalExtractions: 0,
            testDuration: 0
        };
    }

    /**
     * Update aggregate metrics for a variant
     */
    private updateAggregateMetrics(variant: TestVariantResults): void {
        if (variant.extractions.length === 0) return;

        const recent = variant.extractions.slice(-100); // Use recent 100 extractions

        // Success rate
        variant.successRate = recent.filter(e => e.success).length / recent.length;

        // Average quality score
        variant.averageQualityScore = recent.reduce((sum, e) => sum + e.qualityScore, 0) / recent.length;

        // Average extraction time
        variant.averageExtractionTime = recent.reduce((sum, e) => sum + e.extractionTime, 0) / recent.length;

        // Error rate
        variant.errorRate = recent.filter(e => !e.success).length / recent.length;

        // Field success rates
        for (const field of ['title', 'content', 'author', 'date', 'summary'] as const) {
            const fieldExtractions = recent.filter(e => e.fieldsExtracted.includes(field));
            variant.fieldSuccessRates[field] = fieldExtractions.length / recent.length;
        }

        // Quality distribution
        const qualityBuckets = {excellent: 0, good: 0, fair: 0, poor: 0};
        for (const extraction of recent) {
            if (extraction.qualityScore >= 0.8) qualityBuckets.excellent++;
            else if (extraction.qualityScore >= 0.6) qualityBuckets.good++;
            else if (extraction.qualityScore >= 0.4) qualityBuckets.fair++;
            else qualityBuckets.poor++;
        }

        variant.qualityDistribution = {
            excellent: qualityBuckets.excellent / recent.length,
            good: qualityBuckets.good / recent.length,
            fair: qualityBuckets.fair / recent.length,
            poor: qualityBuckets.poor / recent.length
        };
    }

    /**
     * Update time series data for trend analysis
     */
    private updateTimeSeriesData(variant: TestVariantResults): void {
        const now = new Date();
        const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        // Get extractions from last hour
        const recentExtractions = variant.extractions.filter(e => e.timestamp >= hourAgo);

        if (recentExtractions.length > 0) {
            const point: TimeSeriesPoint = {
                timestamp: now,
                successRate: recentExtractions.filter(e => e.success).length / recentExtractions.length,
                qualityScore: recentExtractions.reduce((sum, e) => sum + e.qualityScore, 0) / recentExtractions.length,
                extractionTime: recentExtractions.reduce((sum, e) => sum + e.extractionTime, 0) / recentExtractions.length,
                sampleCount: recentExtractions.length
            };

            variant.timeSeriesData.push(point);

            // Keep only last 24 hours of data
            const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            variant.timeSeriesData = variant.timeSeriesData.filter(p => p.timestamp >= dayAgo);
        }
    }

    /**
     * Update statistical analysis between variants
     */
    private updateStatisticalAnalysis(test: ABTest): void {
        const {control, treatment} = test.results;

        if (control.sampleSize < 10 || treatment.sampleSize < 10) {
            // Need more data for meaningful statistics
            return;
        }

        // Test success rate significance
        test.results.statistical.successRateSignificance = this.performTTest(
            'Success Rate',
            control.extractions.map(e => e.success ? 1 : 0),
            treatment.extractions.map(e => e.success ? 1 : 0)
        );

        // Test quality score significance
        test.results.statistical.qualityScoreSignificance = this.performTTest(
            'Quality Score',
            control.extractions.map(e => e.qualityScore),
            treatment.extractions.map(e => e.qualityScore)
        );

        // Test extraction time significance
        test.results.statistical.extractionTimeSignificance = this.performTTest(
            'Extraction Time',
            control.extractions.map(e => e.extractionTime),
            treatment.extractions.map(e => e.extractionTime)
        );

        // Overall significance
        const significantTests = [
            test.results.statistical.successRateSignificance,
            test.results.statistical.qualityScoreSignificance
        ].filter(t => t.isSignificant && t.difference > 0); // Positive improvements only

        test.results.statistical.overallSignificance = significantTests.length >= 1;
        test.results.statistical.confidenceLevel = significantTests.length > 0 ?
            Math.min(...significantTests.map(t => 1 - t.pValue)) : 0;

        test.results.lastUpdated = new Date();
        test.results.totalExtractions = control.sampleSize + treatment.sampleSize;
        test.results.testDuration = (Date.now() - test.startDate.getTime()) / (1000 * 60 * 60);
    }

    /**
     * Check early stopping conditions
     */
    private checkEarlyStoppingConditions(test: ABTest): void {
        const {control, treatment} = test.results;
        const minSample = test.successCriteria.minimumSampleSize;

        // Need minimum sample size
        if (control.sampleSize < minSample || treatment.sampleSize < minSample) {
            return;
        }

        // Check for significant negative impact (rollback condition)
        const successRateDrop = control.successRate - treatment.successRate;
        const qualityDrop = control.averageQualityScore - treatment.averageQualityScore;

        if (successRateDrop > test.config.rollbackThreshold ||
            qualityDrop > test.config.rollbackThreshold) {
            console.warn(`🚨 Performance drop detected in test ${test.id}, considering rollback`);
            test.results.recommendation = 'rollback';
            test.results.recommendationReason = 'Significant performance degradation detected';
            return;
        }

        // Check for positive significance (early promotion)
        if (test.results.statistical.overallSignificance) {
            const successImprovement = treatment.successRate - control.successRate;
            const qualityImprovement = treatment.averageQualityScore - control.averageQualityScore;

            if (successImprovement >= 0.05 && qualityImprovement >= 0.05) { // 5% improvements
                console.log(`✅ Significant improvement detected in test ${test.id}, considering early promotion`);
                test.results.recommendation = 'promote';
                test.results.recommendationReason = 'Statistically significant improvement with sufficient effect size';
            }
        }
    }

    /**
     * Generate final recommendation
     */
    private generateFinalRecommendation(test: ABTest, _stopReason: string): void {
        const {control, treatment, statistical} = test.results;

        // Check if we met minimum criteria
        if (control.sampleSize < test.successCriteria.minimumSampleSize ||
            treatment.sampleSize < test.successCriteria.minimumSampleSize) {
            test.results.recommendation = 'inconclusive';
            test.results.recommendationReason = 'Insufficient sample size for reliable results';
            return;
        }

        // Check for performance degradation
        const successRateDrop = control.successRate - treatment.successRate;
        if (successRateDrop > 0.02) { // 2% drop
            test.results.recommendation = 'rollback';
            test.results.recommendationReason = 'Treatment shows lower success rate than control';
            return;
        }

        // Check for significant improvements
        if (statistical.overallSignificance) {
            const meetsSuccessCriteria =
                treatment.successRate >= test.successCriteria.minimumSuccessRate &&
                treatment.averageQualityScore >= test.successCriteria.minimumQualityScore;

            if (meetsSuccessCriteria) {
                test.results.recommendation = 'promote';
                test.results.recommendationReason = 'Statistically significant improvement meeting all success criteria';
            } else {
                test.results.recommendation = 'continue';
                test.results.recommendationReason = 'Improvement detected but success criteria not fully met';
            }
        } else {
            test.results.recommendation = 'inconclusive';
            test.results.recommendationReason = 'No statistically significant difference detected';
        }
    }

    /**
     * Perform two-sample t-test
     */
    private performTTest(metric: string, controlData: number[], treatmentData: number[]): StatisticalTest {
        if (controlData.length === 0 || treatmentData.length === 0) {
            return this.createEmptyStatTest(metric);
        }

        const controlMean = controlData.reduce((sum, val) => sum + val, 0) / controlData.length;
        const treatmentMean = treatmentData.reduce((sum, val) => sum + val, 0) / treatmentData.length;

        const difference = treatmentMean - controlMean;
        const percentageChange = controlMean !== 0 ? (difference / controlMean) * 100 : 0;

        // Simplified t-test calculation (for production, use proper statistical library)
        const controlVariance = this.calculateVariance(controlData, controlMean);
        const treatmentVariance = this.calculateVariance(treatmentData, treatmentMean);

        const pooledStdError = Math.sqrt(
            (controlVariance / controlData.length) + (treatmentVariance / treatmentData.length)
        );

        const tStatistic = pooledStdError > 0 ? difference / pooledStdError : 0;
        // const degreesOfFreedom = controlData.length + treatmentData.length - 2; // Not used in simplified implementation

        // Simplified p-value estimation (use proper statistical functions in production)
        const pValue = Math.max(0.001, Math.min(0.999, 2 * (1 - this.normalCDF(Math.abs(tStatistic)))));

        const isSignificant = pValue < 0.05 && Math.abs(difference) > 0.01; // 1% minimum effect size

        // Effect size (Cohen's d)
        const pooledStd = Math.sqrt((controlVariance + treatmentVariance) / 2);
        const effectSize = pooledStd > 0 ? difference / pooledStd : 0;

        return {
            metric,
            controlMean,
            treatmentMean,
            difference,
            percentageChange,
            pValue,
            isSignificant,
            confidenceInterval: [difference - 1.96 * pooledStdError, difference + 1.96 * pooledStdError],
            effectSize
        };
    }

    /**
     * Helper functions for statistical calculations
     */
    private createEmptyStatTest(metric: string): StatisticalTest {
        return {
            metric,
            controlMean: 0,
            treatmentMean: 0,
            difference: 0,
            percentageChange: 0,
            pValue: 1,
            isSignificant: false,
            confidenceInterval: [0, 0],
            effectSize: 0
        };
    }

    private calculateVariance(data: number[], mean: number): number {
        if (data.length <= 1) return 0;
        const squaredDiffs = data.map(val => Math.pow(val - mean, 2));
        return squaredDiffs.reduce((sum, val) => sum + val, 0) / (data.length - 1);
    }

    private normalCDF(x: number): number {
        // Approximation of normal cumulative distribution function
        return 0.5 * (1 + Math.sign(x) * Math.sqrt(1 - Math.exp(-2 * x * x / Math.PI)));
    }

    private hashUrl(url: string, testId: string): number {
        // Simple hash function for consistent assignment
        const str = url + testId + this.assignmentSeed;
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash) / 0x7FFFFFFF; // Normalize to 0-1
    }
}