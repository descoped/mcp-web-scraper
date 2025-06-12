/**
 * Types for site-specific rule system
 * Part of v1.0.1 bespoke rule implementation
 */

export interface SiteRule {
    id: string;
    name: string;
    description?: string;
    domains: string[];
    urlPatterns?: string[];
    priority: number;
    selectors: RuleSelectors;
    exclusions?: string[];
    contentProcessing?: ContentProcessingRule[];
    segments?: SegmentRule[];
    metadata?: RuleMetadata;
}

export interface RuleSelectors {
    container?: string[];
    title: string[];
    content: string[];
    author?: string[];
    date?: string[];
    summary?: string[];
}

export interface ContentProcessingRule {
    type: 'removePhrase' | 'removeElement' | 'replaceText' | 'normalizeWhitespace' | 'preserveCodeBlocks' | 'normalizeDate' | 'preserveElement' | 'handlePaywall';
    pattern?: string;
    scope?: 'content' | 'title' | 'author' | 'date' | 'all';
    selector?: string;
    keepText?: boolean;
    find?: string;
    replace?: string;
    format?: string;
    extractAs?: string;
    strategy?: string;
}

export interface SegmentRule {
    name: string;
    selector: string;
    type: 'summary' | 'content' | 'supplementary' | 'related';
    priority?: number;
    extractAs?: string;
}

export interface RuleMetadata {
    language?: string;
    charset?: string;
    category?: string;
    paywall?: boolean;
    subscription?: string;
    source?: string;
    lastUpdated?: string;
    region?: string;
    platform?: string;
    mlConfidence?: number;
    fallback?: boolean;
    optimized?: boolean;
    version?: string;
    generated?: boolean;
}

export interface SiteRulesConfig {
    version: string;
    description: string;
    config: {
        enableRuleValidation: boolean;
        enableRuleCaching: boolean;
        hotReloadInDevelopment: boolean;
        defaultTimeout?: number;
    };
    rules: SiteRule[];
    testTargets?: Record<string, {
        successRate: number;
        sites?: string[];
        totalUrls?: number;
    }>;
}

export interface RuleMatchResult {
    rule: SiteRule;
    matchScore: number;
    matchReason: string;
}

export interface ExtractedContent {
    title?: string;
    content?: string;
    author?: string;
    date?: string;
    summary?: string;
    segments?: Record<string, any>;
    metadata?: {
        rule_used: string;
        extraction_method: string;
        confidence: number;
        processing_applied: string[];
    };
}

export interface ExtractionMetadata {
    selectors_used: Record<string, string>;
    extraction_time: number;
    content_quality: any;
    rule_id?: string | null;
    rule_name?: string | null;
    rule_domain_match?: boolean;
    cache_hit?: boolean;
    cache_key?: string | null;
    retry_count?: number;
    mlAnalysis?: any;
}