/**
 * Progress tracker for MCP operations.
 * 
 * Provides real-time progress notifications for long-running operations
 * like article scraping and consent handling.
 */

import {EventEmitter} from 'events';
import {
  CorrelationContext,
  MCPProgressNotification,
  ProgressConfig,
  ProgressConfigSchema,
  ProgressEvent,
  ProgressEventFactory,
  ProgressStage
} from '../types/progress.js';
import type {RequestMetadata} from '../types/index.js';

/**
 * Progress tracker manages progress events for a single operation
 */
export class OperationProgressTracker {
  private readonly operationId: string;
  private readonly toolName: string;
  private readonly startTime: number;
  private readonly emitter: EventEmitter;
  private readonly config: ProgressConfig;
    private readonly correlationContext: CorrelationContext;
  
  private currentStage: ProgressStage = ProgressStage.INITIALIZING;
  private stageStartTime: number = Date.now();
  private lastProgressUpdate: number = 0;
  private isCompleted: boolean = false;

  constructor(
    operationId: string,
    toolName: string,
    emitter: EventEmitter,
    config: Partial<ProgressConfig> = {},
    requestMetadata?: RequestMetadata
  ) {
    this.operationId = operationId;
    this.toolName = toolName;
    this.startTime = Date.now();
    this.emitter = emitter;
    this.config = ProgressConfigSchema.parse(config);

      // Extract correlation context from request metadata
      this.correlationContext = {
          correlationId: requestMetadata?.correlationId,
          requestId: requestMetadata?.requestId,
          connectionId: requestMetadata?.connectionId
      };
  }

  /**
   * Start a new stage
   */
  startStage(stage: ProgressStage, message: string, options?: {
    estimatedDuration?: number;
    stageData?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): void {
    if (this.isCompleted) return;
    
    // Complete previous stage if not already completed
    if (this.currentStage !== ProgressStage.INITIALIZING && this.currentStage !== stage) {
      this.completeStage();
    }

    this.currentStage = stage;
    this.stageStartTime = Date.now();

    if (this.config.enabled && this.config.trackedStages.includes(stage)) {
      const event = ProgressEventFactory.createStageStarted(
        this.operationId,
        this.toolName,
        stage,
        message,
          {
              ...options,
              correlation: this.correlationContext
          }
      );
      this.emitProgress(event);
    }
  }

  /**
   * Update progress within current stage
   */
  updateProgress(
    progress: number,
    message: string,
    options?: {
      progressDetails?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }
  ): void {
    if (this.isCompleted) return;
    
    const now = Date.now();
    
    // Throttle progress updates based on config
    if (now - this.lastProgressUpdate < this.config.updateInterval) {
      return;
    }
    
    this.lastProgressUpdate = now;

    if (this.config.enabled && this.config.trackedStages.includes(this.currentStage)) {
      const event = ProgressEventFactory.createStageProgress(
        this.operationId,
        this.toolName,
        this.currentStage,
        Math.min(Math.max(progress, 0), 100), // Clamp between 0-100
        message,
          {
              ...options,
              correlation: this.correlationContext
          }
      );
      this.emitProgress(event);
    }
  }

  /**
   * Complete current stage
   */
  completeStage(stageResults?: Record<string, unknown>, message?: string): void {
    if (this.isCompleted) return;
    
    const actualDuration = Date.now() - this.stageStartTime;
    
    if (this.config.enabled && this.config.trackedStages.includes(this.currentStage)) {
      const event = ProgressEventFactory.createStageCompleted(
        this.operationId,
        this.toolName,
        this.currentStage,
        actualDuration,
        stageResults || {},
          message,
          this.correlationContext
      );
      this.emitProgress(event);
    }
  }

  /**
   * Complete entire operation successfully
   */
  completeOperation(finalResults: Record<string, unknown>, message?: string): void {
    if (this.isCompleted) return;
    
    // Complete current stage first
    this.completeStage();
    
    const totalDuration = Date.now() - this.startTime;
    this.isCompleted = true;

    if (this.config.enabled) {
      const event = ProgressEventFactory.createOperationCompleted(
        this.operationId,
        this.toolName,
        totalDuration,
        finalResults,
          message,
          this.correlationContext
      );
      this.emitProgress(event);
    }
  }

  /**
   * Fail the operation
   */
  failOperation(
    error: { code: string; message: string; details?: Record<string, unknown> },
    message?: string
  ): void {
    if (this.isCompleted) return;
    
    this.isCompleted = true;

    if (this.config.enabled) {
      const event = ProgressEventFactory.createOperationFailed(
        this.operationId,
        this.toolName,
        error,
        this.currentStage,
          message,
          this.correlationContext
      );
      this.emitProgress(event);
    }
  }

  /**
   * Emit progress event
   */
  private emitProgress(event: ProgressEvent): void {
    this.emitter.emit('progress', event);
  }

  /**
   * Get current operation info
   */
  getInfo(): {
    operationId: string;
    toolName: string;
    currentStage: ProgressStage;
    isCompleted: boolean;
    elapsedTime: number;
  } {
    return {
      operationId: this.operationId,
      toolName: this.toolName,
      currentStage: this.currentStage,
      isCompleted: this.isCompleted,
      elapsedTime: Date.now() - this.startTime
    };
  }
}

/**
 * Global progress manager handles multiple operations
 */
export class ProgressManager {
  private readonly emitter: EventEmitter;
  private readonly config: ProgressConfig;
  private readonly activeOperations: Map<string, OperationProgressTracker> = new Map();
  private readonly progressBuffer: ProgressEvent[] = [];

  constructor(config: Partial<ProgressConfig> = {}) {
    this.config = ProgressConfigSchema.parse(config);
    this.emitter = new EventEmitter();
    this.setupEventHandling();
  }

  /**
   * Create a new operation tracker
   */
  createOperation(
      operationId: string,
      toolName: string,
      requestMetadata?: RequestMetadata
  ): OperationProgressTracker {
    const tracker = new OperationProgressTracker(
      operationId,
      toolName,
      this.emitter,
        this.config,
        requestMetadata
    );

    this.activeOperations.set(operationId, tracker);
    
    // Clean up completed operations after some time
    setTimeout(() => {
      if (tracker.getInfo().isCompleted) {
        this.activeOperations.delete(operationId);
      }
    }, 60000); // Clean up after 1 minute

    return tracker;
  }

  /**
   * Get operation tracker by ID
   */
  getOperation(operationId: string): OperationProgressTracker | undefined {
    return this.activeOperations.get(operationId);
  }

  /**
   * Get all active operations
   */
  getActiveOperations(): OperationProgressTracker[] {
    return Array.from(this.activeOperations.values());
  }

  /**
   * Add progress event listener
   */
  onProgress(listener: (event: ProgressEvent) => void): void {
    this.emitter.on('progress', listener);
  }

  /**
   * Remove progress event listener
   */
  offProgress(listener: (event: ProgressEvent) => void): void {
    this.emitter.off('progress', listener);
  }

  /**
   * Add MCP notification listener (for sending via MCP protocol)
   */
  onMCPNotification(listener: (notification: MCPProgressNotification) => void): void {
    this.emitter.on('mcpNotification', listener);
  }

  /**
   * Get recent progress events from buffer
   */
  getRecentEvents(limit: number = 10): ProgressEvent[] {
    return this.progressBuffer.slice(-limit);
  }

  /**
   * Get statistics about progress tracking
   */
  getStats(): {
    activeOperations: number;
    totalEventsBuffered: number;
    configEnabled: boolean;
    trackedStages: ProgressStage[];
  } {
    return {
      activeOperations: this.activeOperations.size,
      totalEventsBuffered: this.progressBuffer.length,
      configEnabled: this.config.enabled,
      trackedStages: this.config.trackedStages
    };
  }

  /**
   * Setup internal event handling
   */
  private setupEventHandling(): void {
    this.emitter.on('progress', (event: ProgressEvent) => {
      // Add to buffer
      this.progressBuffer.push(event);
      
      // Trim buffer if too large
      if (this.progressBuffer.length > this.config.maxBufferSize) {
        this.progressBuffer.shift();
      }

      // Convert to MCP notification format
      const mcpNotification: MCPProgressNotification = {
        jsonrpc: '2.0',
        method: 'notifications/progress',
        params: {
          progressEvent: event
        }
      };

      // Emit MCP notification
      this.emitter.emit('mcpNotification', mcpNotification);
    });
  }
}

/**
 * Default progress manager instance
 */
export const defaultProgressManager = new ProgressManager();