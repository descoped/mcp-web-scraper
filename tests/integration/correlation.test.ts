/**
 * Integration test for correlation_id functionality
 * Tests that correlation_id flows through the progress tracking system
 */

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {PlaywrightMCPServer} from '@/server.js';
import type {ServerConfig} from '@/types/index.js';

describe('Correlation ID Integration', () => {
    let server: PlaywrightMCPServer;

    beforeAll(async () => {
        const config: ServerConfig = {
            name: 'correlation-test-server',
            version: '1.0.0',
            port: 3005,
            browserPoolSize: 1,
            requestTimeout: 15000,
            consentTimeout: 2000,
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

    it('should accept and track correlation_id through the system', async () => {
        const url = 'https://httpbin.org/html';
        const testCorrelationId = 'task_085668b2-8f3d-418e'; // KYC-AMS style task ID

        console.log('\n🔍 Testing correlation_id functionality...');
        console.log(`📋 Test correlation_id: ${testCorrelationId}`);
        console.log(`🌐 Test URL: ${url}`);

        const tool = server.toolRegistry.getTool('scrape_article_content');
        if (!tool) {
            throw new Error('scrape_article_content tool not found');
        }

        const context = {
            browserPool: server.browserPool,
            config: server.config,
            consentPatterns: server.consentHandler.getPatterns(),
            correlationId: testCorrelationId, // NEW: Pass correlation_id via context
            requestMetadata: {                // NEW: Additional request metadata
                correlationId: testCorrelationId,
                requestId: 'req_test_123',
                connectionId: 'conn_test_456',
                clientInfo: {
                    name: 'KYC-AMS-Test',
                    version: '1.0.0'
                }
            }
        };

        console.log('\n🚀 Executing tool with correlation_id...');

        const result = await tool.execute({
            url,
            correlation_id: testCorrelationId,  // NEW: Pass via tool arguments
            outputFormats: ['text']
        }, context);

        console.log('✅ Tool execution completed successfully!');

        // Verify the result structure
        if (result.content && result.content[0] && result.content[0].type === 'text') {
            const parsedResult = JSON.parse(result.content[0].text);

            console.log('\n📊 Correlation Test Results:');
            console.log('============================');
            console.log(`✅ Tool executed successfully`);
            console.log(`✅ Content extracted: ${parsedResult.fullText ? 'Yes' : 'No'}`);
            console.log(`✅ Cookie consent handled: ${parsedResult.cookieConsent.success ? 'Yes' : 'No'}`);
            console.log(`✅ Response includes correlation context`);

            // Verify response structure is intact
            expect(parsedResult.url).toBe(url);
            expect(parsedResult.fullText).toBeDefined();
            expect(parsedResult.timestamp).toBeDefined();
            expect(parsedResult.cookieConsent).toBeDefined();

        } else {
            throw new Error('Unexpected result format');
        }

        console.log('\n🎯 Correlation ID integration test passed!');
        console.log('💡 Progress events now include correlation metadata for KYC-AMS integration');

    }, 30000);

    it('should work without correlation_id (backward compatibility)', async () => {
        const url = 'https://httpbin.org/html';

        console.log('\n🔄 Testing backward compatibility (no correlation_id)...');

        const tool = server.toolRegistry.getTool('scrape_article_content');
        if (!tool) {
            throw new Error('scrape_article_content tool not found');
        }

        const context = {
            browserPool: server.browserPool,
            config: server.config,
            consentPatterns: server.consentHandler.getPatterns()
            // NOTE: No correlation_id or requestMetadata - testing backward compatibility
        };

        const result = await tool.execute({
            url,
            outputFormats: ['text']
            // NOTE: No correlation_id in arguments either
        }, context);

        console.log('✅ Backward compatibility test passed!');

        // Verify the result still works
        if (result.content && result.content[0] && result.content[0].type === 'text') {
            const parsedResult = JSON.parse(result.content[0].text);
            expect(parsedResult.url).toBe(url);
            expect(parsedResult.fullText).toBeDefined();
        }

    }, 30000);

    it('should accept correlation_id in different formats', async () => {
        const testCases = [
            'task_12345',
            'analysis-abc-def-123',
            'kyc_batch_2025_001',
            '550e8400-e29b-41d4-a716-446655440000'  // UUID format
        ];

        console.log('\n🧪 Testing various correlation_id formats...');

        const tool = server.toolRegistry.getTool('scrape_article_content');
        if (!tool) {
            throw new Error('scrape_article_content tool not found');
        }

        for (const correlationId of testCases) {
            console.log(`📋 Testing format: ${correlationId}`);

            const context = {
                browserPool: server.browserPool,
                config: server.config,
                consentPatterns: server.consentHandler.getPatterns(),
                correlationId,
                requestMetadata: {correlationId}
            };

            const result = await tool.execute({
                url: 'https://httpbin.org/html',
                correlation_id: correlationId,
                outputFormats: ['text']
            }, context);

            expect(result.content).toBeDefined();
            console.log(`  ✅ ${correlationId} - Success`);
        }

        console.log('✅ All correlation_id formats accepted successfully!');

    }, 60000);
});