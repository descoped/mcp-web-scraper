/**
 * Phase 3.6 - Validation Reporters
 * Domain: Result reporting and analysis for system validation
 */

import {promises as fs} from 'fs';
import yaml from 'js-yaml';
import type {SystemValidationResult} from '@tests/system-validation/types/system-validation-types.js';

export class ValidationReporter {
    private outputDir: string;

    constructor(outputDir: string) {
        this.outputDir = outputDir;
    }

    /**
     * Generate comprehensive system validation report
     */
    async generateComprehensiveReport(result: SystemValidationResult): Promise<void> {
        // Ensure output directory exists
        await fs.mkdir(this.outputDir, {recursive: true});

        const timestamp = new Date(result.start_time).toISOString().replace(/[:.]/g, '-');

        // Generate multiple report formats
        await Promise.all([
            this.generateExecutiveSummary(result, `${this.outputDir}/executive-summary-${timestamp}.json`),
            this.generateDetailedReport(result, `${this.outputDir}/detailed-report-${timestamp}.yaml`),
            this.generateValidationCSV(result, `${this.outputDir}/validation-results-${timestamp}.csv`),
            this.generateProductionReadinessReport(result, `${this.outputDir}/production-readiness-${timestamp}.md`),
            this.generateMetricsReport(result, `${this.outputDir}/metrics-summary-${timestamp}.json`)
        ]);

        console.log(`📊 Comprehensive reports generated in ${this.outputDir}/`);
    }

    /**
     * Generate executive summary for stakeholders
     */
    private async generateExecutiveSummary(result: SystemValidationResult, outputPath: string): Promise<void> {
        const summary = {
            execution_id: result.execution_id,
            execution_date: result.start_time,
            duration_minutes: (result.total_duration_ms / 60000).toFixed(1),

            // High-level metrics
            domains_processed: result.validation_summary.domains_tested,
            urls_tested: result.validation_summary.total_urls_tested,
            overall_success_rate: result.validation_summary.overall_success_rate,

            // Production readiness
            phase4_ready: result.production_readiness.phase4_ready,
            performance_rating: result.production_readiness.performance_rating,

            // Key findings
            key_findings: [
                `${(result.validation_summary.overall_success_rate * 100).toFixed(1)}% overall success rate across ${result.validation_summary.total_urls_tested} URLs`,
                `${(result.validation_summary.consent_handling_rate * 100).toFixed(1)}% consent handling effectiveness`,
                `${result.validation_summary.average_extraction_time_ms.toFixed(0)}ms average extraction time`,
                `${result.collection_summary.total_urls_added} new URLs collected and validated`
            ],

            // Top recommendations
            priority_recommendations: result.recommendations.slice(0, 3),

            // Next steps
            recommended_actions: result.next_steps,

            // Configuration used
            test_configuration: {
                regions: result.config.regions,
                consent_handling: result.config.enable_consent_handling,
                rate_limiting: result.config.enable_rate_limiting,
                quality_threshold: result.config.quality_threshold
            }
        };

        await fs.writeFile(outputPath, JSON.stringify(summary, null, 2), 'utf8');
    }

    /**
     * Generate detailed technical report
     */
    private async generateDetailedReport(result: SystemValidationResult, outputPath: string): Promise<void> {
        const detailedReport = {
            system_validation_report: {
                metadata: {
                    execution_id: result.execution_id,
                    start_time: result.start_time,
                    end_time: result.end_time,
                    total_duration_ms: result.total_duration_ms,
                    configuration: result.config
                },

                collection_analysis: {
                    summary: result.collection_summary,
                    domain_breakdown: this.analyzeCollectionByDomain(result.collection_results),
                    discovery_method_effectiveness: this.analyzeDiscoveryMethods(result.collection_results),
                    quality_distribution: this.analyzeCollectionQuality(result.collection_results)
                },

                validation_analysis: {
                    summary: result.validation_summary,
                    domain_performance: this.analyzeValidationByDomain(result.validation_results),
                    regional_performance: this.analyzeValidationByRegion(result.validation_results),
                    field_extraction_analysis: result.validation_summary.field_extraction_rates,
                    error_analysis: result.validation_summary.error_analysis,
                    performance_analysis: result.validation_summary.performance_analysis
                },

                production_readiness: {
                    assessment: result.production_readiness,
                    readiness_criteria: {
                        minimum_success_rate: 0.7,
                        minimum_urls_tested: 50,
                        consent_coverage_target: 0.8,
                        performance_target_ms: 5000
                    },
                    gaps_identified: this.identifyReadinessGaps(result),
                    improvement_roadmap: result.recommendations
                },

                recommendations: {
                    immediate_actions: result.recommendations.filter(r => r.includes('🔥') || r.includes('❌')),
                    optimization_opportunities: result.recommendations.filter(r => r.includes('⚡') || r.includes('📈')),
                    long_term_improvements: result.recommendations.filter(r => r.includes('🔍') || r.includes('📊'))
                }
            }
        };

        const yamlContent = yaml.dump(detailedReport, {indent: 2, lineWidth: 120});
        await fs.writeFile(outputPath, yamlContent, 'utf8');
    }

    /**
     * Generate validation results CSV
     */
    private async generateValidationCSV(result: SystemValidationResult, outputPath: string): Promise<void> {
        const csvHeaders = [
            'URL', 'Domain', 'Region', 'Success', 'Quality Score', 'Extraction Time (ms)',
            'Consent Handled', 'Consent Time (ms)', 'Method Used', 'Title Extracted',
            'Content Extracted', 'Author Extracted', 'Date Extracted', 'Summary Extracted',
            'Error Message', 'Retry Count'
        ];

        const csvRows = [csvHeaders.join(',')];

        for (const validation of result.validation_results) {
            const row = [
                validation.url,
                validation.domain,
                validation.region,
                validation.success.toString(),
                validation.quality_score.toFixed(3),
                validation.extraction_time_ms.toString(),
                validation.consent_handled.toString(),
                validation.consent_time_ms.toString(),
                validation.method_used,
                validation.fields_extracted.title.toString(),
                validation.fields_extracted.content.toString(),
                validation.fields_extracted.author.toString(),
                validation.fields_extracted.date.toString(),
                validation.fields_extracted.summary.toString(),
                validation.error_message || '',
                validation.retry_count.toString()
            ].map(field => `"${field.replace(/"/g, '""')}"`);

            csvRows.push(row.join(','));
        }

        await fs.writeFile(outputPath, csvRows.join('\n'), 'utf8');
    }

    /**
     * Generate production readiness markdown report
     */
    private async generateProductionReadinessReport(result: SystemValidationResult, outputPath: string): Promise<void> {
        const readiness = result.production_readiness;
        const validation = result.validation_summary;

        const markdown = `# Production Readiness Assessment

**Execution ID:** ${result.execution_id}  
**Assessment Date:** ${new Date(result.start_time).toLocaleDateString()}  
**Overall Rating:** ${readiness.performance_rating.toUpperCase()}

## Executive Summary

${readiness.phase4_ready ? '✅ **READY FOR PHASE 4**' : '⚠️ **NOT READY FOR PHASE 4**'}

The system validation pipeline has completed comprehensive testing across ${validation.domains_tested} domains with ${validation.total_urls_tested} URLs tested.

## Key Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Success Rate | ${(validation.overall_success_rate * 100).toFixed(1)}% | ≥70% | ${validation.overall_success_rate >= 0.7 ? '✅' : '❌'} |
| Consent Handling | ${(validation.consent_handling_rate * 100).toFixed(1)}% | ≥80% | ${validation.consent_handling_rate >= 0.8 ? '✅' : '⚠️'} |
| Avg Extraction Time | ${validation.average_extraction_time_ms.toFixed(0)}ms | ≤5000ms | ${validation.average_extraction_time_ms <= 5000 ? '✅' : '⚠️'} |
| Dataset Completeness | ${(readiness.dataset_completeness * 100).toFixed(1)}% | ≥80% | ${readiness.dataset_completeness >= 0.8 ? '✅' : '⚠️'} |

## Field Extraction Performance

| Field | Success Rate | Quality Assessment |
|-------|-------------|-------------------|
| Title | ${(validation.field_extraction_rates.title * 100).toFixed(1)}% | ${validation.field_extraction_rates.title >= 0.9 ? 'Excellent' : validation.field_extraction_rates.title >= 0.7 ? 'Good' : 'Needs Improvement'} |
| Content | ${(validation.field_extraction_rates.content * 100).toFixed(1)}% | ${validation.field_extraction_rates.content >= 0.8 ? 'Excellent' : validation.field_extraction_rates.content >= 0.6 ? 'Good' : 'Needs Improvement'} |
| Author | ${(validation.field_extraction_rates.author * 100).toFixed(1)}% | ${validation.field_extraction_rates.author >= 0.6 ? 'Good' : 'Acceptable'} |
| Date | ${(validation.field_extraction_rates.date * 100).toFixed(1)}% | ${validation.field_extraction_rates.date >= 0.7 ? 'Good' : 'Acceptable'} |

## Priority Recommendations

${result.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

## Next Steps

${result.next_steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

## Configuration Details

- **Regions Tested:** ${result.config.regions.join(', ')}
- **Consent Handling:** ${result.config.enable_consent_handling ? 'Enabled' : 'Disabled'}
- **Rate Limiting:** ${result.config.enable_rate_limiting ? 'Enabled' : 'Disabled'}
- **Quality Threshold:** ${result.config.quality_threshold}
- **Browser Pool Size:** ${result.config.browser_pool_size}

---
*Generated by MCP Web Scraper System Validation Pipeline v3.6*
`;

        await fs.writeFile(outputPath, markdown, 'utf8');
    }

    /**
     * Generate metrics summary for monitoring
     */
    private async generateMetricsReport(result: SystemValidationResult, outputPath: string): Promise<void> {
        const metrics = {
            timestamp: result.start_time,
            execution_id: result.execution_id,
            duration_ms: result.total_duration_ms,

            success_metrics: {
                overall_success_rate: result.validation_summary.overall_success_rate,
                consent_handling_rate: result.validation_summary.consent_handling_rate,
                collection_success_rate: result.collection_summary.collection_success_rate
            },

            performance_metrics: {
                average_extraction_time_ms: result.validation_summary.average_extraction_time_ms,
                average_collection_time_ms: result.collection_summary.average_collection_time_ms,
                urls_per_second: result.validation_summary.total_urls_tested / (result.total_duration_ms / 1000)
            },

            quality_metrics: {
                average_quality_score: result.validation_summary.average_quality_score,
                field_extraction_rates: result.validation_summary.field_extraction_rates,
                quality_distribution: result.validation_summary.quality_distribution
            },

            volume_metrics: {
                domains_tested: result.validation_summary.domains_tested,
                urls_tested: result.validation_summary.total_urls_tested,
                urls_collected: result.collection_summary.total_urls_added,
                successful_extractions: result.validation_summary.successful_extractions
            },

            error_metrics: {
                error_distribution: result.validation_summary.error_analysis,
                failure_rate: 1 - result.validation_summary.overall_success_rate
            }
        };

        await fs.writeFile(outputPath, JSON.stringify(metrics, null, 2), 'utf8');
    }

    private analyzeCollectionByDomain(collectionResults: any[]): any {
        const domainAnalysis: Record<string, any> = {};

        collectionResults.forEach(result => {
            domainAnalysis[result.domain] = {
                urls_discovered: result.urls_discovered,
                urls_validated: result.urls_validated,
                urls_added: result.urls_added,
                success_rate: result.urls_added / Math.max(result.urls_discovered, 1),
                average_quality: result.average_quality_score,
                collection_time_ms: result.collection_time_ms,
                methods_used: result.discovery_methods_used,
                errors: result.errors.length
            };
        });

        return domainAnalysis;
    }

    private analyzeDiscoveryMethods(collectionResults: any[]): any {
        const methodStats: Record<string, { total: number; successful: number; urls_found: number }> = {};

        collectionResults.forEach(result => {
            result.discovery_methods_used.forEach((method: string) => {
                if (!methodStats[method]) {
                    methodStats[method] = {total: 0, successful: 0, urls_found: 0};
                }
                methodStats[method].total++;
                if (result.urls_added > 0) {
                    methodStats[method].successful++;
                    methodStats[method].urls_found += result.urls_added;
                }
            });
        });

        return methodStats;
    }

    private analyzeCollectionQuality(collectionResults: any[]): any {
        const allUrls = collectionResults.flatMap(r => r.collected_urls);

        return {
            total_urls: allUrls.length,
            average_quality: allUrls.reduce((sum, url) => sum + url.quality_score, 0) / Math.max(allUrls.length, 1),
            quality_ranges: {
                excellent: allUrls.filter(url => url.quality_score > 0.8).length,
                good: allUrls.filter(url => url.quality_score > 0.6 && url.quality_score <= 0.8).length,
                acceptable: allUrls.filter(url => url.quality_score > 0.4 && url.quality_score <= 0.6).length,
                poor: allUrls.filter(url => url.quality_score <= 0.4).length
            },
            frontpage_risk_analysis: {
                low_risk: allUrls.filter(url => url.frontpage_risk <= 0.3).length,
                medium_risk: allUrls.filter(url => url.frontpage_risk > 0.3 && url.frontpage_risk <= 0.6).length,
                high_risk: allUrls.filter(url => url.frontpage_risk > 0.6).length
            }
        };
    }

    private analyzeValidationByDomain(validationResults: any[]): any {
        const domainStats: Record<string, any> = {};

        validationResults.forEach(result => {
            if (!domainStats[result.domain]) {
                domainStats[result.domain] = {
                    total: 0,
                    successful: 0,
                    quality_scores: [],
                    extraction_times: [],
                    consent_handled: 0
                };
            }

            const stats = domainStats[result.domain];
            stats.total++;
            if (result.success) stats.successful++;
            if (result.consent_handled) stats.consent_handled++;
            stats.quality_scores.push(result.quality_score);
            stats.extraction_times.push(result.extraction_time_ms);
        });

        // Calculate averages
        Object.values(domainStats).forEach((stats: any) => {
            stats.success_rate = stats.successful / stats.total;
            stats.average_quality = stats.quality_scores.reduce((a: number, b: number) => a + b, 0) / stats.quality_scores.length;
            stats.average_time = stats.extraction_times.reduce((a: number, b: number) => a + b, 0) / stats.extraction_times.length;
            stats.consent_rate = stats.consent_handled / stats.total;
        });

        return domainStats;
    }

    private analyzeValidationByRegion(validationResults: any[]): any {
        const regionStats: Record<string, any> = {};

        validationResults.forEach(result => {
            if (!regionStats[result.region]) {
                regionStats[result.region] = {
                    total: 0,
                    successful: 0,
                    domains: new Set(),
                    quality_scores: [],
                    extraction_times: []
                };
            }

            const stats = regionStats[result.region];
            stats.total++;
            if (result.success) stats.successful++;
            stats.domains.add(result.domain);
            stats.quality_scores.push(result.quality_score);
            stats.extraction_times.push(result.extraction_time_ms);
        });

        // Calculate averages and convert Sets to counts
        Object.values(regionStats).forEach((stats: any) => {
            stats.success_rate = stats.successful / stats.total;
            stats.average_quality = stats.quality_scores.reduce((a: number, b: number) => a + b, 0) / stats.quality_scores.length;
            stats.average_time = stats.extraction_times.reduce((a: number, b: number) => a + b, 0) / stats.extraction_times.length;
            stats.domain_count = stats.domains.size;
            delete stats.domains; // Remove Set object for JSON serialization
        });

        return regionStats;
    }

    private identifyReadinessGaps(result: SystemValidationResult): string[] {
        const gaps: string[] = [];
        const validation = result.validation_summary;
        const readiness = result.production_readiness;

        if (validation.overall_success_rate < 0.7) {
            gaps.push(`Success rate is ${(validation.overall_success_rate * 100).toFixed(1)}% (target: 70%)`);
        }

        if (validation.consent_handling_rate < 0.8) {
            gaps.push(`Consent handling is ${(validation.consent_handling_rate * 100).toFixed(1)}% (target: 80%)`);
        }

        if (validation.average_extraction_time_ms > 5000) {
            gaps.push(`Average extraction time is ${validation.average_extraction_time_ms.toFixed(0)}ms (target: ≤5000ms)`);
        }

        if (readiness.dataset_completeness < 0.8) {
            gaps.push(`Dataset completeness is ${(readiness.dataset_completeness * 100).toFixed(1)}% (target: 80%)`);
        }

        return gaps;
    }
}