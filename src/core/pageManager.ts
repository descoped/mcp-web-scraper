/**
 * Page Manager for persistent browser contexts and navigation state
 */

import { Page, BrowserContext } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import { StructuredLogger } from './structuredLogger.js';
import { ConsentHandler } from './consentHandler.js';

export interface PageSession {
  id: string;
  context: BrowserContext;
  page: Page;
  url: string;
  createdAt: Date;
  lastActivity: Date;
  navigationHistory: string[];
  hasConsentHandled: boolean;
}

export interface PageManagerConfig {
  sessionTimeout: number; // milliseconds
  maxSessions: number;
  autoHandleConsent: boolean;
}

export class PageManager {
  private sessions: Map<string, PageSession> = new Map();
  private logger: StructuredLogger;
  private config: PageManagerConfig;
  private consentHandler: ConsentHandler;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: PageManagerConfig, logger: StructuredLogger, consentHandler: ConsentHandler) {
    this.config = config;
    this.logger = logger;
    this.consentHandler = consentHandler;
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), 60000);
  }

  async createSession(context: BrowserContext): Promise<string> {
    const sessionId = uuidv4();
    const page = await context.newPage();
    
    const session: PageSession = {
      id: sessionId,
      context,
      page,
      url: 'about:blank',
      createdAt: new Date(),
      lastActivity: new Date(),
      navigationHistory: [],
      hasConsentHandled: false
    };
    
    this.sessions.set(sessionId, session);
    this.logger.info('Page session created', { operationId: sessionId });
    
    return sessionId;
  }

  async getSession(sessionId: string): Promise<PageSession | null> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      return session;
    }
    return null;
  }

  async navigateInSession(sessionId: string, url: string, handleConsent: boolean = true): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await session.page.goto(url, { waitUntil: 'domcontentloaded' });
    session.url = url;
    session.navigationHistory.push(url);
    session.lastActivity = new Date();

    // Handle consent if needed and not already handled for this session
    if (handleConsent && this.config.autoHandleConsent && !session.hasConsentHandled) {
      try {
        const consentResult = await this.consentHandler.handleCookieConsent(session.page);
        if (consentResult.success) {
          session.hasConsentHandled = true;
          this.logger.info('Cookie consent handled in session', { operationId: sessionId });
        }
      } catch (error) {
        this.logger.warn('Cookie consent handling failed', { operationId: sessionId });
      }
    }
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.page.close().catch(() => {});
      await session.context.close().catch(() => {});
      this.sessions.delete(sessionId);
      this.logger.info('Page session closed', { operationId: sessionId });
    }
  }

  async getPageSnapshot(sessionId: string): Promise<any> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Get accessibility snapshot for reliable element identification
    const snapshot = await session.page.accessibility.snapshot();
    
    // Get additional page information
    const title = await session.page.title();
    const url = session.page.url();
    
    return {
      sessionId,
      title,
      url,
      navigationHistory: session.navigationHistory,
      hasConsentHandled: session.hasConsentHandled,
      accessibility: snapshot,
      timestamp: new Date().toISOString()
    };
  }

  private async cleanupStaleSessions(): Promise<void> {
    const now = Date.now();
    const staleSessions: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity.getTime() > this.config.sessionTimeout) {
        staleSessions.push(sessionId);
      }
    }

    for (const sessionId of staleSessions) {
      await this.closeSession(sessionId);
    }

    if (staleSessions.length > 0) {
      this.logger.info('Cleaned up stale sessions', { operationId: 'cleanup' });
    }
  }

  async cleanup(): Promise<void> {
    clearInterval(this.cleanupInterval);
    
    // Close all sessions
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
  }
}