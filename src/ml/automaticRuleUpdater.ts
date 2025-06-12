/**
 * Phase 4B.1 - Automatic Rule Update System
 * Monitors site changes and automatically updates extraction rules
 */

import {type DOMAnalysisResult, DOMPatternAnalyzer} from './domPatternAnalyzer';
import {RuleOptimizationEngine} from './ruleOptimizationEngine';
import {ABTestFramework} from './abTestFramework';
import {RuleEffectivenessTracker} from '../content/analytics/ruleEffectivenessTracker';
import type {SiteRule} from '../content/rules/types';
import type {Page} from 'playwright';

export interface SiteChangeDetection {
    domain: string;
    url: string;
    detectionDate: Date;
    changeType: 'structure_change' | 'selector_failure' | 'performance_degradation' | 'new_content_pattern';
    severity: 'critical' | 'high' | 'medium' | 'low';
    details: {
        description: string;
        affectedFields: string[];
        currentSuccessRate: number;
        previousSuccessRate: number;
        evidence: ChangeEvidence[];
    };
    recommendedAction: 'immediate_update' | 'scheduled_update' | 'monitor' | 'investigate';
}

export interface ChangeEvidence {
    type: 'dom_structure' | 'selector_failure' | 'content_quality' | 'performance_metric';
    description: string;
    confidence: number;
    data: Record<string, unknown>;
}

export interface RuleUpdatePlan {
    ruleId: string;
    updateType: 'emergency_patch' | 'scheduled_optimization' | 'preventive_update';
    changes: RuleChange[];
    testingStrategy: 'immediate_deploy' | 'ab_test' | 'staged_rollout';
    estimatedImpact: {
        successRateImprovement: number;
        qualityImprovement: number;
        riskLevel: 'low' | 'medium' | 'high';
    };
    rollbackPlan: RollbackPlan;
}

export interface RuleChange {
    field: string;
    changeType: 'selector_update' | 'selector_addition' | 'selector_removal' | 'priority_change';
    oldValue: string | string[];
    newValue: string | string[];
    reasoning: string;
    confidence: number;
}

export interface RuleMetrics {
    successRate: number;
    averageQualityScore: number;
    fieldSuccessRates?: Record<string, number>;
    domain?: string;
}

export interface RollbackPlan {
    conditions: string[];
    timeoutMinutes: number;
    fallbackRule: SiteRule;
    alerting: {
        enabled: boolean;
        thresholds: {
            successRateDropThreshold: number;
            qualityDropThreshold: number;
        };
    };
}

export interface MonitoringConfig {
    checkIntervalMinutes: number;
    performanceSampleSize: number;
    changeDetectionThreshold: number;
    enableProactiveAnalysis: boolean;
    testSiteInterval: number; // hours
}

export class AutomaticRuleUpdater {
    private domAnalyzer: DOMPatternAnalyzer;
    private optimizationEngine: RuleOptimizationEngine;
    private abTestFramework: ABTestFramework;
    private ruleTracker: RuleEffectivenessTracker;
    private config: MonitoringConfig;

    private monitoringActive = false;
    private detectedChanges: Map<string, SiteChangeDetection[]> = new Map();
    private scheduledUpdates: Map<string, RuleUpdatePlan> = new Map();

    constructor(
        ruleTracker: RuleEffectivenessTracker,
        config: Partial<MonitoringConfig> = {}
    ) {
        this.ruleTracker = ruleTracker;
        this.domAnalyzer = new DOMPatternAnalyzer();
        this.optimizationEngine = new RuleOptimizationEngine(ruleTracker);
        this.abTestFramework = new ABTestFramework();

        this.config = {
            checkIntervalMinutes: 60, // Check every hour
            performanceSampleSize: 50,
            changeDetectionThreshold: 0.15, // 15% performance drop
            enableProactiveAnalysis: true,
            testSiteInterval: 24, // Test sites every 24 hours
            ...config
        };
    }

    /**
     * Start continuous monitoring for site changes
     */
    async startMonitoring(): Promise<void> {
        if (this.monitoringActive) {
            console.log('⚠️ Monitoring already active');
            return;
        }

        this.monitoringActive = true;
        console.log('🚀 Starting automatic rule update monitoring');
        console.log(`📊 Check interval: ${this.config.checkIntervalMinutes} minutes`);

        // Initial assessment
        await this.performInitialAssessment();

        // Schedule periodic checks
        this.schedulePeriodicChecks();

        console.log('✅ Automatic rule updater is now active');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring(): void {
        this.monitoringActive = false;
        console.log('🛑 Stopped automatic rule update monitoring');
    }

    /**
     * Manually trigger change detection for a specific domain
     */
    async detectChangesForDomain(domain: string, testUrls: string[], page: Page): Promise<SiteChangeDetection[]> {
        console.log(`🔍 Detecting changes for domain: ${domain}`);

        const changes: SiteChangeDetection[] = [];

        // Get current rule performance
        const ruleMetrics = this.getRuleMetricsForDomain(domain);
        if (!ruleMetrics) {
            console.log(`ℹ️ No rule metrics found for ${domain}`);
            return changes;
        }

        // Analyze current DOM structure
        const currentAnalysis = await this.analyzeCurrentStructure(domain, testUrls, page);

        // Compare with historical performance
        const performanceChanges = this.detectPerformanceChanges(domain, ruleMetrics);
        changes.push(...performanceChanges);

        // Detect structural changes
        const structuralChanges = await this.detectStructuralChanges(domain, currentAnalysis);
        changes.push(...structuralChanges);

        // Store detected changes
        if (changes.length > 0) {
            this.detectedChanges.set(domain, changes);
            console.log(`🚨 Detected ${changes.length} changes for ${domain}`);

            // Generate update plans for critical changes
            await this.generateUpdatePlansForChanges(domain, changes);
        }

        return changes;
    }

    /**
     * Execute automatic rule update
     */
    async executeRuleUpdate(domain: string, updatePlan: RuleUpdatePlan): Promise<boolean> {
        console.log(`🔧 Executing rule update for ${domain}: ${updatePlan.updateType}`);

        try {
            switch (updatePlan.testingStrategy) {
                case 'immediate_deploy':
                    return await this.executeImmediateUpdate(updatePlan);

                case 'ab_test':
                    return await this.executeABTestUpdate(updatePlan);

                case 'staged_rollout':
                    return await this.executeStagedRollout(updatePlan);

                default:
                    throw new Error(`Unknown testing strategy: ${updatePlan.testingStrategy}`);
            }
        } catch (error) {
            console.error(`❌ Failed to execute rule update for ${domain}:`, error);
            return false;
        }
    }

    /**
     * Get pending updates for review
     */
    getPendingUpdates(): Array<{ domain: string; plan: RuleUpdatePlan }> {
        return Array.from(this.scheduledUpdates.entries()).map(([domain, plan]) => ({
            domain,
            plan
        }));
    }

    /**
     * Get detected changes summary
     */
    getDetectedChanges(): Array<{ domain: string; changes: SiteChangeDetection[] }> {
        return Array.from(this.detectedChanges.entries()).map(([domain, changes]) => ({
            domain,
            changes
        }));
    }

    /**
     * Perform initial assessment of all rules
     */
    private async performInitialAssessment(): Promise<void> {
        console.log('📊 Performing initial rule assessment...');

        const candidates = await this.optimizationEngine.identifyOptimizationCandidates();

        console.log(`📈 Found ${candidates.length} rules needing attention`);

        for (const candidate of candidates.slice(0, 5)) { // Limit initial batch
            if (candidate.priority === 'critical' || candidate.priority === 'high') {
                // Schedule immediate assessment
                console.log(`⚠️ High priority candidate: ${candidate.ruleName} (${candidate.domain})`);
                // In production, this would trigger detailed analysis
            }
        }
    }

    /**
     * Schedule periodic monitoring checks
     */
    private schedulePeriodicChecks(): void {
        const checkInterval = this.config.checkIntervalMinutes * 60 * 1000;

        const periodicCheck = async () => {
            if (!this.monitoringActive) return;

            try {
                await this.performPeriodicCheck();
            } catch (error) {
                console.error('Error in periodic check:', error);
            }

            // Schedule next check
            if (this.monitoringActive) {
                setTimeout(periodicCheck, checkInterval);
            }
        };

        setTimeout(periodicCheck, checkInterval);
    }

    /**
     * Perform periodic monitoring check
     */
    private async performPeriodicCheck(): Promise<void> {
        console.log('🔄 Performing periodic rule monitoring check...');

        // Get all active rules
        const exportedMetrics = this.ruleTracker.exportMetrics();
        const domains = [...new Set(exportedMetrics.rules.map(rule => rule.domain))];

        for (const domain of domains.slice(0, 3)) { // Limit concurrent checks
            try {
                const ruleMetrics = this.getRuleMetricsForDomain(domain);
                if (!ruleMetrics) continue;

                // Check for performance degradation
                const performanceIssues = this.detectPerformanceChanges(domain, ruleMetrics);

                if (performanceIssues.length > 0) {
                    console.log(`⚠️ Performance issues detected for ${domain}`);
                    this.detectedChanges.set(domain, performanceIssues);

                    // Generate update plan for critical issues
                    const criticalIssues = performanceIssues.filter(issue =>
                        issue.severity === 'critical' || issue.severity === 'high'
                    );

                    if (criticalIssues.length > 0) {
                        await this.generateUpdatePlansForChanges(domain, criticalIssues);
                    }
                }
            } catch (error) {
                console.error(`Error checking domain ${domain}:`, error);
            }
        }
    }

    /**
     * Analyze current DOM structure for a domain
     */
    private async analyzeCurrentStructure(domain: string, testUrls: string[], page: Page): Promise<DOMAnalysisResult[]> {
        const results: DOMAnalysisResult[] = [];

        for (const url of testUrls.slice(0, 2)) { // Limit for performance
            try {
                await page.goto(url, {waitUntil: 'domcontentloaded', timeout: 10000});
                const analysis = await this.domAnalyzer.analyzePage(page);
                results.push(analysis);
            } catch (error) {
                console.warn(`Failed to analyze ${url}:`, error);
            }
        }

        return results;
    }

    /**
     * Detect performance-based changes
     */
    private detectPerformanceChanges(domain: string, ruleMetrics: RuleMetrics): SiteChangeDetection[] {
        const changes: SiteChangeDetection[] = [];

        // Check success rate degradation
        if (ruleMetrics.successRate < 0.7) {
            const severity = ruleMetrics.successRate < 0.4 ? 'critical' : 'high';

            changes.push({
                domain,
                url: `https://${domain}`,
                detectionDate: new Date(),
                changeType: 'performance_degradation',
                severity,
                details: {
                    description: `Success rate dropped to ${(ruleMetrics.successRate * 100).toFixed(1)}%`,
                    affectedFields: ['all'],
                    currentSuccessRate: ruleMetrics.successRate,
                    previousSuccessRate: 0.8, // Would track historical data
                    evidence: [{
                        type: 'performance_metric',
                        description: 'Success rate below threshold',
                        confidence: 0.9,
                        data: {successRate: ruleMetrics.successRate}
                    }]
                },
                recommendedAction: severity === 'critical' ? 'immediate_update' : 'scheduled_update'
            });
        }

        // Check quality score degradation
        if (ruleMetrics.averageQualityScore < 0.6) {
            changes.push({
                domain,
                url: `https://${domain}`,
                detectionDate: new Date(),
                changeType: 'performance_degradation',
                severity: 'medium',
                details: {
                    description: `Quality score dropped to ${(ruleMetrics.averageQualityScore * 100).toFixed(1)}%`,
                    affectedFields: this.identifyPoorQualityFields(ruleMetrics),
                    currentSuccessRate: ruleMetrics.successRate,
                    previousSuccessRate: 0.8,
                    evidence: [{
                        type: 'content_quality',
                        description: 'Content quality below threshold',
                        confidence: 0.8,
                        data: {qualityScore: ruleMetrics.averageQualityScore}
                    }]
                },
                recommendedAction: 'scheduled_update'
            });
        }

        return changes;
    }

    /**
     * Detect structural changes (placeholder - would compare with historical DOM analysis)
     */
    private async detectStructuralChanges(domain: string, currentAnalysis: DOMAnalysisResult[]): Promise<SiteChangeDetection[]> {
        const changes: SiteChangeDetection[] = [];

        // This would compare with stored historical analysis
        // For now, we'll detect low confidence patterns as potential structure changes
        for (const analysis of currentAnalysis) {
            if (analysis.overallConfidence < 0.6) {
                changes.push({
                    domain,
                    url: analysis.url,
                    detectionDate: new Date(),
                    changeType: 'structure_change',
                    severity: 'medium',
                    details: {
                        description: `DOM analysis confidence low: ${(analysis.overallConfidence * 100).toFixed(1)}%`,
                        affectedFields: analysis.patterns.filter(p => p.confidence < 0.6).map(p => p.field),
                        currentSuccessRate: analysis.overallConfidence,
                        previousSuccessRate: 0.8, // Would be from historical data
                        evidence: [{
                            type: 'dom_structure',
                            description: 'Low confidence in DOM pattern recognition',
                            confidence: 1 - analysis.overallConfidence,
                            data: {analysisResult: analysis}
                        }]
                    },
                    recommendedAction: 'investigate'
                });
            }
        }

        return changes;
    }

    /**
     * Generate update plans for detected changes
     */
    private async generateUpdatePlansForChanges(domain: string, changes: SiteChangeDetection[]): Promise<void> {
        const criticalChanges = changes.filter(c => c.severity === 'critical');
        const highPriorityChanges = changes.filter(c => c.severity === 'high');

        // Create emergency patch for critical issues
        if (criticalChanges.length > 0) {
            const emergencyPlan: RuleUpdatePlan = {
                ruleId: `${domain}-rule`,
                updateType: 'emergency_patch',
                changes: this.generateEmergencyChanges(criticalChanges),
                testingStrategy: 'immediate_deploy',
                estimatedImpact: {
                    successRateImprovement: 0.3,
                    qualityImprovement: 0.2,
                    riskLevel: 'high'
                },
                rollbackPlan: this.generateRollbackPlan(domain)
            };

            this.scheduledUpdates.set(domain, emergencyPlan);
            console.log(`🚨 Emergency update plan created for ${domain}`);
        }

        // Create scheduled optimization for high priority issues
        else if (highPriorityChanges.length > 0) {
            const scheduledPlan: RuleUpdatePlan = {
                ruleId: `${domain}-rule`,
                updateType: 'scheduled_optimization',
                changes: this.generateOptimizationChanges(highPriorityChanges),
                testingStrategy: 'ab_test',
                estimatedImpact: {
                    successRateImprovement: 0.15,
                    qualityImprovement: 0.1,
                    riskLevel: 'medium'
                },
                rollbackPlan: this.generateRollbackPlan(domain)
            };

            this.scheduledUpdates.set(domain, scheduledPlan);
            console.log(`📅 Scheduled update plan created for ${domain}`);
        }
    }

    /**
     * Execute immediate update without testing
     */
    private async executeImmediateUpdate(updatePlan: RuleUpdatePlan): Promise<boolean> {
        console.log(`⚡ Executing immediate update: ${updatePlan.ruleId}`);

        // In production, this would:
        // 1. Load current rule
        // 2. Apply changes
        // 3. Deploy immediately
        // 4. Monitor for rollback conditions

        // Simulate successful deployment
        console.log(`✅ Immediate update deployed for ${updatePlan.ruleId}`);
        return true;
    }

    /**
     * Execute A/B test update
     */
    private async executeABTestUpdate(updatePlan: RuleUpdatePlan): Promise<boolean> {
        console.log(`🧪 Starting A/B test for: ${updatePlan.ruleId}`);

        // This would integrate with the actual rule system
        const controlRule = await this.loadRule(updatePlan.ruleId);

        if (!controlRule) {
            console.error(`Failed to load rule: ${updatePlan.ruleId}`);
            return false;
        }

        const treatmentRule = this.applyChangesToRule(controlRule, updatePlan.changes);

        // Start A/B test
        const testId = await this.abTestFramework.startTest(
            `Auto-update: ${updatePlan.ruleId}`,
            this.extractDomainFromRuleId(updatePlan.ruleId),
            controlRule,
            treatmentRule
        );

        console.log(`🧪 A/B test started: ${testId}`);
        return true;
    }

    /**
     * Execute staged rollout
     */
    private async executeStagedRollout(updatePlan: RuleUpdatePlan): Promise<boolean> {
        console.log(`📊 Starting staged rollout for: ${updatePlan.ruleId}`);

        // This would implement a gradual rollout strategy
        // Stage 1: 5% traffic
        // Stage 2: 25% traffic  
        // Stage 3: 100% traffic

        console.log(`✅ Staged rollout initiated for ${updatePlan.ruleId}`);
        return true;
    }

    /**
     * Helper methods
     */
    private getRuleMetricsForDomain(domain: string): RuleMetrics | undefined {
        const exportedMetrics = this.ruleTracker.exportMetrics();
        const foundRule = exportedMetrics.rules.find(rule => rule.domain === domain);
        // Type guard to ensure we return proper RuleMetrics
        if (foundRule && typeof foundRule === 'object' && 'successRate' in foundRule) {
            return foundRule as RuleMetrics;
        }
        return undefined;
    }

    private identifyPoorQualityFields(ruleMetrics: RuleMetrics): string[] {
        const poorFields: string[] = [];
        if (ruleMetrics.fieldSuccessRates) {
            for (const [field, rate] of Object.entries(ruleMetrics.fieldSuccessRates)) {
                if (rate < 0.6) {
                    poorFields.push(field);
                }
            }
        }
        return poorFields.length > 0 ? poorFields : ['content'];
    }

    private generateEmergencyChanges(changes: SiteChangeDetection[]): RuleChange[] {
        return changes.map(change => ({
            field: change.details.affectedFields[0] || 'content',
            changeType: 'selector_update' as const,
            oldValue: 'current selectors',
            newValue: 'emergency fallback selectors',
            reasoning: `Emergency fix for ${change.changeType}: ${change.details.description}`,
            confidence: 0.7
        }));
    }

    private generateOptimizationChanges(changes: SiteChangeDetection[]): RuleChange[] {
        return changes.map(change => ({
            field: change.details.affectedFields[0] || 'content',
            changeType: 'selector_update' as const,
            oldValue: 'current selectors',
            newValue: 'optimized selectors',
            reasoning: `Optimization for ${change.changeType}: ${change.details.description}`,
            confidence: 0.8
        }));
    }

    private generateRollbackPlan(domain: string): RollbackPlan {
        return {
            conditions: [
                'Success rate drops below 50%',
                'Quality score drops below 40%',
                'Error rate exceeds 25%'
            ],
            timeoutMinutes: 60,
            fallbackRule: this.getLastKnownGoodRule(domain),
            alerting: {
                enabled: true,
                thresholds: {
                    successRateDropThreshold: 0.15,
                    qualityDropThreshold: 0.15
                }
            }
        };
    }

    private async loadRule(ruleId: string): Promise<SiteRule | null> {
        // Simulate rule loading
        return {
            id: ruleId,
            name: `Rule for ${ruleId}`,
            domains: [this.extractDomainFromRuleId(ruleId)],
            selectors: {
                title: ['h1', '.headline'],
                content: ['.content', 'article'],
                author: ['.author'],
                date: ['.date', 'time'],
                summary: ['.summary']
            },
            priority: 1,
            metadata: {}
        };
    }

    private applyChangesToRule(rule: SiteRule, changes: RuleChange[]): SiteRule {
        const updatedRule = JSON.parse(JSON.stringify(rule)); // Deep clone

        changes.forEach(() => {
            // Apply change based on type
            // This is simplified - production would have proper change application logic
        });

        return updatedRule;
    }

    private extractDomainFromRuleId(ruleId: string): string {
        return ruleId.replace('-rule', '').replace('-enhanced', '');
    }

    private getLastKnownGoodRule(domain: string): SiteRule {
        // Return a basic fallback rule
        return {
            id: `${domain}-fallback`,
            name: `Fallback rule for ${domain}`,
            domains: [domain],
            selectors: {
                title: ['h1'],
                content: ['article', '.content'],
                author: ['.author'],
                date: ['time'],
                summary: ['.summary']
            },
            priority: 1,
            metadata: {fallback: true}
        };
    }
}