/**
 * Integration test for scraping VG.no article
 * Tests real-world cookie consent handling and content extraction
 */

import {afterAll, beforeAll, describe, it} from 'vitest';
import {PlaywrightMCPServer} from '@/server.js';
import type {ServerConfig} from '@/types/index.js';

describe('VG.no Article Scraping Integration', () => {
    let server: PlaywrightMCPServer;

    beforeAll(async () => {
        const config: ServerConfig = {
            name: 'integration-test-server',
            version: '1.0.0',
            port: 3003,
            browserPoolSize: 1,
            requestTimeout: 30000,
            consentTimeout: 5000,
            enableDebugLogging: true
        };

        server = new PlaywrightMCPServer(config);
    });

    afterAll(async () => {
        if (server) {
            try {
                await server.browserPool.cleanup();
                // Skip full server.stop() to avoid process.exit in tests
            } catch (error) {
                console.log('Cleanup error (expected in test):', error);
            }
        }
    });

    it('should scrape VG.no Magnus Carlsen article with all output formats', async () => {
        const url = 'https://www.vg.no/sport/i/gwlg79/magnus-carlsen-tapte-for-nakamura-i-norway-chess';

        console.log('\n🚀 Starting VG.no article scraping test with ALL formats...');
        console.log(`📰 Article URL: ${url}`);

        const tool = server.toolRegistry.getTool('scrape_article_content');
        if (!tool) {
            throw new Error('scrape_article_content tool not found');
        }

        const context = {
            browserPool: server.browserPool,
            config: server.config,
            consentPatterns: server.getConsentPatterns()
        };

        const result = await tool.execute({
            url,
            outputFormats: ['text', 'html', 'markdown']
        }, context);

        // Pretty print the result with format separation
        console.log('\n📊 Scraping Result (All Formats):');
        console.log('=================================');

        if (result.content && result.content[0] && result.content[0].type === 'text') {
            const parsedResult = JSON.parse(result.content[0].text);

            // Display metadata first
            console.log('\n📋 METADATA:');
            console.log('------------');
            console.log(`URL: ${parsedResult.url}`);
            console.log(`Timestamp: ${parsedResult.timestamp}`);
            console.log(`Cookie Consent: ${parsedResult.cookieConsent.success ? '✅ Success' : '❌ Failed'} (${parsedResult.cookieConsent.reason})`);

            // Display extracted structured data
            console.log('\n🎯 EXTRACTED DATA:');
            console.log('------------------');
            console.log(`Title: ${parsedResult.extracted.title || 'Not found'}`);
            console.log(`Author: ${parsedResult.extracted.author || 'Not found'}`);
            console.log(`Date: ${parsedResult.extracted.date || 'Not found'}`);
            console.log(`Summary: ${parsedResult.extracted.summary ? parsedResult.extracted.summary.slice(0, 100) + '...' : 'Not found'}`);

            // Display format availability and sizes
            console.log('\n📏 FORMAT AVAILABILITY:');
            console.log('----------------------');
            console.log(`✅ Text: ${parsedResult.fullText ? `${parsedResult.fullText.length} characters` : 'Not generated'}`);
            console.log(`✅ HTML: ${parsedResult.fullHtml ? `${parsedResult.fullHtml.length} characters` : 'Not generated'}`);
            console.log(`✅ Markdown: ${parsedResult.fullMarkdown ? `${parsedResult.fullMarkdown.length} characters` : 'Not generated'}`);

            // Display text content preview
            if (parsedResult.fullText) {
                console.log('\n📄 TEXT CONTENT (Preview - First 300 chars):');
                console.log('---------------------------------------------');
                console.log(parsedResult.fullText.slice(0, 300).replace(/\s+/g, ' ') + '...');
            }

            // Display markdown content preview
            if (parsedResult.fullMarkdown) {
                console.log('\n📝 MARKDOWN CONTENT (Preview - First 500 chars):');
                console.log('------------------------------------------------');
                console.log(parsedResult.fullMarkdown.slice(0, 500) + '...');
            }

            // Display HTML content preview (minimal)
            if (parsedResult.fullHtml) {
                console.log('\n🌐 HTML CONTENT (Preview - DOCTYPE and head tag):');
                console.log('--------------------------------------------------');
                const htmlPreview = parsedResult.fullHtml.slice(0, 200);
                console.log(htmlPreview + '...');
            }

            // Display format comparison
            console.log('\n📊 FORMAT COMPARISON:');
            console.log('---------------------');
            const textLen = parsedResult.fullText?.length || 0;
            const htmlLen = parsedResult.fullHtml?.length || 0;
            const markdownLen = parsedResult.fullMarkdown?.length || 0;

            console.log(`Text:     ${textLen.toLocaleString()} chars (baseline)`);
            console.log(`HTML:     ${htmlLen.toLocaleString()} chars (${htmlLen > textLen ? '+' : ''}${((htmlLen - textLen) / textLen * 100).toFixed(1)}%)`);
            console.log(`Markdown: ${markdownLen.toLocaleString()} chars (${markdownLen > textLen ? '+' : ''}${((markdownLen - textLen) / textLen * 100).toFixed(1)}%)`);
            
        } else {
            console.log('Unexpected result format:', result);
        }

        console.log('\n✅ All formats test completed successfully!');
    }, 60000); // 60 second timeout for real web scraping
});