/**
 * Phase 3.6 - System Validation Controller
 * Domain: Workflow orchestration for collection + validation lifecycle
 */

import {MCPCollectionValidator} from './mcp-collection-validator.js';
import {MCPExtractionValidator} from './mcp-extraction-validator.js';
import {DatasetManager} from './utils/dataset-manager.js';
import {ValidationReporter} from './utils/validation-reporters.js';
import type {
    CollectionConfig,
    DomainTarget,
    SystemValidationConfig,
    SystemValidationProgress,
    SystemValidationResult,
    ValidationConfig
} from './types/system-validation-types.js';

export class SystemValidationController {
    private config: SystemValidationConfig;
    private collectionValidator: MCPCollectionValidator;
    private extractionValidator: MCPExtractionValidator;
    private datasetManager: DatasetManager;
    private reporter: ValidationReporter;
    private progressCallback?: (progress: SystemValidationProgress) => void;
    private verbose: boolean = false;

    constructor(config: SystemValidationConfig) {
        this.config = config;
        this.verbose = config.verbose || false;
        this.datasetManager = new DatasetManager(config.dataset_file);
        this.reporter = new ValidationReporter(config.output_directory);

        // Initialize validators with MCP tools
        const collectionConfig: CollectionConfig = {
            discovery_strategies: ['homepage', 'rss'],
            validate_during_collection: true,
            min_content_quality: config.quality_threshold,
            max_collection_time_per_domain: config.timeout_per_url * 3,
            frontpage_risk_threshold: 0.6
        };

        const validationConfig: ValidationConfig = {
            consent_languages: ['no', 'en', 'sv', 'da', 'de', 'fr', 'es'],
            rate_limit_delay: 2000,
            retry_attempts: 3,
            quality_assessment: true,
            performance_benchmarking: true
        };

        this.collectionValidator = new MCPCollectionValidator(
            collectionConfig,
            config.browser_pool_size
        );

        this.extractionValidator = new MCPExtractionValidator(
            validationConfig,
            config.browser_pool_size
        );
    }

    /**
     * Verbose logging methods
     */
    private log(message: string, force: boolean = false): void {
        if (this.verbose || force) {
            console.log(message);
            process.stdout.write(''); // Force flush for real-time output
        }
    }

    private logInfo(message: string): void {
        if (this.verbose) {
            console.log(`ℹ️  ${message}`);
            process.stdout.write(''); // Force flush for real-time output
        }
    }

    private logSuccess(message: string): void {
        if (this.verbose) {
            console.log(`✅ ${message}`);
            process.stdout.write(''); // Force flush for real-time output
        }
    }

    private logWarning(message: string): void {
        if (this.verbose) {
            console.log(`⚠️  ${message}`);
            process.stdout.write(''); // Force flush for real-time output
        }
    }

    private logError(message: string): void {
        if (this.verbose) {
            console.log(`❌ ${message}`);
            process.stdout.write(''); // Force flush for real-time output
        }
    }

    private logProgress(domain: string, current: number, total: number, status: string): void {
        if (this.verbose) {
            const percentage = ((current / total) * 100).toFixed(1);
            console.log(`📊 [${percentage}%] ${domain}: ${status}`);
            process.stdout.write(''); // Force flush for real-time output
        }
    }

    /**
     * Set progress callback for real-time updates
     */
    setProgressCallback(callback: (progress: SystemValidationProgress) => void): void {
        this.progressCallback = callback;
    }

    /**
     * Execute complete system validation pipeline
     */
    async executeSystemValidation(): Promise<SystemValidationResult> {
        const executionId = `system-validation-${Date.now()}`;
        const startTime = new Date().toISOString();

        console.log(`🚀 Starting System Validation Pipeline: ${executionId}`);
        console.log('='.repeat(80));

        try {
            this.updateProgress('initializing', 0, 0);
            this.logInfo('🔧 Initializing system validation pipeline...');

            // Load dataset and determine targets
            this.logInfo(`📊 Loading dataset from ${this.config.dataset_file}`);
            const dataset = await this.datasetManager.loadDataset();
            this.logSuccess(`Loaded dataset with ${Object.keys(dataset.domains).length} domains`);

            const allDomainTargets = this.datasetManager.datasetToDomainTargets(
                dataset,
                this.config.regions
            );

            // Filter domains by configuration limits
            const limitedDomains = this.config.max_domains_per_region
                ? this.limitDomainsByRegion(allDomainTargets, this.config.max_domains_per_region)
                : allDomainTargets;

            this.logInfo(`🎯 Filtered to ${limitedDomains.length} domains for regions: ${this.config.regions.join(', ')}`);
            console.log(`📊 Processing ${limitedDomains.length} domains across ${this.config.regions.join(', ')} regions`);

            // Determine which domains need collection
            this.logInfo(`🔍 Checking which domains need URL collection (min ${this.config.max_articles_per_domain || 3} URLs per domain)`);
            const domainsNeedingCollection = this.datasetManager.getDomainsThatNeedCollection(
                limitedDomains,
                this.config.max_articles_per_domain || 3
            );

            this.logInfo(`📈 Analysis complete: ${domainsNeedingCollection.length}/${limitedDomains.length} domains need collection`);
            console.log(`📡 ${domainsNeedingCollection.length} domains need URL collection`);

            // Step 1: Collection Phase
            const collectionResults = await this.executeCollectionPhase(
                domainsNeedingCollection,
                limitedDomains.length
            );

            // Update dataset with collected URLs
            const updatedDataset = await this.datasetManager.updateDatasetWithCollectionResults(
                dataset,
                collectionResults
            );
            await this.datasetManager.saveDataset(updatedDataset);

            // Step 2: Validation Phase
            const validationResults = await this.executeValidationPhase(
                limitedDomains,
                limitedDomains.length
            );

            // Step 3: Analysis and Reporting
            this.updateProgress('analyzing', limitedDomains.length, limitedDomains.length);

            const systemValidationResult = await this.generateSystemValidationResult(
                executionId,
                startTime,
                collectionResults,
                validationResults
            );

            // Export results
            await this.exportResults(systemValidationResult);

            this.updateProgress('completed', limitedDomains.length, limitedDomains.length);

            console.log('🎉 System Validation Pipeline completed successfully!');
            return systemValidationResult;

        } catch (error) {
            console.error('💥 System Validation Pipeline failed:', error.message);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Execute only collection phase
     */
    async executeCollectionOnly(): Promise<SystemValidationResult> {
        const executionId = `collection-only-${Date.now()}`;
        const startTime = new Date().toISOString();

        console.log(`📡 Starting Collection-Only Pipeline: ${executionId}`);

        try {
            this.updateProgress('initializing', 0, 0);

            const dataset = await this.datasetManager.loadDataset();
            const domainTargets = this.datasetManager.datasetToDomainTargets(
                dataset,
                this.config.regions
            );

            const domainsNeedingCollection = this.datasetManager.getDomainsThatNeedCollection(
                domainTargets,
                this.config.max_articles_per_domain || 3
            );

            const collectionResults = await this.executeCollectionPhase(
                domainsNeedingCollection,
                domainsNeedingCollection.length
            );

            // Update dataset
            const updatedDataset = await this.datasetManager.updateDatasetWithCollectionResults(
                dataset,
                collectionResults
            );
            await this.datasetManager.saveDataset(updatedDataset);

            const systemValidationResult = await this.generateSystemValidationResult(
                executionId,
                startTime,
                collectionResults,
                []
            );

            await this.exportResults(systemValidationResult);

            console.log('✅ Collection-Only Pipeline completed!');
            return systemValidationResult;

        } finally {
            await this.cleanup();
        }
    }

    /**
     * Execute only validation phase
     */
    async executeValidationOnly(): Promise<SystemValidationResult> {
        const executionId = `validation-only-${Date.now()}`;
        const startTime = new Date().toISOString();

        console.log(`🧪 Starting Validation-Only Pipeline: ${executionId}`);

        try {
            this.updateProgress('initializing', 0, 0);

            const dataset = await this.datasetManager.loadDataset();
            const domainTargets = this.datasetManager.datasetToDomainTargets(
                dataset,
                this.config.regions
            );

            const validationResults = await this.executeValidationPhase(
                domainTargets,
                domainTargets.length
            );

            const systemValidationResult = await this.generateSystemValidationResult(
                executionId,
                startTime,
                [],
                validationResults
            );

            await this.exportResults(systemValidationResult);

            console.log('✅ Validation-Only Pipeline completed!');
            return systemValidationResult;

        } finally {
            await this.cleanup();
        }
    }

    private async executeCollectionPhase(
        domainsNeedingCollection: DomainTarget[],
        totalDomains: number
    ) {
        if (domainsNeedingCollection.length === 0) {
            this.logInfo('📊 No domains need URL collection - skipping collection phase');
            console.log('📊 No domains need URL collection - skipping collection phase');
            return [];
        }

        this.logInfo(`🚀 Starting collection phase for ${domainsNeedingCollection.length} domains`);
        this.updateProgress('collecting', 0, totalDomains);

        const collectionResults = await this.collectionValidator.collectUrlsForDomains(
            domainsNeedingCollection,
            (current, total, domain) => {
                this.logProgress(domain, current, total, 'collecting URLs');
                this.updateProgress('collecting', current, total, domain);
            }
        );

        const totalUrlsCollected = collectionResults.reduce((sum, r) => sum + r.urls_added, 0);
        this.logSuccess(`Collection phase completed: ${totalUrlsCollected} URLs collected from ${collectionResults.length} domains`);

        // Log detailed collection results
        if (this.verbose) {
            collectionResults.forEach(result => {
                if (result.urls_added > 0) {
                    this.logSuccess(`${result.domain}: +${result.urls_added} URLs (quality: ${result.average_quality_score.toFixed(2)})`);
                } else {
                    this.logWarning(`${result.domain}: No URLs collected - ${result.errors.length} errors`);
                }
            });
        }

        console.log(`📡 Collection phase complete: ${totalUrlsCollected} URLs collected across ${collectionResults.length} domains`);

        return collectionResults;
    }

    private async executeValidationPhase(
        domainTargets: DomainTarget[],
        totalDomains: number
    ) {
        this.logInfo(`🧪 Starting validation phase for ${domainTargets.length} domains`);
        this.updateProgress('validating', 0, totalDomains);

        const validationResults = await this.extractionValidator.validateDomainTargets(
            domainTargets,
            this.config.max_articles_per_domain || 5,
            (current, total, domain) => {
                this.logProgress(domain, current, total, 'validating URLs');
                this.updateProgress('validating', current, total, domain);
            }
        );

        const successfulValidations = validationResults.filter(r => r.success).length;
        const overallSuccessRate = (successfulValidations / validationResults.length * 100).toFixed(1);

        this.logSuccess(`Validation phase completed: ${successfulValidations}/${validationResults.length} successful (${overallSuccessRate}%)`);

        // Log detailed validation results
        if (this.verbose) {
            const domainStats: Record<string, { success: number; total: number; avgQuality: number }> = {};

            validationResults.forEach(result => {
                if (!domainStats[result.domain]) {
                    domainStats[result.domain] = {success: 0, total: 0, avgQuality: 0};
                }
                domainStats[result.domain].total++;
                domainStats[result.domain].avgQuality += result.quality_score;
                if (result.success) {
                    domainStats[result.domain].success++;
                }
            });

            Object.entries(domainStats).forEach(([domain, stats]) => {
                const successRate = (stats.success / stats.total * 100).toFixed(1);
                const avgQuality = (stats.avgQuality / stats.total).toFixed(2);

                if (stats.success === stats.total) {
                    this.logSuccess(`${domain}: ${stats.success}/${stats.total} (${successRate}%) - Avg quality: ${avgQuality}`);
                } else if (stats.success > 0) {
                    this.logWarning(`${domain}: ${stats.success}/${stats.total} (${successRate}%) - Avg quality: ${avgQuality}`);
                } else {
                    this.logError(`${domain}: ${stats.success}/${stats.total} (${successRate}%) - All validations failed`);
                }
            });
        }

        console.log(`🧪 Validation phase complete: ${successfulValidations}/${validationResults.length} successful validations`);

        return validationResults;
    }

    private async generateSystemValidationResult(
        executionId: string,
        startTime: string,
        collectionResults: Record<string, unknown>[],
        validationResults: Record<string, unknown>[]
    ): Promise<SystemValidationResult> {
        const endTime = new Date().toISOString();
        const totalDuration = new Date(endTime).getTime() - new Date(startTime).getTime();

        // Collection summary
        const collectionSummary = {
            domains_processed: collectionResults.length,
            total_urls_discovered: collectionResults.reduce((sum, r) => sum + r.urls_discovered, 0),
            total_urls_validated: collectionResults.reduce((sum, r) => sum + r.urls_validated, 0),
            total_urls_added: collectionResults.reduce((sum, r) => sum + r.urls_added, 0),
            collection_success_rate: collectionResults.length > 0
                ? collectionResults.filter(r => r.urls_added > 0).length / collectionResults.length
                : 0,
            average_collection_time_ms: collectionResults.length > 0
                ? collectionResults.reduce((sum, r) => sum + r.collection_time_ms, 0) / collectionResults.length
                : 0
        };

        // Validation summary
        const validationSummary = this.extractionValidator.generateValidationSummary(validationResults);

        // Production readiness assessment
        const productionReadiness = {
            phase4_ready: validationSummary.overall_success_rate >= 0.7 &&
                validationSummary.total_urls_tested >= 50,
            dataset_completeness: Math.min(collectionSummary.total_urls_added / 400, 1.0),
            extraction_reliability: validationSummary.overall_success_rate,
            consent_coverage: validationSummary.consent_handling_rate,
            performance_rating: this.assessPerformanceRating(validationSummary)
        };

        // Generate recommendations
        const recommendations = this.generateRecommendations(
            collectionSummary,
            validationSummary,
            productionReadiness
        );

        return {
            execution_id: executionId,
            start_time: startTime,
            end_time: endTime,
            total_duration_ms: totalDuration,
            config: this.config,
            collection_summary: collectionSummary,
            collection_results: collectionResults,
            validation_summary: validationSummary,
            validation_results: validationResults,
            production_readiness: productionReadiness,
            recommendations,
            next_steps: this.generateNextSteps(productionReadiness)
        };
    }

    private assessPerformanceRating(validationSummary: Record<string, unknown>): 'excellent' | 'good' | 'acceptable' | 'needs_improvement' {
        const successRate = validationSummary.overall_success_rate;
        const avgTime = validationSummary.average_extraction_time_ms;

        if (successRate >= 0.9 && avgTime <= 3000) return 'excellent';
        if (successRate >= 0.7 && avgTime <= 5000) return 'good';
        if (successRate >= 0.5 && avgTime <= 10000) return 'acceptable';
        return 'needs_improvement';
    }

    private generateRecommendations(collectionSummary: Record<string, unknown>, validationSummary: Record<string, unknown>, productionReadiness: Record<string, unknown>): string[] {
        const recommendations: string[] = [];

        if (collectionSummary.collection_success_rate < 0.8) {
            recommendations.push('🔍 Improve URL discovery strategies - enhance RSS and sitemap parsing');
        }

        if (validationSummary.overall_success_rate < 0.7) {
            recommendations.push('🎯 Enhance extraction accuracy - review universal selectors and add bespoke rules');
        }

        if (validationSummary.consent_handling_rate < 0.8) {
            recommendations.push('🍪 Improve consent detection - expand language support and patterns');
        }

        if (validationSummary.average_extraction_time_ms > 5000) {
            recommendations.push('⚡ Optimize performance - reduce extraction time and improve rate limiting');
        }

        if (productionReadiness.dataset_completeness < 0.8) {
            recommendations.push('📊 Expand dataset - collect more URLs to reach Phase 4 readiness target');
        }

        return recommendations;
    }

    private generateNextSteps(productionReadiness: Record<string, unknown>): string[] {
        const steps: string[] = [];

        if (productionReadiness.phase4_ready) {
            steps.push('🚀 Proceed with Phase 4 implementation');
            steps.push('🌍 Scale to all domains and regions');
            steps.push('📱 Deploy production MCP server');
        } else {
            steps.push('📈 Address performance and quality issues');
            steps.push('🔄 Re-run system validation after improvements');
            steps.push('📊 Collect more validation data');
        }

        return steps;
    }

    private limitDomainsByRegion(domains: DomainTarget[], maxPerRegion: number): DomainTarget[] {
        const regionGroups: Record<string, DomainTarget[]> = {};

        // Group by region
        domains.forEach(domain => {
            if (!regionGroups[domain.region]) {
                regionGroups[domain.region] = [];
            }
            regionGroups[domain.region].push(domain);
        });

        // Limit each region and flatten
        const limitedDomains: DomainTarget[] = [];
        for (const regionDomains of Object.values(regionGroups)) {
            limitedDomains.push(...regionDomains.slice(0, maxPerRegion));
        }

        return limitedDomains;
    }

    private async exportResults(result: SystemValidationResult): Promise<void> {
        await this.reporter.generateComprehensiveReport(result);

        // Export collection results if any
        if (result.collection_results.length > 0) {
            const collectionCsvPath = `${this.config.output_directory}/collection-results-${Date.now()}.csv`;
            await this.datasetManager.exportCollectionResults(result.collection_results, collectionCsvPath);
        }

        console.log(`📁 Results exported to ${this.config.output_directory}/`);
    }

    private updateProgress(
        stage: SystemValidationProgress['stage'],
        completed: number,
        total: number,
        currentDomain?: string
    ): void {
        if (this.progressCallback) {
            const progress: SystemValidationProgress = {
                stage,
                current_domain: currentDomain,
                domains_completed: completed,
                total_domains: total,
                urls_processed: 0, // Would track this more precisely in real implementation
                current_success_rate: 0, // Would calculate from current results
                estimated_completion_time: undefined // Would calculate based on current progress
            };

            this.progressCallback(progress);
        }
    }

    private async cleanup(): Promise<void> {
        console.log('🧹 Cleaning up system validation resources...');

        try {
            await Promise.all([
                this.collectionValidator.cleanup(),
                this.extractionValidator.cleanup()
            ]);
            console.log('✅ System validation cleanup completed');
        } catch (error) {
            console.error('❌ Cleanup failed:', error.message);
        }
    }
}