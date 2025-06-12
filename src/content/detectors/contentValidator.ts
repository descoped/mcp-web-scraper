/**
 * Content Validator - Consolidates complex validation logic
 * Replaces scattered validation conditions across detector classes
 */

import type {ExtractedContent} from '../rules/types';
import type {EnhancedContentQuality} from '../quality/enhancedQualityAnalyzer';
import {DETECTOR_CONFIG} from './detectorConfig';

export interface ValidationResult {
    isValid: boolean;
    score: number;
    issues: string[];
    warnings: string[];
}

export class ContentValidator {
    /**
     * Comprehensive content validation with detailed feedback
     */
    static validate(data: ExtractedContent, quality: EnhancedContentQuality): ValidationResult {
        const issues: string[] = [];
        const warnings: string[] = [];
        let score = 0;

        // Title validation
        const titleResult = this.validateTitle(data.title);
        score += titleResult.score;
        if (titleResult.issues.length > 0) issues.push(...titleResult.issues);
        if (titleResult.warnings.length > 0) warnings.push(...titleResult.warnings);

        // Content validation
        const contentResult = this.validateContent(data.content);
        score += contentResult.score;
        if (contentResult.issues.length > 0) issues.push(...contentResult.issues);
        if (contentResult.warnings.length > 0) warnings.push(...contentResult.warnings);

        // Quality validation
        const qualityResult = this.validateQuality(quality);
        score += qualityResult.score;
        if (qualityResult.issues.length > 0) issues.push(...qualityResult.issues);
        if (qualityResult.warnings.length > 0) warnings.push(...qualityResult.warnings);

        // Frontpage risk assessment
        const riskResult = this.validateRiskAssessment(quality);
        score += riskResult.score;
        if (riskResult.issues.length > 0) issues.push(...riskResult.issues);
        if (riskResult.warnings.length > 0) warnings.push(...riskResult.warnings);

        const isValid = issues.length === 0 && score >= DETECTOR_CONFIG.QUALITY_THRESHOLDS.MIN_QUALITY_SCORE;

        return {
            isValid,
            score: Math.min(score, 1.0),
            issues,
            warnings
        };
    }

    /**
     * Simple boolean validation for backward compatibility
     */
    static isExtractionSuccessful(data: ExtractedContent, quality: EnhancedContentQuality): boolean {
        return this.validate(data, quality).isValid;
    }

    private static validateTitle(title?: string): ValidationResult {
        const issues: string[] = [];
        const warnings: string[] = [];
        let score = 0;

        if (!title) {
            issues.push('Title is missing');
            return {isValid: false, score: 0, issues, warnings};
        }

        const trimmedTitle = title.trim();
        if (trimmedTitle.length === 0) {
            issues.push('Title is empty');
            return {isValid: false, score: 0, issues, warnings};
        }

        if (trimmedTitle.length < DETECTOR_CONFIG.QUALITY_THRESHOLDS.MIN_TITLE_LENGTH) {
            issues.push(`Title too short (${trimmedTitle.length} < ${DETECTOR_CONFIG.QUALITY_THRESHOLDS.MIN_TITLE_LENGTH})`);
            return {isValid: false, score: 0, issues, warnings};
        }

        // Score based on title quality
        score = 0.3;

        if (trimmedTitle.length > 10 && trimmedTitle.length < 200) {
            score += 0.1;
        }

        if (trimmedTitle.charAt(0) === trimmedTitle.charAt(0).toUpperCase()) {
            score += 0.05;
        }

        // Check for navigation/meta patterns
        if (/^(home|news|category|section)/i.test(trimmedTitle)) {
            warnings.push('Title may be navigation/category text');
            score -= 0.1;
        }

        if (trimmedTitle.includes('|') || trimmedTitle.includes('-')) {
            warnings.push('Title may include site name/navigation');
        }

        return {isValid: true, score: Math.max(score, 0), issues, warnings};
    }

    private static validateContent(content?: string): ValidationResult {
        const issues: string[] = [];
        const warnings: string[] = [];
        let score = 0;

        if (!content) {
            issues.push('Content is missing');
            return {isValid: false, score: 0, issues, warnings};
        }

        const trimmedContent = content.trim();
        if (trimmedContent.length === 0) {
            issues.push('Content is empty');
            return {isValid: false, score: 0, issues, warnings};
        }

        if (trimmedContent.length < DETECTOR_CONFIG.QUALITY_THRESHOLDS.MIN_CONTENT_LENGTH) {
            issues.push(`Content too short (${trimmedContent.length} < ${DETECTOR_CONFIG.QUALITY_THRESHOLDS.MIN_CONTENT_LENGTH})`);
            return {isValid: false, score: 0, issues, warnings};
        }

        // Score based on content quality
        score = 0.4;

        if (trimmedContent.length > 200) {
            score += 0.1;
        }

        // Check for paragraph structure
        const paragraphs = trimmedContent.split(/\n\s*\n/).length;
        if (paragraphs > 2) {
            score += 0.1;
        }

        // Check for sentence structure
        const sentences = trimmedContent.split(/[.!?]/).length;
        if (sentences > 5) {
            score += 0.1;
        }

        // Check for navigation text patterns
        if (/click here|read more|continue reading/i.test(trimmedContent)) {
            warnings.push('Content may contain navigation text');
            score -= 0.1;
        }

        return {isValid: true, score: Math.max(score, 0), issues, warnings};
    }

    private static validateQuality(quality: EnhancedContentQuality): ValidationResult {
        const issues: string[] = [];
        const warnings: string[] = [];
        let score = 0;

        // Word count validation
        if (quality.wordCount < DETECTOR_CONFIG.QUALITY_THRESHOLDS.MIN_WORD_COUNT) {
            issues.push(`Word count too low (${quality.wordCount} < ${DETECTOR_CONFIG.QUALITY_THRESHOLDS.MIN_WORD_COUNT})`);
            return {isValid: false, score: 0, issues, warnings};
        }

        // Quality score validation
        if (quality.score < DETECTOR_CONFIG.QUALITY_THRESHOLDS.MIN_QUALITY_SCORE) {
            issues.push(`Quality score too low (${quality.score.toFixed(2)} < ${DETECTOR_CONFIG.QUALITY_THRESHOLDS.MIN_QUALITY_SCORE})`);
            return {isValid: false, score: 0, issues, warnings};
        }

        score = Math.min(quality.score, 0.3);

        // Text density check (if available)
        if ('textDensity' in quality && (quality as any).textDensity < 0.25) {
            warnings.push('Low text density - page may have too much markup');
        }

        // Link density check (if available)
        if ('linkDensity' in quality && (quality as any).linkDensity > 0.3) {
            warnings.push('High link density - may be navigation page');
        }

        return {isValid: true, score, issues, warnings};
    }

    private static validateRiskAssessment(quality: EnhancedContentQuality): ValidationResult {
        const issues: string[] = [];
        const warnings: string[] = [];
        let score = 0;

        const riskScore = quality.frontpageRisk.riskScore;

        if (quality.frontpageRisk.recommendation === 'reject') {
            issues.push(`High frontpage risk detected (${riskScore.toFixed(2)} >= ${DETECTOR_CONFIG.FRONTPAGE_RISK.REJECT_THRESHOLD})`);
            return {isValid: false, score: 0, issues, warnings};
        }

        if (quality.frontpageRisk.recommendation === 'warn') {
            warnings.push(`Medium frontpage risk detected (${riskScore.toFixed(2)} >= ${DETECTOR_CONFIG.FRONTPAGE_RISK.WARN_THRESHOLD})`);
        }

        // Score based on inverse risk
        score = Math.max(0, 0.3 * (1 - riskScore));

        return {isValid: true, score, issues, warnings};
    }
}