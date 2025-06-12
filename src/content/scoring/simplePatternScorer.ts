/**
 * Simplified pattern scorer for initial implementation
 * Focuses on basic selector evaluation without complex scoring functions
 */

import {Page} from 'playwright';
import {DetectionPattern, SelectorScore} from '@/content/types.js';

export class SimplePatternScorer {
    private readonly WEIGHTS = {
        ELEMENT_EXISTS: 0.4,
        CONTENT_LENGTH: 0.3,
        SEMANTIC_VALUE: 0.2,
        POSITION: 0.1
    };

    async scoreSelector(page: Page, selector: string, fieldType: 'title' | 'content' | 'author' | 'date' | 'summary'): Promise<SelectorScore> {
        const score: SelectorScore = {
            selector,
            element_exists: false,
            content_relevance: 0,
            position_score: 0,
            semantic_score: 0,
            consistency_score: 0,
            total_score: 0
        };

        try {
            // Check if element exists and get basic properties
            const elementData = await page.evaluate(({sel, type}: { sel: string; type: string }) => {
                const elements = document.querySelectorAll(sel);
                if (elements.length === 0) return null;

                const element = elements[0];
                const text = element.textContent?.trim() || '';
                const tagName = element.tagName.toLowerCase();
                const hasSemanticValue = ['h1', 'h2', 'h3', 'article', 'main', 'time', 'address'].includes(tagName);

                // Basic content relevance scoring
                let contentRelevance = 0;
                if (text.length > 0) {
                    switch (type) {
                        case 'title':
                            contentRelevance = text.length > 10 && text.length < 200 ? 0.8 : 0.3;
                            break;
                        case 'content':
                            contentRelevance = text.length > 100 ? 0.8 : text.length > 20 ? 0.4 : 0.1;
                            break;
                        case 'author':
                            contentRelevance = text.length > 2 && text.length < 100 ? 0.7 : 0.2;
                            break;
                        case 'date':
                            contentRelevance = /\d{4}|\d{1,2}[./]\d{1,2}/.test(text) ? 0.8 : 0.2;
                            break;
                        case 'summary':
                            contentRelevance = text.length > 50 && text.length < 500 ? 0.7 : 0.3;
                            break;
                    }
                }

                // Semantic scoring based on tag and attributes
                let semanticScore = hasSemanticValue ? 0.8 : 0.3;
                if (element.hasAttribute('itemprop')) semanticScore += 0.2;
                if (element.className.includes(type)) semanticScore += 0.1;

                // Position scoring - prefer elements higher in DOM
                const rect = element.getBoundingClientRect();
                const positionScore = Math.max(0, 1 - (rect.top / window.innerHeight));

                return {
                    textLength: text.length,
                    contentRelevance: Math.min(contentRelevance, 1),
                    semanticScore: Math.min(semanticScore, 1),
                    positionScore: Math.min(positionScore, 1)
                };
            }, {sel: selector, type: fieldType});

            if (elementData) {
                score.element_exists = true;
                score.content_relevance = elementData.contentRelevance;
                score.semantic_score = elementData.semanticScore;
                score.position_score = elementData.positionScore;
                score.consistency_score = 0.5; // Default consistency score

                // Calculate weighted total score
                score.total_score =
                    this.WEIGHTS.ELEMENT_EXISTS +
                    (score.content_relevance * this.WEIGHTS.CONTENT_LENGTH) +
                    (score.semantic_score * this.WEIGHTS.SEMANTIC_VALUE) +
                    (score.position_score * this.WEIGHTS.POSITION);
            }

        } catch (error) {
            console.warn(`Error scoring selector "${selector}":`, error);
        }

        return score;
    }

    async scorePatterns(page: Page, patterns: DetectionPattern[], fieldType: 'title' | 'content' | 'author' | 'date' | 'summary'): Promise<SelectorScore[]> {
        const scores: SelectorScore[] = [];

        for (const pattern of patterns) {
            for (const selector of pattern.selectors) {
                const score = await this.scoreSelector(page, selector, fieldType);
                // Apply pattern weight bonus
                score.total_score *= pattern.weight;
                scores.push(score);
            }
        }

        // Sort by total score (highest first)
        return scores.sort((a, b) => b.total_score - a.total_score);
    }

    async findBestSelector(page: Page, patterns: DetectionPattern[], fieldType: 'title' | 'content' | 'author' | 'date' | 'summary'): Promise<string | null> {
        const scores = await this.scorePatterns(page, patterns, fieldType);
        const bestScore = scores.find(s => s.element_exists && s.total_score > 0.3);
        return bestScore?.selector || null;
    }
}