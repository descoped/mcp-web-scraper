/**
 * Unit tests for PageManager - session and page lifecycle management
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PageManager, type PageManagerConfig} from '@/core/pageManager.js';
import {ConsentHandler} from '@/core/consentHandler.js';
import type {IStructuredLogger} from '@/types/monitoring.js';

// Mock page with accessibility support
const mockPage = {
    goto: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    title: vi.fn(() => Promise.resolve('Test Page')),
    url: vi.fn(() => 'https://example.com'),
    accessibility: {
        snapshot: vi.fn(() => Promise.resolve({role: 'document', name: 'Test Page'}))
    },
    isClosed: vi.fn(() => false)
};

const mockContext = {
    newPage: vi.fn(() => Promise.resolve(mockPage)),
    close: vi.fn(() => Promise.resolve())
};

// Mock dependencies
const mockLogger: IStructuredLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
};

const mockConsentHandler = {
    handleCookieConsent: vi.fn(() => Promise.resolve({success: true, method: 'auto'}))
} as unknown as ConsentHandler;

const mockConfig: PageManagerConfig = {
    sessionTimeout: 300000, // 5 minutes
    maxSessions: 10,
    autoHandleConsent: true
};

describe('PageManager', () => {
    let pageManager: PageManager;

    beforeEach(() => {
        pageManager = new PageManager(mockConfig, mockLogger, mockConsentHandler);
        vi.clearAllMocks();
    });

    afterEach(async () => {
        await pageManager.cleanup();
    });

    describe('session creation', () => {
        it('should create new session with unique ID', async () => {
            const sessionId = await pageManager.createSession(mockContext as any);

            expect(sessionId).toBeDefined();
            expect(typeof sessionId).toBe('string');
            expect(mockContext.newPage).toHaveBeenCalledTimes(1);
        });

        it('should create multiple unique sessions', async () => {
            const sessionId1 = await pageManager.createSession(mockContext as any);
            const sessionId2 = await pageManager.createSession(mockContext as any);

            expect(sessionId1).not.toBe(sessionId2);
            expect(mockContext.newPage).toHaveBeenCalledTimes(2);
        });

        it('should log session creation', async () => {
            const sessionId = await pageManager.createSession(mockContext as any);

            expect(mockLogger.info).toHaveBeenCalledWith('Page session created', {operationId: sessionId});
        });
    });

    describe('session retrieval', () => {
        it('should retrieve existing session by ID', async () => {
            const sessionId = await pageManager.createSession(mockContext as any);
            const retrieved = await pageManager.getSession(sessionId);

            expect(retrieved).toBeDefined();
            expect(retrieved!.id).toBe(sessionId);
            expect(retrieved!.page).toBe(mockPage);
        });

        it('should return null for non-existent session', async () => {
            const retrieved = await pageManager.getSession('non-existent-id');

            expect(retrieved).toBeNull();
        });

        it('should update lastActivity when retrieving session', async () => {
            const sessionId = await pageManager.createSession(mockContext as any);

            const firstRetrieval = await pageManager.getSession(sessionId);
            const firstTime = firstRetrieval!.lastActivity;

            // Wait a bit and retrieve again
            await new Promise(resolve => setTimeout(resolve, 10));
            const secondRetrieval = await pageManager.getSession(sessionId);
            const secondTime = secondRetrieval!.lastActivity;

            expect(secondTime.getTime()).toBeGreaterThan(firstTime.getTime());
        });
    });

    describe('session management', () => {
        it('should close specific session', async () => {
            const sessionId = await pageManager.createSession(mockContext as any);

            await pageManager.closeSession(sessionId);

            expect(mockPage.close).toHaveBeenCalledTimes(1);
            expect(mockContext.close).toHaveBeenCalledTimes(1);
            expect(mockLogger.info).toHaveBeenCalledWith('Page session closed', {operationId: sessionId});

            const retrieved = await pageManager.getSession(sessionId);
            expect(retrieved).toBeNull();
        });

        it('should handle closing non-existent session gracefully', async () => {
            await expect(pageManager.closeSession('non-existent')).resolves.not.toThrow();
        });
    });

    describe('navigation', () => {
        it('should navigate in session', async () => {
            const sessionId = await pageManager.createSession(mockContext as any);
            const url = 'https://test.com';

            await pageManager.navigateInSession(sessionId, url);

            expect(mockPage.goto).toHaveBeenCalledWith(url, {waitUntil: 'domcontentloaded'});

            const session = await pageManager.getSession(sessionId);
            expect(session!.url).toBe(url);
            expect(session!.navigationHistory).toContain(url);
        });

        it('should handle consent during navigation', async () => {
            const sessionId = await pageManager.createSession(mockContext as any);

            await pageManager.navigateInSession(sessionId, 'https://test.com', true);

            expect(mockConsentHandler.handleCookieConsent).toHaveBeenCalledWith(mockPage);

            const session = await pageManager.getSession(sessionId);
            expect(session!.hasConsentHandled).toBe(true);
        });

        it('should throw error for non-existent session', async () => {
            await expect(pageManager.navigateInSession('non-existent', 'https://test.com'))
                .rejects.toThrow('Session non-existent not found');
        });
    });

    describe('page snapshots', () => {
        it('should get page snapshot', async () => {
            const sessionId = await pageManager.createSession(mockContext as any);
            await pageManager.navigateInSession(sessionId, 'https://test.com');

            const snapshot = await pageManager.getPageSnapshot(sessionId);

            expect(snapshot).toBeDefined();
            expect(snapshot.sessionId).toBe(sessionId);
            expect(snapshot.title).toBe('Test Page');
            expect(snapshot.url).toBe('https://example.com');
            expect(snapshot.accessibility).toBeDefined();
            expect(mockPage.accessibility.snapshot).toHaveBeenCalled();
        });

        it('should throw error for non-existent session snapshot', async () => {
            await expect(pageManager.getPageSnapshot('non-existent'))
                .rejects.toThrow('Session non-existent not found');
        });
    });

    describe('error handling', () => {
        it('should handle page creation failures', async () => {
            // Mock page creation failure
            mockContext.newPage.mockRejectedValueOnce(new Error('Page failed'));

            await expect(pageManager.createSession(mockContext as any)).rejects.toThrow('Page failed');
        });

        it('should handle session close errors gracefully', async () => {
            const sessionId = await pageManager.createSession(mockContext as any);

            // Mock close error
            mockPage.close.mockRejectedValueOnce(new Error('Close failed'));

            // Should not throw
            await expect(pageManager.closeSession(sessionId)).resolves.not.toThrow();
        });

        it('should handle consent handler errors gracefully', async () => {
            const sessionId = await pageManager.createSession(mockContext as any);

            // Mock consent handler failure
            vi.mocked(mockConsentHandler.handleCookieConsent).mockRejectedValueOnce(new Error('Consent failed'));

            // Should not throw
            await expect(pageManager.navigateInSession(sessionId, 'https://test.com')).resolves.not.toThrow();

            expect(mockLogger.warn).toHaveBeenCalledWith('Cookie consent handling failed', {operationId: sessionId});
        });
    });

    describe('cleanup', () => {
        it('should cleanup all sessions on destroy', async () => {
            const sessionId1 = await pageManager.createSession(mockContext as any);
            const sessionId2 = await pageManager.createSession(mockContext as any);

            await pageManager.cleanup();

            // Verify sessions are closed
            expect(mockPage.close).toHaveBeenCalledTimes(2);
            expect(mockContext.close).toHaveBeenCalledTimes(2);

            // Verify sessions are removed
            const retrieved1 = await pageManager.getSession(sessionId1);
            const retrieved2 = await pageManager.getSession(sessionId2);
            expect(retrieved1).toBeNull();
            expect(retrieved2).toBeNull();
        });
    });
});