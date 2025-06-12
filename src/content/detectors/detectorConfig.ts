/**
 * Configuration constants for content detectors
 * Consolidates magic numbers and thresholds used across detector classes
 */

export const DETECTOR_CONFIG = {
    CACHE: {
        MAX_ENTRIES: 1000,
        MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours
        PATTERN_CACHE_SIZE: 500,
        OPTIMIZATION_CACHE_SIZE: 100
    },
    QUALITY_THRESHOLDS: {
        MIN_TITLE_LENGTH: 3,
        MIN_CONTENT_LENGTH: 50,
        MIN_WORD_COUNT: 20,
        MIN_QUALITY_SCORE: 0.3
    },
    CONFIDENCE_WEIGHTS: {
        BESPOKE_RULE: 0.95,
        STRUCTURED_DATA: 0.9,
        SEMANTIC_HTML: 0.8,
        OPENGRAPH: 0.85,
        UNIVERSAL_FALLBACK: 0.5
    },
    DETECTION_PATTERNS: {
        STRUCTURED_DATA_WEIGHT: 1.0,
        MICRODATA_WEIGHT: 0.95,
        OPENGRAPH_WEIGHT: 0.85,
        HTML5_ARTICLE_WEIGHT: 0.9,
        HTML5_MAIN_WEIGHT: 0.8,
        ARIA_ARTICLE_WEIGHT: 0.75
    },
    TIMEOUTS: {
        EXTRACTION_TIMEOUT: 30000,
        SELECTOR_TIMEOUT: 5000,
        PAGE_LOAD_TIMEOUT: 15000
    },
    FRONTPAGE_RISK: {
        WARN_THRESHOLD: 0.4,
        REJECT_THRESHOLD: 0.7
    }
} as const;

export type DetectorConfigType = typeof DETECTOR_CONFIG;