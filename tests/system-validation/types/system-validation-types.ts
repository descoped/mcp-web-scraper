/**
 * Phase 3.6 - System Validation Pipeline Types
 * Domain-specific types for data collection and production validation
 */

export interface SystemValidationConfig {
    regions: string[];
    max_domains_per_region?: number;
    max_articles_per_domain?: number;
    enable_consent_handling: boolean;
    enable_rate_limiting: boolean;
    quality_threshold: number;
    timeout_per_url: number;
    batch_size: number;
    browser_pool_size: number;
    output_directory: string;
    dataset_file: string;
    verbose?: boolean;
}

export interface CollectionConfig {
    discovery_strategies: ('homepage' | 'rss' | 'sitemap' | 'navigation')[];
    validate_during_collection: boolean;
    min_content_quality: number;
    max_collection_time_per_domain: number;
    frontpage_risk_threshold: number;
}

export interface ValidationConfig {
    consent_languages: string[];
    rate_limit_delay: number;
    retry_attempts: number;
    quality_assessment: boolean;
    performance_benchmarking: boolean;
}

export interface DomainTarget {
    domain: string;
    region: string;
    language: string;
    outlet_type: string;
    has_bespoke_rule: boolean;
    priority: number;
    existing_urls?: string[];
    collection_status?: 'pending' | 'in_progress' | 'completed' | 'failed';
    last_collection_date?: string;
    validation_status?: 'pending' | 'in_progress' | 'completed' | 'failed';
    last_validation_date?: string;
}

export interface CollectedUrl {
    url: string;
    domain: string;
    title?: string;
    discovered_via: string;
    collection_timestamp: string;
    quality_score: number;
    frontpage_risk: number;
    is_valid: boolean;
    validation_error?: string;
}

export interface CollectionResult {
    domain: string;
    region: string;
    urls_discovered: number;
    urls_validated: number;
    urls_added: number;
    discovery_methods_used: string[];
    collection_time_ms: number;
    average_quality_score: number;
    collected_urls: CollectedUrl[];
    errors: string[];
}

export interface ValidationResult {
    url: string;
    domain: string;
    region: string;
    success: boolean;
    quality_score: number;
    extraction_time_ms: number;
    consent_handled: boolean;
    consent_time_ms: number;
    method_used: string;
    fields_extracted: {
        title: boolean;
        content: boolean;
        author: boolean;
        date: boolean;
        summary: boolean;
    };
    error_message?: string;
    retry_count: number;
}

export interface SystemValidationResult {
    execution_id: string;
    start_time: string;
    end_time: string;
    total_duration_ms: number;
    config: SystemValidationConfig;

    // Collection Results
    collection_summary: {
        domains_processed: number;
        total_urls_discovered: number;
        total_urls_validated: number;
        total_urls_added: number;
        collection_success_rate: number;
        average_collection_time_ms: number;
    };
    collection_results: CollectionResult[];

    // Validation Results
    validation_summary: {
        domains_tested: number;
        total_urls_tested: number;
        successful_extractions: number;
        overall_success_rate: number;
        consent_handling_rate: number;
        average_quality_score: number;
        average_extraction_time_ms: number;
    };
    validation_results: ValidationResult[];

    // Combined Analysis
    production_readiness: {
        phase4_ready: boolean;
        dataset_completeness: number;
        extraction_reliability: number;
        consent_coverage: number;
        performance_rating: 'excellent' | 'good' | 'acceptable' | 'needs_improvement';
    };

    recommendations: string[];
    next_steps: string[];
}

export interface SystemValidationProgress {
    stage: 'initializing' | 'collecting' | 'validating' | 'analyzing' | 'completed';
    current_domain?: string;
    domains_completed: number;
    total_domains: number;
    urls_processed: number;
    current_success_rate: number;
    estimated_completion_time?: string;
}

export interface DatasetStatus {
    total_domains: number;
    domains_with_urls: number;
    total_urls: number;
    regions: Record<string, {
        domains: number;
        urls: number;
        last_updated: string;
    }>;
    completeness_score: number;
    quality_distribution: {
        excellent: number;
        good: number;
        acceptable: number;
        poor: number;
    };
}

export interface MCPValidationMetrics {
    tool_performance: {
        scrape_article_content: {
            success_rate: number;
            average_time_ms: number;
            error_distribution: Record<string, number>;
        };
        navigate_tool: {
            success_rate: number;
            average_time_ms: number;
            error_distribution: Record<string, number>;
        };
        consent_handling: {
            detection_rate: number;
            success_rate: number;
            average_time_ms: number;
            languages_covered: string[];
        };
    };
    rate_limiting_effectiveness: {
        requests_throttled: number;
        average_delay_ms: number;
        no_blocks_detected: boolean;
    };
    session_management: {
        sessions_created: number;
        sessions_reused: number;
        cleanup_success_rate: number;
    };
}