/**
 * Unit tests for ConsentHandler - using relative imports
 */

import {beforeEach, describe, expect, it} from 'vitest';

// Using relative path instead of alias
import {ConsentHandler} from '../../../src/core/consentHandler.js';

describe('ConsentHandler', () => {
    let consentHandler: ConsentHandler;

    beforeEach(() => {
        consentHandler = new ConsentHandler();
    });

    describe('getPatterns', () => {
        it('should return consent patterns', () => {
            const patterns = consentHandler.getPatterns();

            expect(patterns).toBeDefined();
            expect(patterns.textPatterns).toBeDefined();
            expect(patterns.attributes).toBeDefined();
            expect(patterns.frameworks).toBeDefined();
        });

        it('should include Norwegian patterns', () => {
            const patterns = consentHandler.getPatterns();

            expect(patterns.textPatterns.some(pattern =>
                pattern.toLowerCase().includes('godta alle')
            )).toBe(true);
        });

        it('should include English patterns', () => {
            const patterns = consentHandler.getPatterns();

            expect(patterns.textPatterns.some(pattern =>
                pattern.toLowerCase().includes('accept all')
            )).toBe(true);
        });

        it('should include German patterns', () => {
            const patterns = consentHandler.getPatterns();

            expect(patterns.textPatterns.some(pattern =>
                pattern.toLowerCase().includes('alle akzeptieren')
            )).toBe(true);
        });

        it('should include framework selectors', () => {
            const patterns = consentHandler.getPatterns();

            // OneTrust
            expect(patterns.frameworks.some(framework =>
                framework.includes('onetrust-accept')
            )).toBe(true);

            // Quantcast (using actual pattern from code)
            expect(patterns.frameworks.some(framework =>
                framework.includes('qc-cmp-button')
            )).toBe(true);
        });

        it('should include attribute patterns', () => {
            const patterns = consentHandler.getPatterns();

            expect(patterns.attributes.some(attr =>
                attr.includes('data-consent')
            )).toBe(true);

            expect(patterns.attributes.some(attr =>
                attr.includes('aria-label*="accept"')
            )).toBe(true);
        });
    });

    describe('pattern validation', () => {
        it('should have comprehensive European language coverage', () => {
            const patterns = consentHandler.getPatterns();
            const textPatterns = patterns.textPatterns.map(p => p.toLowerCase());

            // Test coverage for major European languages (using actual patterns from code)
            const languages = [
                {lang: 'Norwegian', pattern: 'godta alle'},
                {lang: 'English', pattern: 'accept all'},
                {lang: 'German', pattern: 'alle akzeptieren'},
                {lang: 'French', pattern: 'accepter'},
                {lang: 'Spanish', pattern: 'aceptar todo'},
                {lang: 'Italian', pattern: 'accetta tutto'}
            ];

            languages.forEach(({lang, pattern}) => {
                expect(
                    textPatterns.some(p => p.includes(pattern)),
                    `Missing ${lang} pattern: ${pattern}`
                ).toBe(true);
            });
        });

        it('should have major CMP framework coverage', () => {
            const patterns = consentHandler.getPatterns();

            const frameworks = [
                'onetrust',
                'qc-cmp',
                'didomi',
                'moove-gdpr'
            ];

            frameworks.forEach(framework => {
                expect(
                    patterns.frameworks.some(f => f.toLowerCase().includes(framework)),
                    `Missing framework: ${framework}`
                ).toBe(true);
            });
        });
    });
});