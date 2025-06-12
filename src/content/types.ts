/**
 * Content extraction types for enhanced article detection
 * Part of v1.0.1 enhanced content extraction system
 */

export interface DetectionPattern {
    name: string;
    tier: DetectionTier;
    selectors: string[];
    weight: number;
    description?: string;
}

export enum DetectionTier {
    UNIVERSAL = 1,    // >80% accuracy: structured data, semantic HTML5
    PATTERNS = 2,     // >70% accuracy: class-based, content structure
    FALLBACK = 3      // >60% accuracy: heuristics, text density
}

export interface ContentSelectors {
    container?: DetectionPattern[];
    title: DetectionPattern[];
    content: DetectionPattern[];
    author?: DetectionPattern[];
    date?: DetectionPattern[];
    summary?: DetectionPattern[];
}

export interface ExtractionResult {
    success: boolean;
    confidence: number;
    method: string;
    data: {
        title?: string;
        content?: string;
        author?: string;
        date?: string;
        summary?: string;
    };
    metadata: {
        selectors_used: Record<string, string>;
        extraction_time: number;
        content_quality: ContentQuality;
        // Phase 4A.1: Enhanced metadata for analytics
        rule_id?: string | null;
        rule_name?: string | null;
        rule_domain_match?: boolean;
        cache_hit?: boolean;
        cache_key?: string | null;
        retry_count?: number;
    };
}

export interface ContentQuality {
    contentLength: number;      // Character count
    wordCount: number;          // Word count
    paragraphCount: number;     // Number of paragraphs
    textDensity: number;        // Text/HTML ratio
    linkDensity: number;        // Links/text ratio
    metadataComplete: boolean;  // Has title + (author OR date)
    cleanContent: boolean;      // No ads/navigation detected
    score: number;              // Overall quality score 0-1
}

export interface SelectorScore {
    selector: string;
    element_exists: boolean;
    content_relevance: number;  // 0-1
    position_score: number;     // 0-1
    semantic_score: number;     // 0-1
    consistency_score: number;  // 0-1
    total_score: number;        // Weighted total
}

export interface DetectionContext {
    url: string;
    doctype?: string;
    hasStructuredData: boolean;
    isHtml5: boolean;
    language?: string;
    charset?: string;
}