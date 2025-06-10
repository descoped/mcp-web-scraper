/**
 * Unit tests for PageManager - session and page lifecycle management
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PageManager} from '@/core/pageManager.js';
import type {BrowserPool} from '@/core/browserPool.js';

// Mock browser and page
const mockPage = {
    goto: vi.fn(),
    close: vi.fn(),
    title: vi.fn(() => 'Test Page'),
    url: vi.fn(() => 'https://example.com'),
    content: vi.fn(() => '<html><body>Test</body></html>'),
    screenshot: vi.fn(() => Buffer.from('screenshot')),
    evaluate: vi.fn(),
    waitForSelector: vi.fn(),
    click: vi.fn(),
    type: vi.fn(),
    hover: vi.fn(),
    selectOption: vi.fn(),
    keyboard: {
        press: vi.fn()
    },
    mouse: {
        click: vi.fn()
    },
    setViewportSize: vi.fn(),
    pdf: vi.fn(() => Buffer.from('pdf')),
    on: vi.fn(),
    removeListener: vi.fn(),
    isClosed: vi.fn(() => false)
};

const mockContext = {
    newPage: vi.fn(() => mockPage),
    close: vi.fn(),
    pages: vi.fn(() => [mockPage])
};

const mockBrowser = {
    newContext: vi.fn(() => mockContext),
    close: vi.fn(),
    isConnected: vi.fn(() => true),
    contexts: vi.fn(() => [mockContext])
};

const mockBrowserPool: Partial<BrowserPool> = {
    getBrowser: vi.fn(() => Promise.resolve(mockBrowser as any)),
    releaseBrowser: vi.fn(() => Promise.resolve())
};

describe('PageManager', () => {
    let pageManager: PageManager;

    beforeEach(() => {
        pageManager = new PageManager(mockBrowserPool as BrowserPool);
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await pageManager.closeAllSessions();
    });

    describe('session creation', () => {
        it('should create new session with unique ID', async () => {
            const session = await pageManager.createSession();

            expect(session).toBeDefined();
            expect(session.sessionId).toBeDefined();
            expect(session.page).toBeDefined();
            expect(typeof session.sessionId).toBe('string');
        });

        it('should create multiple unique sessions', async () => {
            const session1 = await pageManager.createSession();
            const session2 = await pageManager.createSession();

            expect(session1.sessionId).not.toBe(session2.sessionId);
            expect(session1.page).not.toBe(session2.page);
        });

        it('should use browser pool for session creation', async () => {
            await pageManager.createSession();

            expect(mockBrowserPool.getBrowser).toHaveBeenCalledTimes(1);
            expect(mockBrowser.newContext).toHaveBeenCalledTimes(1);
            expect(mockContext.newPage).toHaveBeenCalledTimes(1);
        });
    });

    describe('session retrieval', () => {
        it('should retrieve existing session by ID', async () => {
            const session = await pageManager.createSession();
            const retrieved = pageManager.getSession(session.sessionId);

            expect(retrieved).toBe(session);
        });

        it('should return undefined for non-existent session', () => {
            const retrieved = pageManager.getSession('non-existent-id');

            expect(retrieved).toBeUndefined();
        });
    });

    describe('session management', () => {
        it('should track all active sessions', async () => {
            const session1 = await pageManager.createSession();
            const session2 = await pageManager.createSession();

            const allSessions = pageManager.getAllSessions();

            expect(allSessions).toHaveLength(2);
            expect(allSessions).toContain(session1);
            expect(allSessions).toContain(session2);
        });

        it('should close specific session', async () => {
            const session = await pageManager.createSession();

            await pageManager.closeSession(session.sessionId);

            expect(mockPage.close).toHaveBeenCalledTimes(1);
            expect(mockContext.close).toHaveBeenCalledTimes(1);
            expect(mockBrowserPool.releaseBrowser).toHaveBeenCalledTimes(1);

            const retrieved = pageManager.getSession(session.sessionId);
            expect(retrieved).toBeUndefined();
        });

        it('should close all sessions', async () => {
            await pageManager.createSession();
            await pageManager.createSession();

            expect(pageManager.getAllSessions()).toHaveLength(2);

            await pageManager.closeAllSessions();

            expect(pageManager.getAllSessions()).toHaveLength(0);
            expect(mockPage.close).toHaveBeenCalledTimes(2);
            expect(mockContext.close).toHaveBeenCalledTimes(2);
            expect(mockBrowserPool.releaseBrowser).toHaveBeenCalledTimes(2);
        });
    });

    describe('session health monitoring', () => {
        it('should detect closed pages', async () => {
            const session = await pageManager.createSession();

            // Mock page as closed
            mockPage.isClosed.mockReturnValue(true);

            const isHealthy = pageManager.isSessionHealthy(session.sessionId);
            expect(isHealthy).toBe(false);
        });

        it('should detect healthy sessions', async () => {
            const session = await pageManager.createSession();

            // Mock page as open
            mockPage.isClosed.mockReturnValue(false);

            const isHealthy = pageManager.isSessionHealthy(session.sessionId);
            expect(isHealthy).toBe(true);
        });

        it('should return false for non-existent sessions', () => {
            const isHealthy = pageManager.isSessionHealthy('non-existent');
            expect(isHealthy).toBe(false);
        });
    });

    describe('session cleanup', () => {
        it('should handle session close errors gracefully', async () => {
            const session = await pageManager.createSession();

            // Mock close error
            mockPage.close.mockRejectedValueOnce(new Error('Close failed'));

            // Should not throw
            await expect(pageManager.closeSession(session.sessionId)).resolves.not.toThrow();
        });

        it('should clean up unhealthy sessions', async () => {
            const session = await pageManager.createSession();

            // Mock page as closed
            mockPage.isClosed.mockReturnValue(true);

            await pageManager.cleanupUnhealthySessions();

            // Session should be removed from manager
            const retrieved = pageManager.getSession(session.sessionId);
            expect(retrieved).toBeUndefined();
        });

        it('should preserve healthy sessions during cleanup', async () => {
            const session = await pageManager.createSession();

            // Mock page as healthy
            mockPage.isClosed.mockReturnValue(false);

            await pageManager.cleanupUnhealthySessions();

            // Session should still exist
            const retrieved = pageManager.getSession(session.sessionId);
            expect(retrieved).toBe(session);
        });
    });

    describe('error handling', () => {
        it('should handle browser acquisition failures', async () => {
            // Mock browser acquisition failure
            vi.mocked(mockBrowserPool.getBrowser!).mockRejectedValueOnce(new Error('Browser unavailable'));

            await expect(pageManager.createSession()).rejects.toThrow('Browser unavailable');
        });

        it('should handle context creation failures', async () => {
            // Mock context creation failure
            mockBrowser.newContext.mockRejectedValueOnce(new Error('Context failed'));

            await expect(pageManager.createSession()).rejects.toThrow('Context failed');
        });

        it('should handle page creation failures', async () => {
            // Mock page creation failure
            mockContext.newPage.mockRejectedValueOnce(new Error('Page failed'));

            await expect(pageManager.createSession()).rejects.toThrow('Page failed');
        });
    });

    describe('resource management', () => {
        it('should properly release browser resources', async () => {
            const session = await pageManager.createSession();
            await pageManager.closeSession(session.sessionId);

            expect(mockBrowserPool.releaseBrowser).toHaveBeenCalledWith(mockBrowser);
        });

        it('should close context before releasing browser', async () => {
            const session = await pageManager.createSession();
            await pageManager.closeSession(session.sessionId);

            expect(mockContext.close).toHaveBeenCalledBefore(mockBrowserPool.releaseBrowser as any);
        });

        it('should close page before closing context', async () => {
            const session = await pageManager.createSession();
            await pageManager.closeSession(session.sessionId);

            expect(mockPage.close).toHaveBeenCalledBefore(mockContext.close as any);
        });
    });
});