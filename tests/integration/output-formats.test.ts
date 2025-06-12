/**
 * Integration test for outputFormats functionality
 * Tests text, html, and markdown output generation
 */

import {afterAll, beforeAll, describe, it} from 'vitest';
import {PlaywrightMCPServer} from '@/server.js';
import type {ServerConfig} from '@/types/index.js';

describe('Output Formats Integration', () => {
    let server: PlaywrightMCPServer;

    beforeAll(async () => {
        const config: ServerConfig = {
            name: 'output-formats-test-server',
            version: '1.0.0',
            port: 3004,
            browserPoolSize: 1,
            requestTimeout: 20000,
            consentTimeout: 3000,
            enableDebugLogging: false
        };

        server = new PlaywrightMCPServer(config);
    });

    afterAll(async () => {
        if (server) {
            try {
                await server.browserPool.cleanup();
            } catch (error) {
                console.log('Cleanup error (expected in test):', error);
            }
        }
    });

    it('should generate only text format by default', async () => {
        const url = 'https://example.com';

        console.log('\n🧪 Testing default output format (text only)...');

        const tool = server.toolRegistry.getTool('scrape_article_content');
        if (!tool) {
            throw new Error('scrape_article_content tool not found');
        }

        const context = {
            browserPool: server.browserPool,
            config: server.config,
            consentPatterns: server.getConsentPatterns()
        };

        const result = await tool.execute({url}, context);

        if (result.content && result.content[0] && result.content[0].type === 'text') {
            const parsedResult = JSON.parse(result.content[0].text);

            console.log('📊 Default format result:');
            console.log('- Has fullText:', !!parsedResult.fullText);
            console.log('- Has fullHtml:', !!parsedResult.fullHtml);
            console.log('- Has fullMarkdown:', !!parsedResult.fullMarkdown);

            // Should only have text by default
            if (!parsedResult.fullText) {
                throw new Error('Expected fullText to be present by default');
            }
            if (parsedResult.fullHtml) {
                throw new Error('Expected fullHtml to be absent by default');
            }
            if (parsedResult.fullMarkdown) {
                throw new Error('Expected fullMarkdown to be absent by default');
            }
        }

        console.log('✅ Default format test passed!');
    }, 30000);

    it('should generate multiple formats when requested', async () => {
        const url = 'https://example.com';

        console.log('\n🧪 Testing multiple output formats (text, html, markdown)...');

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

        if (result.content && result.content[0] && result.content[0].type === 'text') {
            const parsedResult = JSON.parse(result.content[0].text);

            console.log('📊 Multiple formats result:');
            console.log('- Has fullText:', !!parsedResult.fullText);
            console.log('- Has fullHtml:', !!parsedResult.fullHtml);
            console.log('- Has fullMarkdown:', !!parsedResult.fullMarkdown);

            if (parsedResult.fullText) {
                console.log('- Text length:', parsedResult.fullText.length);
            }
            if (parsedResult.fullHtml) {
                console.log('- HTML length:', parsedResult.fullHtml.length);
            }
            if (parsedResult.fullMarkdown) {
                console.log('- Markdown length:', parsedResult.fullMarkdown.length);
                console.log('- Markdown preview:', parsedResult.fullMarkdown.slice(0, 200) + '...');
            }

            // Should have all three formats
            if (!parsedResult.fullText) {
                throw new Error('Expected fullText to be present');
            }
            if (!parsedResult.fullHtml) {
                throw new Error('Expected fullHtml to be present');
            }
            if (!parsedResult.fullMarkdown) {
                throw new Error('Expected fullMarkdown to be present');
            }

            // HTML should be the largest, markdown should be structured
            if (parsedResult.fullHtml.length < parsedResult.fullText.length) {
                throw new Error('Expected HTML to be larger than text');
            }
            if (!parsedResult.fullMarkdown.includes('#')) {
                throw new Error('Expected markdown to contain heading markers');
            }
        }

        console.log('✅ Multiple formats test passed!');
    }, 30000);

    it('should generate only markdown when requested', async () => {
        const url = 'https://example.com';

        console.log('\n🧪 Testing markdown-only output...');

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
            outputFormats: ['markdown']
        }, context);

        if (result.content && result.content[0] && result.content[0].type === 'text') {
            const parsedResult = JSON.parse(result.content[0].text);

            console.log('📊 Markdown-only result:');
            console.log('- Has fullText:', !!parsedResult.fullText);
            console.log('- Has fullHtml:', !!parsedResult.fullHtml);
            console.log('- Has fullMarkdown:', !!parsedResult.fullMarkdown);

            // Should only have markdown
            if (parsedResult.fullText) {
                throw new Error('Expected fullText to be absent');
            }
            if (parsedResult.fullHtml) {
                throw new Error('Expected fullHtml to be absent');
            }
            if (!parsedResult.fullMarkdown) {
                throw new Error('Expected fullMarkdown to be present');
            }

            console.log('- Markdown length:', parsedResult.fullMarkdown.length);
            console.log('- Markdown structure check:', parsedResult.fullMarkdown.includes('#') ? 'Has headings' : 'No headings');
        }

        console.log('✅ Markdown-only test passed!');
    }, 30000);
});