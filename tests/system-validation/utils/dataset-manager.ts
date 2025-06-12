/**
 * Phase 3.6 - Dataset Manager
 * Domain: YAML dataset management and updates
 */

import {promises as fs} from 'fs';
import yaml from 'js-yaml';
import type {
    CollectionResult,
    DatasetStatus,
    DomainTarget
} from '@tests/system-validation/types/system-validation-types.js';

export interface YAMLDataset {
    version: string;
    last_updated: string;
    domains: Array<{
        domain: string;
        region: string;
        language: string;
        outlet_type: string;
        country: string;
        has_bespoke_rule: boolean;
        rule_id?: string | null;
        priority?: number;
        existing_urls?: string[];
        articles?: Array<{
            url: string;
            title?: string;
            date_collected?: string;
            extraction_status?: string;
            category?: string;
            validation_result?: any;
        }>;
        collection_metadata?: {
            last_collection_date: string;
            urls_collected: number;
            collection_method: string[];
            average_quality: number;
        };
        validation_metadata?: {
            last_validation_date: string;
            success_rate: number;
            average_quality: number;
            consent_handling_rate: number;
        };
    }>;
    regions?: Record<string, {
        name: string;
        language: string[];
        domains: string[];
    }>;
}

export class DatasetManager {
    private datasetPath: string;
    private backupPath: string;

    constructor(datasetPath: string = './config/article-test-urls.yaml') {
        this.datasetPath = datasetPath;
        this.backupPath = this.datasetPath.replace('.yaml', '.backup.yaml');
    }

    /**
     * Load dataset from YAML file
     */
    async loadDataset(): Promise<YAMLDataset> {
        try {
            const content = await fs.readFile(this.datasetPath, 'utf8');
            const dataset = yaml.load(content) as YAMLDataset;

            if (!dataset || !dataset.domains) {
                throw new Error('Invalid dataset structure');
            }

            console.log(`📊 Loaded dataset with ${Object.keys(dataset.domains).length} domains`);
            return dataset;
        } catch (error) {
            console.error('Failed to load dataset:', error.message);
            throw new Error(`Could not load dataset from ${this.datasetPath}: ${error.message}`);
        }
    }

    /**
     * Save dataset to YAML file with backup
     */
    async saveDataset(dataset: YAMLDataset): Promise<void> {
        try {
            // Create backup of current file
            try {
                await fs.copyFile(this.datasetPath, this.backupPath);
            } catch (backupError) {
                console.warn('Could not create backup:', backupError.message);
            }

            // Update timestamp
            dataset.last_updated = new Date().toISOString();

            // Convert to YAML with proper formatting
            const yamlContent = yaml.dump(dataset, {
                indent: 2,
                lineWidth: 120,
                noRefs: true,
                sortKeys: true
            });

            // Write to file
            await fs.writeFile(this.datasetPath, yamlContent, 'utf8');
            console.log(`💾 Dataset saved to ${this.datasetPath}`);
        } catch (error) {
            console.error('Failed to save dataset:', error.message);
            throw new Error(`Could not save dataset to ${this.datasetPath}: ${error.message}`);
        }
    }

    /**
     * Convert dataset to domain targets for processing
     */
    datasetToDomainTargets(dataset: YAMLDataset, regions?: string[]): DomainTarget[] {
        if (!dataset) {
            throw new Error('Dataset is null or undefined');
        }

        if (!dataset.domains) {
            throw new Error('Dataset.domains is missing or null');
        }

        if (!Array.isArray(dataset.domains)) {
            throw new Error(`Dataset.domains must be an array, got ${typeof dataset.domains}`);
        }

        const domainTargets: DomainTarget[] = [];

        for (const domainData of dataset.domains) {
            // Validate required fields
            if (!domainData.domain) {
                console.warn('⚠️ Skipping domain entry with missing domain field');
                continue;
            }

            if (!domainData.region) {
                console.warn(`⚠️ Skipping domain ${domainData.domain} with missing region field`);
                continue;
            }

            // Filter by regions if specified
            if (regions && regions.length > 0 && !regions.includes(domainData.region)) {
                continue;
            }

            // Extract URLs from articles array if existing_urls is empty
            let urlsToUse = domainData.existing_urls || [];

            if (urlsToUse.length === 0 && domainData.articles && Array.isArray(domainData.articles)) {
                urlsToUse = domainData.articles
                    .filter(article => article.url) // Only articles with valid URLs
                    .map(article => article.url);

                console.log(`📝 Extracted ${urlsToUse.length} URLs from articles array for ${domainData.domain}`);
            }

            // Fail fast if no URLs available and log clear error
            if (urlsToUse.length === 0) {
                console.warn(`⚠️ Domain ${domainData.domain} has no URLs available (empty existing_urls and articles array)`);
                // Continue processing other domains rather than failing completely
            }

            domainTargets.push({
                domain: domainData.domain,
                region: domainData.region,
                language: domainData.language,
                outlet_type: domainData.outlet_type,
                has_bespoke_rule: domainData.has_bespoke_rule,
                priority: domainData.priority || 0,
                existing_urls: urlsToUse,
                collection_status: this.determineCollectionStatus(domainData),
                last_collection_date: domainData.collection_metadata?.last_collection_date,
                validation_status: this.determineValidationStatus(domainData),
                last_validation_date: domainData.validation_metadata?.last_validation_date
            });
        }

        if (domainTargets.length === 0) {
            throw new Error(`No valid domain targets found. Check dataset structure and region filter: ${regions?.join(', ')}`);
        }

        const sorted = domainTargets.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        console.log(`✅ Created ${sorted.length} domain targets from dataset`);

        return sorted;
    }

    /**
     * Update dataset with collection results
     */
    async updateDatasetWithCollectionResults(
        dataset: YAMLDataset,
        collectionResults: CollectionResult[]
    ): Promise<YAMLDataset> {
        const updatedDataset = {...dataset};

        for (const result of collectionResults) {
            const domainIndex = this.findDomainIndex(dataset, result.domain);
            if (domainIndex === -1) {
                console.warn(`Domain ${result.domain} not found in dataset`);
                continue;
            }

            const domainData = updatedDataset.domains[domainIndex];

            // Add new URLs to existing ones
            const existingUrls = domainData.existing_urls || [];
            const newUrls = result.collected_urls.map(cu => cu.url);
            const allUrls = Array.from(new Set([...existingUrls, ...newUrls]));

            domainData.existing_urls = allUrls;

            // Update collection metadata
            domainData.collection_metadata = {
                last_collection_date: new Date().toISOString(),
                urls_collected: result.urls_added,
                collection_method: result.discovery_methods_used,
                average_quality: result.average_quality_score
            };

            console.log(`📝 Updated ${result.domain}: +${result.urls_added} URLs (total: ${allUrls.length})`);
        }

        return updatedDataset;
    }

    /**
     * Get dataset status and completeness
     */
    async getDatasetStatus(): Promise<DatasetStatus> {
        try {
            const dataset = await this.loadDataset();

            const totalDomains = dataset.domains.length;
            const domainsWithUrls = dataset.domains
                .filter(d => (d.existing_urls && d.existing_urls.length > 0) ||
                    (d.articles && d.articles.length > 0)).length;

            const totalUrls = dataset.domains
                .reduce((sum, d) => {
                    const urlsFromExisting = d.existing_urls?.length || 0;
                    const urlsFromArticles = d.articles?.length || 0;
                    return sum + Math.max(urlsFromExisting, urlsFromArticles);
                }, 0);

            // Analyze by region
            const regionAnalysis: Record<string, { domains: number; urls: number; last_updated: string }> = {};

            // Group domains by region
            const domainsByRegion = dataset.domains.reduce((acc, domain) => {
                if (!acc[domain.region]) {
                    acc[domain.region] = [];
                }
                acc[domain.region].push(domain);
                return acc;
            }, {} as Record<string, typeof dataset.domains>);

            for (const [regionKey, regionDomains] of Object.entries(domainsByRegion)) {
                regionAnalysis[regionKey] = {
                    domains: regionDomains.length,
                    urls: regionDomains.reduce((sum, d) => {
                        const urlsFromExisting = d.existing_urls?.length || 0;
                        const urlsFromArticles = d.articles?.length || 0;
                        return sum + Math.max(urlsFromExisting, urlsFromArticles);
                    }, 0),
                    last_updated: this.getRegionLastUpdated(regionDomains)
                };
            }

            // Quality distribution (simplified - would need validation results for accurate analysis)
            const qualityDistribution = {
                excellent: 0,
                good: Math.floor(totalUrls * 0.7), // Estimate based on typical quality
                acceptable: Math.floor(totalUrls * 0.2),
                poor: Math.floor(totalUrls * 0.1)
            };

            // Completeness score (target: 5 URLs per domain)
            const targetUrls = totalDomains * 5;
            const completenessScore = Math.min(totalUrls / targetUrls, 1.0);

            return {
                total_domains: totalDomains,
                domains_with_urls: domainsWithUrls,
                total_urls: totalUrls,
                regions: regionAnalysis,
                completeness_score: completenessScore,
                quality_distribution: qualityDistribution
            };
        } catch (error) {
            console.error('Failed to get dataset status:', error.message);
            throw error;
        }
    }

    /**
     * Filter domains that need collection
     */
    getDomainsThatNeedCollection(
        domainTargets: DomainTarget[],
        minUrls: number = 3,
        maxAge: number = 7 // days
    ): DomainTarget[] {
        const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);

        return domainTargets.filter(domain => {
            // Not enough URLs
            if (!domain.existing_urls || domain.existing_urls.length < minUrls) {
                return true;
            }

            // No collection date or too old
            if (!domain.last_collection_date) {
                return true;
            }

            const lastCollection = new Date(domain.last_collection_date);
            return lastCollection < cutoffDate;
        });
    }

    /**
     * Export collection results to CSV
     */
    async exportCollectionResults(
        collectionResults: CollectionResult[],
        outputPath: string
    ): Promise<void> {
        const csvRows = ['Domain,Region,URLs Discovered,URLs Validated,URLs Added,Average Quality,Collection Time (ms),Methods Used,Errors'];

        for (const result of collectionResults) {
            const row = [
                result.domain,
                result.region,
                result.urls_discovered.toString(),
                result.urls_validated.toString(),
                result.urls_added.toString(),
                result.average_quality_score.toFixed(3),
                result.collection_time_ms.toString(),
                result.discovery_methods_used.join(';'),
                result.errors.join(';')
            ].map(field => `"${field.replace(/"/g, '""')}"`).join(',');

            csvRows.push(row);
        }

        await fs.writeFile(outputPath, csvRows.join('\n'), 'utf8');
        console.log(`📊 Collection results exported to ${outputPath}`);
    }

    /**
     * Export detailed URL collection to CSV
     */
    async exportCollectedUrls(
        collectionResults: CollectionResult[],
        outputPath: string
    ): Promise<void> {
        const csvRows = ['URL,Domain,Region,Title,Discovered Via,Quality Score,Frontpage Risk,Valid,Collection Timestamp'];

        for (const result of collectionResults) {
            for (const url of result.collected_urls) {
                const row = [
                    url.url,
                    url.domain,
                    result.region,
                    url.title || '',
                    url.discovered_via,
                    url.quality_score.toFixed(3),
                    url.frontpage_risk.toFixed(3),
                    url.is_valid.toString(),
                    url.collection_timestamp
                ].map(field => `"${field.replace(/"/g, '""')}"`).join(',');

                csvRows.push(row);
            }
        }

        await fs.writeFile(outputPath, csvRows.join('\n'), 'utf8');
        console.log(`📊 Collected URLs exported to ${outputPath}`);
    }

    private determineCollectionStatus(domainData: any): 'pending' | 'in_progress' | 'completed' | 'failed' {
        if (!domainData.existing_urls || domainData.existing_urls.length === 0) {
            return 'pending';
        }

        if (domainData.existing_urls.length >= 5) {
            return 'completed';
        }

        return 'in_progress';
    }

    private determineValidationStatus(domainData: any): 'pending' | 'in_progress' | 'completed' | 'failed' {
        if (!domainData.validation_metadata) {
            return 'pending';
        }

        const lastValidation = new Date(domainData.validation_metadata.last_validation_date);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        if (lastValidation > weekAgo) {
            return 'completed';
        }

        return 'pending';
    }

    private findDomainIndex(dataset: YAMLDataset, domain: string): number {
        return dataset.domains.findIndex(d => d.domain === domain);
    }

    private findDomainKey(dataset: YAMLDataset, domain: string): string | null {
        // Legacy method - keeping for backwards compatibility
        const index = this.findDomainIndex(dataset, domain);
        return index >= 0 ? index.toString() : null;
    }

    private getRegionLastUpdated(regionDomains: any[]): string {
        const dates = regionDomains
            .map(d => d.collection_metadata?.last_collection_date)
            .filter(date => date)
            .map(date => new Date(date))
            .sort((a, b) => b.getTime() - a.getTime());

        return dates.length > 0 ? dates[0].toISOString() : 'never';
    }
}