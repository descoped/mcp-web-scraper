/**
 * Phase 4C.1 - International Rules Loader
 * Loads and manages extraction rules for international news sites and content platforms
 */

import {promises as fs} from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {fileURLToPath} from 'url';
import type {SiteRule} from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface InternationalSiteRule extends SiteRule {
    region?: string;
    platform?: string;
    quality_indicators?: {
        required_fields: string[];
        minimum_content_length: number;
        article_indicators?: string[];
    };
}

export interface RegionalConfig {
    timeout_multiplier: number;
    consent_handling: 'strict' | 'standard' | 'adaptive';
    languages: string[];
}

export interface InternationalRulesConfig {
    version: string;
    description: string;
    last_updated: string;
    international_sites: InternationalSiteRule[];
    content_platforms: InternationalSiteRule[];
    regional_configs: Record<string, RegionalConfig>;
    quality_thresholds: Record<string, number>;
    performance_targets: Record<string, number>;
}

export class InternationalRulesLoader {
    private rules: InternationalSiteRule[] = [];
    private regionalConfigs: Record<string, RegionalConfig> = {};
    private qualityThresholds: Record<string, number> = {};
    private performanceTargets: Record<string, number> = {};
    private isInitialized = false;

    /**
     * Initialize the international rules loader
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            await this.loadInternationalRules();
            this.isInitialized = true;
            console.log(`🌍 International Rules Loader initialized with ${this.rules.length} rules`);
        } catch (error) {
            console.error('Failed to initialize International Rules Loader:', error);
            throw error;
        }
    }

    /**
     * Load international site rules from YAML configuration
     */
    private async loadInternationalRules(): Promise<void> {
        const configPath = path.join(__dirname, '../../../config/international-site-rules.yaml');

        try {
            const yamlContent = await fs.readFile(configPath, 'utf8');
            const config = yaml.load(yamlContent) as InternationalRulesConfig;

            // Combine international sites and content platforms
            this.rules = [
                ...config.international_sites,
                ...config.content_platforms
            ];

            this.regionalConfigs = config.regional_configs;
            this.qualityThresholds = config.quality_thresholds;
            this.performanceTargets = config.performance_targets;

            console.log(`📊 Loaded ${config.international_sites.length} international news sites`);
            console.log(`🎯 Loaded ${config.content_platforms.length} content platform rules`);
            console.log(`🌐 Loaded ${Object.keys(this.regionalConfigs).length} regional configurations`);

        } catch (error) {
            console.error('Error loading international rules:', error);
            // Initialize with empty rules to prevent startup failures
            this.rules = [];
            this.regionalConfigs = {};
            this.qualityThresholds = {};
            this.performanceTargets = {};
        }
    }

    /**
     * Get all international rules
     */
    getAllRules(): InternationalSiteRule[] {
        return [...this.rules];
    }

    /**
     * Get rules for a specific domain
     */
    getRulesForDomain(domain: string): InternationalSiteRule[] {
        return this.rules.filter(rule =>
            rule.domains.some(ruleDomain =>
                domain.includes(ruleDomain) || ruleDomain.includes(domain)
            )
        ).sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }

    /**
     * Get rules by region
     */
    getRulesByRegion(region: string): InternationalSiteRule[] {
        return this.rules.filter(rule =>
            rule.metadata?.region === region || rule.region === region
        );
    }

    /**
     * Get rules by platform type
     */
    getRulesByPlatform(platform: string): InternationalSiteRule[] {
        return this.rules.filter(rule =>
            rule.metadata?.platform === platform || rule.platform === platform
        );
    }

    /**
     * Get news site rules (excludes content platforms)
     */
    getNewsSiteRules(): InternationalSiteRule[] {
        return this.rules.filter(rule =>
            rule.metadata?.category === 'news' && !rule.platform
        );
    }

    /**
     * Get content platform rules
     */
    getContentPlatformRules(): InternationalSiteRule[] {
        return this.rules.filter(rule =>
            rule.platform || rule.metadata?.platform
        );
    }

    /**
     * Get regional configuration
     */
    getRegionalConfig(region: string): RegionalConfig | null {
        return this.regionalConfigs[region] || null;
    }

    /**
     * Get quality threshold by level
     */
    getQualityThreshold(level: string): number {
        return this.qualityThresholds[level] || 0.5;
    }

    /**
     * Get performance target by metric
     */
    getPerformanceTarget(metric: string): number {
        return this.performanceTargets[metric] || 0;
    }

    /**
     * Check if domain is supported
     */
    isDomainSupported(domain: string): boolean {
        return this.getRulesForDomain(domain).length > 0;
    }

    /**
     * Get supported domains list
     */
    getSupportedDomains(): string[] {
        const domains = new Set<string>();
        this.rules.forEach(rule => {
            rule.domains.forEach(domain => domains.add(domain));
        });
        return Array.from(domains).sort();
    }

    /**
     * Get international rule by ID
     */
    getRuleById(id: string): InternationalSiteRule | null {
        return this.rules.find(rule => rule.id === id) || null;
    }

    /**
     * Get statistics about loaded rules
     */
    getStatistics(): {
        totalRules: number;
        newsSites: number;
        contentPlatforms: number;
        supportedDomains: number;
        regions: string[];
        platforms: string[];
    } {
        const newsSites = this.getNewsSiteRules();
        const contentPlatforms = this.getContentPlatformRules();
        const regions = new Set<string>();
        const platforms = new Set<string>();

        this.rules.forEach(rule => {
            if (rule.metadata?.region) regions.add(rule.metadata.region);
            if (rule.region) regions.add(rule.region);
            if (rule.metadata?.platform) platforms.add(rule.metadata.platform);
            if (rule.platform) platforms.add(rule.platform);
        });

        return {
            totalRules: this.rules.length,
            newsSites: newsSites.length,
            contentPlatforms: contentPlatforms.length,
            supportedDomains: this.getSupportedDomains().length,
            regions: Array.from(regions).sort(),
            platforms: Array.from(platforms).sort()
        };
    }

    /**
     * Validate rule configuration
     */
    validateRule(rule: InternationalSiteRule): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields validation
        if (!rule.id) errors.push('Rule ID is required');
        if (!rule.name) errors.push('Rule name is required');
        if (!rule.domains || rule.domains.length === 0) {
            errors.push('At least one domain is required');
        }
        if (!rule.selectors) errors.push('Selectors are required');

        // Selector validation
        if (rule.selectors) {
            if (!rule.selectors.title) warnings.push('Title selector missing');
            if (!rule.selectors.content) errors.push('Content selector is required');
        }

        // Quality indicators validation
        if (rule.quality_indicators) {
            if (!rule.quality_indicators.required_fields || rule.quality_indicators.required_fields.length === 0) {
                warnings.push('Quality indicators should specify required fields');
            }
            if (!rule.quality_indicators.minimum_content_length || rule.quality_indicators.minimum_content_length < 50) {
                warnings.push('Minimum content length should be at least 50 characters');
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get rules needing attention (missing quality indicators, outdated, etc.)
     */
    getRulesNeedingAttention(): Array<{
        rule: InternationalSiteRule;
        issues: string[];
    }> {
        const rulesNeedingAttention: Array<{ rule: InternationalSiteRule; issues: string[]; }> = [];

        this.rules.forEach(rule => {
            const issues: string[] = [];
            const validation = this.validateRule(rule);

            // Add validation warnings as issues
            issues.push(...validation.warnings);

            // Check for missing quality indicators
            if (!rule.quality_indicators) {
                issues.push('Missing quality indicators');
            }

            // Check for old metadata
            if (rule.metadata?.lastUpdated) {
                const lastUpdated = new Date(rule.metadata.lastUpdated);
                const sixMonthsAgo = new Date();
                sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

                if (lastUpdated < sixMonthsAgo) {
                    issues.push('Rule not updated in 6+ months');
                }
            } else {
                issues.push('Missing lastUpdated metadata');
            }

            if (issues.length > 0) {
                rulesNeedingAttention.push({rule, issues});
            }
        });

        return rulesNeedingAttention;
    }

    /**
     * Export rules to different formats for external tools
     */
    exportRules(format: 'json' | 'yaml' = 'json'): string {
        const exportData = {
            version: '1.0.0',
            timestamp: new Date().toISOString(),
            statistics: this.getStatistics(),
            rules: this.rules,
            regional_configs: this.regionalConfigs,
            quality_thresholds: this.qualityThresholds,
            performance_targets: this.performanceTargets
        };

        if (format === 'yaml') {
            return yaml.dump(exportData, {
                indent: 2,
                lineWidth: 120,
                noRefs: true
            });
        }

        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Force reload rules from file (for hot reloading)
     */
    async reloadRules(): Promise<void> {
        this.isInitialized = false;
        this.rules = [];
        this.regionalConfigs = {};
        this.qualityThresholds = {};
        this.performanceTargets = {};

        await this.initialize();
        console.log('🔄 International rules reloaded successfully');
    }
}

// Singleton instance
export const internationalRulesLoader = new InternationalRulesLoader();