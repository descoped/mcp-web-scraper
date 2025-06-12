#!/usr/bin/env tsx

/**
 * Phase 3.6 - System Validation Pipeline CLI
 * Operational tooling for MCP-native collection and validation
 */

import {program} from 'commander';
import chalk from 'chalk';
import {SystemValidationController} from './system-validation/system-validation-controller.js';
import {DatasetManager} from './system-validation/utils/dataset-manager.js';
import type {
    SystemValidationConfig,
    SystemValidationProgress
} from './system-validation/types/system-validation-types.js';

interface CLIOptions {
    regions: string[];
    maxDomains?: number;
    maxArticles?: number;
    collectOnly: boolean;
    validateOnly: boolean;
    fullPipeline: boolean;
    enableConsent: boolean;
    enableRateLimit: boolean;
    qualityThreshold: number;
    timeout: number;
    batchSize: number;
    browserPool: number;
    outputDir: string;
    datasetFile: string;
    verbose: boolean;
    status: boolean;
}

function createProgressBar(current: number, total: number, width: number = 40): string {
    const progress = total > 0 ? current / total : 0;
    const filled = Math.round(width * progress);
    const empty = width - filled;
    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

function formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

async function showDatasetStatus(datasetFile: string): Promise<void> {
    console.log(chalk.cyan('📊 Dataset Status Report'));
    console.log(chalk.cyan('='.repeat(50)));

    try {
        const datasetManager = new DatasetManager(datasetFile);
        const status = await datasetManager.getDatasetStatus();

        console.log(`Total domains: ${chalk.bold(status.total_domains)}`);
        console.log(`Domains with URLs: ${chalk.bold(status.domains_with_urls)}`);
        console.log(`Total URLs: ${chalk.bold(status.total_urls)}`);
        console.log(`Dataset completeness: ${chalk.bold((status.completeness_score * 100).toFixed(1) + '%')}`);

        console.log('\n' + chalk.yellow('Regional Breakdown:'));
        for (const [region, data] of Object.entries(status.regions)) {
            const completion = data.domains > 0 ? (data.urls / (data.domains * 5) * 100).toFixed(1) : '0.0';
            console.log(`  ${region.padEnd(15)}: ${data.urls.toString().padStart(4)} URLs across ${data.domains} domains (${completion}% complete)`);
        }

        console.log('\n' + chalk.yellow('Quality Distribution:'));
        console.log(`  Excellent (>80%): ${status.quality_distribution.excellent}`);
        console.log(`  Good (60-80%):    ${status.quality_distribution.good}`);
        console.log(`  Acceptable (40-60%): ${status.quality_distribution.acceptable}`);
        console.log(`  Poor (<40%):      ${status.quality_distribution.poor}`);

        const phase4Ready = status.completeness_score >= 0.8 && status.total_urls >= 400;
        console.log(`\n🚀 Phase 4 readiness: ${phase4Ready ? chalk.green('✅ READY') : chalk.yellow('⚠️ NEEDS MORE DATA')}`);

        if (!phase4Ready) {
            const neededUrls = Math.max(0, 400 - status.total_urls);
            const neededCompletion = Math.max(0, (0.8 - status.completeness_score) * 100);
            if (neededUrls > 0) console.log(`   📊 Need ${neededUrls} more URLs`);
            if (neededCompletion > 0) console.log(`   📈 Need ${neededCompletion.toFixed(1)}% more completeness`);
        }

    } catch (error) {
        console.error(chalk.red('❌ Failed to get dataset status:'), error.message);
        process.exit(1);
    }
}

function displayProgress(progress: SystemValidationProgress): void {
    const percentage = progress.total_domains > 0
        ? (progress.domains_completed / progress.total_domains * 100).toFixed(1)
        : '0.0';

    const progressBar = createProgressBar(progress.domains_completed, progress.total_domains);

    switch (progress.stage) {
        case 'initializing':
            console.log(chalk.blue('🔧 Initializing system validation pipeline...'));
            break;

        case 'collecting':
            console.log(`${chalk.yellow('📡 Collection:')} ${progressBar} ${percentage}% (${progress.domains_completed}/${progress.total_domains})`);
            if (progress.current_domain) {
                console.log(`    ${chalk.gray('Current:')} ${progress.current_domain}`);
            }
            break;

        case 'validating':
            const successRate = (progress.current_success_rate * 100).toFixed(1);
            console.log(`${chalk.green('🧪 Validation:')} ${progressBar} ${percentage}% | Success: ${successRate}%`);
            if (progress.current_domain) {
                console.log(`    ${chalk.gray('Testing:')} ${progress.current_domain}`);
            }
            break;

        case 'analyzing':
            console.log(chalk.cyan('📊 Analyzing results and generating reports...'));
            break;

        case 'completed':
            console.log(chalk.green('🎉 System validation pipeline completed!'));
            break;
    }
}

async function executeSystemValidation(options: CLIOptions): Promise<void> {
    const startTime = Date.now();

    console.log(chalk.blue('🚀 MCP Web Scraper - System Validation Pipeline v3.6'));
    console.log(chalk.blue('='.repeat(60)));
    console.log(`${chalk.gray('Start time:')} ${new Date().toLocaleString()}`);
    console.log('');

    // Build configuration
    const config: SystemValidationConfig = {
        regions: options.regions,
        max_domains_per_region: options.maxDomains,
        max_articles_per_domain: options.maxArticles || 5,
        enable_consent_handling: options.enableConsent,
        enable_rate_limiting: options.enableRateLimit,
        quality_threshold: options.qualityThreshold,
        timeout_per_url: options.timeout,
        batch_size: options.batchSize,
        browser_pool_size: options.browserPool,
        output_directory: options.outputDir,
        dataset_file: options.datasetFile,
        verbose: options.verbose
    };

    console.log(chalk.yellow('📋 Configuration:'));
    console.log(`   Regions: ${config.regions.join(', ')}`);
    console.log(`   Max domains per region: ${config.max_domains_per_region || 'unlimited'}`);
    console.log(`   Articles per domain: ${config.max_articles_per_domain}`);
    console.log(`   Consent handling: ${config.enable_consent_handling ? 'enabled' : 'disabled'}`);
    console.log(`   Rate limiting: ${config.enable_rate_limiting ? 'enabled' : 'disabled'}`);
    console.log(`   Quality threshold: ${config.quality_threshold}`);
    console.log(`   Browser pool: ${config.browser_pool_size}`);
    console.log(`   Verbose logging: ${config.verbose ? chalk.green('enabled') : 'disabled'}`);
    console.log('');

    try {
        const controller = new SystemValidationController(config);

        // Set up progress monitoring
        controller.setProgressCallback(displayProgress);

        let result;

        if (options.collectOnly) {
            console.log(chalk.yellow('📡 Collection-Only Mode'));
            result = await controller.executeCollectionOnly();
        } else if (options.validateOnly) {
            console.log(chalk.yellow('🧪 Validation-Only Mode'));
            result = await controller.executeValidationOnly();
        } else {
            console.log(chalk.yellow('🔄 Full Pipeline Mode (Collection + Validation)'));
            result = await controller.executeSystemValidation();
        }

        // Display results summary
        const duration = formatDuration(Date.now() - startTime);

        console.log('');
        console.log(chalk.green('🎯 EXECUTION SUMMARY'));
        console.log(chalk.green('='.repeat(40)));
        console.log(`${chalk.gray('Duration:')} ${duration}`);
        console.log(`${chalk.gray('Execution ID:')} ${result.execution_id}`);

        if (result.collection_summary.domains_processed > 0) {
            console.log('');
            console.log(chalk.cyan('📡 Collection Results:'));
            console.log(`   Domains processed: ${result.collection_summary.domains_processed}`);
            console.log(`   URLs discovered: ${result.collection_summary.total_urls_discovered}`);
            console.log(`   URLs added: ${result.collection_summary.total_urls_added}`);
            console.log(`   Collection success rate: ${(result.collection_summary.collection_success_rate * 100).toFixed(1)}%`);
        }

        if (result.validation_summary.total_urls_tested > 0) {
            console.log('');
            console.log(chalk.cyan('🧪 Validation Results:'));
            console.log(`   Domains tested: ${result.validation_summary.domains_tested}`);
            console.log(`   URLs tested: ${result.validation_summary.total_urls_tested}`);
            console.log(`   Successful extractions: ${result.validation_summary.successful_extractions}`);
            console.log(`   Overall success rate: ${chalk.bold((result.validation_summary.overall_success_rate * 100).toFixed(1) + '%')}`);
            console.log(`   Consent handling rate: ${(result.validation_summary.consent_handling_rate * 100).toFixed(1)}%`);
            console.log(`   Average quality score: ${result.validation_summary.average_quality_score.toFixed(2)}`);
            console.log(`   Average extraction time: ${result.validation_summary.average_extraction_time_ms.toFixed(0)}ms`);
        }

        // Production readiness assessment
        console.log('');
        console.log(chalk.cyan('🚀 Production Readiness:'));
        const readiness = result.production_readiness;
        console.log(`   Phase 4 ready: ${readiness.phase4_ready ? chalk.green('✅ YES') : chalk.yellow('⚠️ NO')}`);
        console.log(`   Performance rating: ${chalk.bold(readiness.performance_rating.toUpperCase())}`);
        console.log(`   Dataset completeness: ${(readiness.dataset_completeness * 100).toFixed(1)}%`);
        console.log(`   Extraction reliability: ${(readiness.extraction_reliability * 100).toFixed(1)}%`);
        console.log(`   Consent coverage: ${(readiness.consent_coverage * 100).toFixed(1)}%`);

        // Top recommendations
        if (result.recommendations.length > 0) {
            console.log('');
            console.log(chalk.cyan('🎯 Priority Recommendations:'));
            result.recommendations.slice(0, 3).forEach((rec, i) => {
                console.log(`   ${i + 1}. ${rec}`);
            });
        }

        // Next steps
        if (result.next_steps.length > 0) {
            console.log('');
            console.log(chalk.cyan('📋 Next Steps:'));
            result.next_steps.forEach((step, i) => {
                console.log(`   ${i + 1}. ${step}`);
            });
        }

        // Output locations
        console.log('');
        console.log(chalk.cyan('📁 Results Available:'));
        console.log(`   📊 Reports: ${config.output_directory}/`);
        console.log('   📈 Executive summary: executive-summary-*.json');
        console.log('   📋 Detailed report: detailed-report-*.yaml');
        console.log('   📊 Validation data: validation-results-*.csv');
        console.log('   📝 Production readiness: production-readiness-*.md');

        if (options.verbose) {
            console.log('');
            console.log(chalk.gray('🔍 Detailed Results:'));
            console.log(JSON.stringify(result, null, 2));
        }

        // Force flush all output to ensure visibility in CLI tools
        process.stdout.write('');
        process.stderr.write('');

    } catch (error) {
        console.error('');
        console.error(chalk.red('💥 System validation failed:'));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));

        if (error instanceof Error && error.stack && options.verbose) {
            console.error('');
            console.error(chalk.gray('Stack trace:'));
            console.error(chalk.gray(error.stack));
        }

        console.error('');
        console.error(chalk.yellow('🔧 Troubleshooting Tips:'));
        console.error('   1. Verify dataset file exists and is valid YAML');
        console.error('   2. Check browser dependencies and Playwright installation');
        console.error('   3. Ensure sufficient memory and network connectivity');
        console.error('   4. Try reducing --max-domains and --browser-pool');
        console.error('   5. Use --verbose for detailed error information');
        console.error('   6. Check output directory permissions');

        process.exit(1);
    }
}

async function main(): Promise<void> {
    program
        .name('run-system-validation')
        .version('3.6.0')
        .description('MCP Web Scraper System Validation Pipeline - Collection and validation using production MCP tools')

        // Operational modes
        .option('--collect-only', 'Only perform URL collection, skip validation')
        .option('--validate-only', 'Only perform validation, skip collection')
        .option('--full-pipeline', 'Execute complete collection + validation pipeline (default)')

        // Scope configuration
        .option('-r, --regions <regions>', 'Comma-separated regions to process', 'scandinavian')
        .option('--max-domains <number>', 'Maximum domains per region', parseInt)
        .option('--max-articles <number>', 'Maximum articles per domain', parseInt, 5)

        // MCP configuration
        .option('--enable-consent', 'Enable consent handling (default: true)', true)
        .option('--disable-consent', 'Disable consent handling')
        .option('--enable-rate-limit', 'Enable rate limiting (default: true)', true)
        .option('--disable-rate-limit', 'Disable rate limiting')

        // Quality and performance
        .option('--quality-threshold <number>', 'Quality threshold (0-1)', parseFloat, 0.4)
        .option('--timeout <number>', 'Timeout per URL in ms', parseInt, 30000)
        .option('--batch-size <number>', 'Batch size for parallel processing', parseInt, 3)
        .option('--browser-pool <number>', 'Browser pool size', parseInt, 4)

        // File configuration
        .option('--output-dir <path>', 'Output directory for results', './output/system-validation')
        .option('--dataset-file <path>', 'Path to dataset YAML file', './config/article-test-urls.yaml')

        // Utility options
        .option('--status', 'Show dataset status and exit')
        .option('--verbose', 'Verbose logging and detailed output')

        .parse();

    const options = program.opts();

    // Parse regions
    const regions = typeof options.regions === 'string'
        ? options.regions.split(',').map((r: string) => r.trim())
        : ['scandinavian'];

    // Handle consent and rate limiting flags
    const enableConsent = options.enableConsent && !options.disableConsent;
    const enableRateLimit = options.enableRateLimit && !options.disableRateLimit;

    // Determine mode
    const collectOnly = options.collectOnly;
    const validateOnly = options.validateOnly;
    const fullPipeline = !collectOnly && !validateOnly;

    const cliOptions: CLIOptions = {
        regions,
        maxDomains: options.maxDomains,
        maxArticles: options.maxArticles,
        collectOnly,
        validateOnly,
        fullPipeline,
        enableConsent,
        enableRateLimit,
        qualityThreshold: options.qualityThreshold,
        timeout: options.timeout,
        batchSize: options.batchSize,
        browserPool: options.browserPool,
        outputDir: options.outputDir,
        datasetFile: options.datasetFile,
        verbose: options.verbose,
        status: options.status
    };

    try {
        if (options.status) {
            await showDatasetStatus(cliOptions.datasetFile);
            return;
        }

        await executeSystemValidation(cliOptions);

    } catch (error) {
        console.error(chalk.red('💥 Fatal error:'), error);
        process.exit(1);
    }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('');
    console.log(chalk.yellow('⚠️ Received interrupt signal - cleaning up...'));
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log('');
    console.log(chalk.yellow('⚠️ Received termination signal - cleaning up...'));
    process.exit(1);
});

// Run the CLI
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(error => {
        console.error(chalk.red('💥 Unhandled error:'), error);
        process.exit(1);
    });
}