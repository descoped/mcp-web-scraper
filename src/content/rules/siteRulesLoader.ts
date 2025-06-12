/**
 * Site-specific rules loader and manager
 * Loads YAML configuration and provides domain-based rule matching
 */

import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import {watch} from 'chokidar';
import {RuleMatchResult, SiteRule, SiteRulesConfig} from './types';

export class SiteRulesLoader {
    private rules: Map<string, SiteRule[]> = new Map();
    private allRules: SiteRule[] = [];
    private configPath: string;
    private watchMode: boolean;
    private config: SiteRulesConfig['config'];

    constructor(configPath = './config/site-rules.yaml', watchMode = false) {
        this.configPath = path.resolve(configPath);
        this.watchMode = watchMode;
        this.config = {
            enableRuleValidation: true,
            enableRuleCaching: true,
            hotReloadInDevelopment: false
        };
    }

    async loadRules(): Promise<void> {
        try {
            const yamlContent = fs.readFileSync(this.configPath, 'utf8');
            const configData = yaml.load(yamlContent) as SiteRulesConfig;

            if (!configData || !configData.rules) {
                throw new Error('Invalid YAML structure: missing rules array');
            }

            this.config = {...this.config, ...configData.config};
            this.processRules(configData.rules);

            if (this.watchMode && this.config.hotReloadInDevelopment) {
                this.setupFileWatcher();
            }

            console.log(`✅ Loaded ${configData.rules.length} site-specific rules from ${this.configPath}`);
        } catch (error) {
            console.warn(`⚠️  Failed to load site rules from ${this.configPath}:`, error);
            // Fall back to empty rules - universal detection will still work
            this.rules.clear();
            this.allRules = [];
        }
    }

    private processRules(rules: SiteRule[]): void {
        this.rules.clear();
        this.allRules = [];

        for (const rule of rules) {
            // Validate rule structure if enabled
            if (this.config.enableRuleValidation && !this.validateRule(rule)) {
                console.warn(`⚠️  Skipping invalid rule: ${rule.id}`);
                continue;
            }

            this.allRules.push(rule);

            // Group rules by domain for fast lookup
            for (const domain of rule.domains) {
                if (!this.rules.has(domain)) {
                    this.rules.set(domain, []);
                }
                this.rules.get(domain)!.push(rule);
            }
        }

        // Sort rules by priority within each domain (highest first)
        for (const [domain, domainRules] of this.rules) {
            domainRules.sort((a, b) => b.priority - a.priority);
        }
    }

    private validateRule(rule: SiteRule): boolean {
        // Basic validation
        if (!rule.id || !rule.name || !rule.domains || rule.domains.length === 0) {
            return false;
        }

        if (!rule.selectors || !rule.selectors.title || !rule.selectors.content) {
            return false;
        }

        if (typeof rule.priority !== 'number' || rule.priority < 0 || rule.priority > 1000) {
            return false;
        }

        return true;
    }

    private setupFileWatcher(): void {
        const watcher = watch(this.configPath);
        watcher.on('change', async () => {
            console.log('📝 Site rules configuration changed, reloading...');
            try {
                await this.loadRules();
                console.log('✅ Site rules reloaded successfully');
            } catch (error) {
                console.error('❌ Failed to reload site rules:', error);
            }
        });
    }

    private extractDomain(url: string): string {
        try {
            const parsedUrl = new URL(url);
            return parsedUrl.hostname.replace(/^www\./, '');
        } catch (error) {
            console.warn('Invalid URL provided:', url);
            return '';
        }
    }

    findRulesForDomain(domain: string): SiteRule[] {
        // Remove www. prefix for matching
        const cleanDomain = domain.replace(/^www\./, '');
        return this.rules.get(cleanDomain) || [];
    }

    findRulesForUrl(url: string): SiteRule[] {
        const domain = this.extractDomain(url);
        const domainRules = this.findRulesForDomain(domain);

        // Filter by URL patterns if specified
        return domainRules.filter(rule => {
            if (!rule.urlPatterns || rule.urlPatterns.length === 0) {
                return true; // No URL patterns means match all URLs for this domain
            }

            return rule.urlPatterns.some(pattern => {
                try {
                    return new RegExp(pattern).test(url);
                } catch (error) {
                    console.warn(`Invalid regex pattern in rule ${rule.id}: ${pattern}`);
                    return false;
                }
            });
        });
    }

    findBestRuleForUrl(url: string): RuleMatchResult | null {
        const rules = this.findRulesForUrl(url);

        if (rules.length === 0) {
            return null;
        }

        // Return the highest priority rule
        const bestRule = rules[0]; // Already sorted by priority

        return {
            rule: bestRule,
            matchScore: bestRule.priority / 100, // Convert to 0-1 scale
            matchReason: `Domain match for ${this.extractDomain(url)} with priority ${bestRule.priority}`
        };
    }

    getAllRules(): SiteRule[] {
        return [...this.allRules];
    }

    getRuleById(id: string): SiteRule | null {
        return this.allRules.find(rule => rule.id === id) || null;
    }

    getDomainCoverage(): Record<string, number> {
        const coverage: Record<string, number> = {};

        for (const [domain, rules] of this.rules) {
            coverage[domain] = rules.length;
        }

        return coverage;
    }

    getConfig(): SiteRulesConfig['config'] {
        return {...this.config};
    }

    /**
     * Test if a URL would match any configured rules
     */
    testUrlMatch(url: string): {
        hasMatch: boolean;
        matchedRules: SiteRule[];
        domain: string;
    } {
        const domain = this.extractDomain(url);
        const matchedRules = this.findRulesForUrl(url);

        return {
            hasMatch: matchedRules.length > 0,
            matchedRules,
            domain
        };
    }

    /**
     * Get statistics about loaded rules
     */
    getStats(): {
        totalRules: number;
        domainsWithRules: number;
        averageRulesPerDomain: number;
        priorityDistribution: Record<string, number>;
    } {
        const priorityDistribution: Record<string, number> = {};

        for (const rule of this.allRules) {
            const priorityRange = `${Math.floor(rule.priority / 10) * 10}-${Math.floor(rule.priority / 10) * 10 + 9}`;
            priorityDistribution[priorityRange] = (priorityDistribution[priorityRange] || 0) + 1;
        }

        return {
            totalRules: this.allRules.length,
            domainsWithRules: this.rules.size,
            averageRulesPerDomain: this.rules.size > 0 ? this.allRules.length / this.rules.size : 0,
            priorityDistribution
        };
    }
}