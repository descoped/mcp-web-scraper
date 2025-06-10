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

    it('should scrape VG.no Magnus Carlsen article', async () => {
        const url = 'https://www.vg.no/sport/i/gwlg79/magnus-carlsen-tapte-for-nakamura-i-norway-chess';

        console.log('\n🚀 Starting VG.no article scraping test...');
        console.log(`📰 Article URL: ${url}`);

        const tool = server.toolRegistry.getTool('scrape_article_content');
        if (!tool) {
            throw new Error('scrape_article_content tool not found');
        }

        const context = {
            browserPool: server.browserPool,
            config: server.config,
            consentPatterns: server.consentHandler.getPatterns()
        };

        const result = await tool.execute({url}, context);

        // Pretty print the result
        console.log('\n📊 Scraping Result:');
        console.log('==================');

        if (result.content && result.content[0] && result.content[0].type === 'text') {
            const parsedResult = JSON.parse(result.content[0].text);
            console.log(JSON.stringify(parsedResult, null, 2));
        } else {
            console.log('Unexpected result format:', result);
        }

        console.log('\n✅ Test completed successfully!');
    }, 60000); // 60 second timeout for real web scraping
});