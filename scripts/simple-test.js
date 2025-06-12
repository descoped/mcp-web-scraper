#!/usr/bin/env node

/**
 * Simple compiled test script for HybridDetector with Norwegian MSN URL
 * Takes screenshots before and after extraction, saves results
 */

import {chromium} from 'playwright';
import {HybridDetector} from './dist/content/detectors/hybridDetector.js';
import {ConsentHandler} from './dist/core/consentHandler.js';
import * as path from 'path';
import * as fs from 'fs/promises';

// Test URL
const TEST_URL = 'https://www.msn.com/nb-no/nyheter/other/magnus-carlsen-spurt-om-han-er-keen-p%C3%A5-%C3%A5-vinne-ikke-veldig/ar-AA1G0EV7';
const OUTPUT_DIR = './output/scraping/screenshot';

async function ensureOutputDirectory() {
    try {
        await fs.access(OUTPUT_DIR);
    } catch {
        await fs.mkdir(OUTPUT_DIR, {recursive: true});
        console.log(`📁 Created output directory: ${OUTPUT_DIR}`);
    }
}

async function saveScreenshot(page, filename) {
    const screenshotPath = path.join(OUTPUT_DIR, filename);
    const screenshot = await page.screenshot({
        fullPage: true,
        type: 'png'
    });

    await fs.writeFile(screenshotPath, screenshot);
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    return screenshotPath;
}

async function main() {
    console.log('🚀 Starting HybridDetector test...');
    console.log(`📄 Target URL: ${TEST_URL}`);

    // Ensure output directory exists
    await ensureOutputDirectory();

    let browser = null;
    let context = null;
    let page = null;

    try {
        // Initialize HybridDetector
        console.log('🔧 Initializing HybridDetector...');
        const hybridDetector = new HybridDetector('./config/site-rules.yaml');
        await hybridDetector.initialize();

        console.log('📊 Rule system info:');
        const rulesInfo = hybridDetector.getRulesInfo();
        console.log(`  Total rules: ${rulesInfo.totalRules}`);
        console.log(`  Domains with rules: ${rulesInfo.domainsWithRules}`);

        // Test URL matching
        const urlMatch = hybridDetector.testUrlMatch(TEST_URL);
        console.log(`🎯 URL match result:`, urlMatch.hasMatch ? `Found rule: ${urlMatch.rule.name}` : 'No matching rule');

        // Launch browser
        console.log('🌐 Launching browser...');
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu'
            ]
        });

        context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: {width: 1280, height: 720}
        });

        page = await context.newPage();

        // Navigate to the page
        console.log('📂 Navigating to page...');
        await page.goto(TEST_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
        });

        // Wait for page to settle
        await page.waitForTimeout(2000);

        // Take screenshot before extraction
        const timestamp = new Date().toISOString().split('T')[0];
        const beforeScreenshot = `msn-norwegian-before-${timestamp}.png`;
        await saveScreenshot(page, beforeScreenshot);

        // Handle cookie consent
        console.log('🍪 Handling cookie consent...');
        const consentHandler = new ConsentHandler();
        const consentResult = await consentHandler.handleCookieConsent(page, 5000);
        console.log('🍪 Consent success:', consentResult.success);

        // Wait a bit after consent handling
        await page.waitForTimeout(1000);

        // Take screenshot after consent handling
        const afterConsentScreenshot = `msn-norwegian-after-consent-${timestamp}.png`;
        await saveScreenshot(page, afterConsentScreenshot);

        // Run extraction
        console.log('🔍 Running content extraction...');
        const extractionResult = await hybridDetector.extract(page);

        // Take screenshot after extraction
        const afterExtractionScreenshot = `msn-norwegian-after-extraction-${timestamp}.png`;
        await saveScreenshot(page, afterExtractionScreenshot);

        // Display results
        console.log('\n' + '='.repeat(80));
        console.log('EXTRACTION RESULTS');
        console.log('='.repeat(80));
        console.log(`Success: ${extractionResult.success}`);
        console.log(`Confidence: ${(extractionResult.confidence * 100).toFixed(1)}%`);
        console.log(`Method: ${extractionResult.method}`);
        console.log(`Extraction Time: ${extractionResult.metadata?.extraction_time || 'N/A'}ms`);

        if (extractionResult.data?.title) {
            console.log(`\nTitle: ${extractionResult.data.title}`);
        }

        if (extractionResult.data?.content) {
            const contentPreview = extractionResult.data.content.substring(0, 300);
            console.log(`\nContent (${extractionResult.data.content.length} chars):`);
            console.log(`${contentPreview}${extractionResult.data.content.length > 300 ? '...' : ''}`);
        }

        if (extractionResult.data?.author) {
            console.log(`\nAuthor: ${extractionResult.data.author}`);
        }

        if (extractionResult.data?.date) {
            console.log(`\nDate: ${extractionResult.data.date}`);
        }

        console.log('\n✅ Test completed successfully!');
        console.log(`📸 Screenshots saved in: ${OUTPUT_DIR}`);

        // Cleanup HybridDetector
        hybridDetector.destroy();

    } catch (error) {
        console.error('❌ Test failed:', error);

        // Try to take an error screenshot if page is available
        if (page) {
            try {
                const errorScreenshot = `msn-norwegian-error-${Date.now()}.png`;
                await saveScreenshot(page, errorScreenshot);
                console.log(`📸 Error screenshot saved: ${errorScreenshot}`);
            } catch (screenshotError) {
                console.error('Failed to take error screenshot:', screenshotError);
            }
        }

        throw error;
    } finally {
        // Cleanup
        if (page) await page.close().catch(console.error);
        if (context) await context.close().catch(console.error);
        if (browser) await browser.close().catch(console.error);

        console.log('🧹 Cleanup completed');
    }
}

// Run the test
main().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
});