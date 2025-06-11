/**
 * Progress event types and schemas for MCP protocol progress notifications.
 * 
 * These types define the structure for real-time progress updates during
 * long-running operations like article scraping and consent handling.
 */

import {z} from 'zod';

/**
 * Progress event stages for article scraping workflow
 */
export enum ProgressStage {
  INITIALIZING = 'initializing',
  LOADING_PAGE = 'loading_page',
  HANDLING_CONSENT = 'handling_consent',
  EXTRACTING_CONTENT = 'extracting_content',
  PROCESSING_RESULTS = 'processing_results',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

/**
 * Progress event types
 */
export enum ProgressEventType {
  STAGE_STARTED = 'stage_started',
  STAGE_PROGRESS = 'stage_progress',
  STAGE_COMPLETED = 'stage_completed',
  OPERATION_COMPLETED = 'operation_completed',
  OPERATION_FAILED = 'operation_failed'
}

/**
 * Base progress event schema
 */
export const BaseProgressEventSchema = z.object({
  // Unique identifier for the operation
  operationId: z.string().uuid(),

    // NEW: Correlation fields for client tracking
    correlationId: z.string().optional(),     // Client-provided correlation ID (e.g., async-task-worker task_id)
    requestId: z.string().optional(),         // MCP request ID
    connectionId: z.string().optional(),      // SSE connection ID
  
  // Tool name that triggered the operation
  toolName: z.string(),
  
  // Event type
  eventType: z.nativeEnum(ProgressEventType),
  
  // Current stage
  stage: z.nativeEnum(ProgressStage),
  
  // Timestamp when event occurred
  timestamp: z.string().datetime(),
  
  // Human-readable message
  message: z.string(),
  
  // Progress percentage (0-100) if applicable
  progress: z.number().min(0).max(100).optional(),
  
  // Additional context data
  metadata: z.record(z.unknown()).optional()
});

/**
 * Stage started event - when a new stage begins
 */
export const StageStartedEventSchema = BaseProgressEventSchema.extend({
  eventType: z.literal(ProgressEventType.STAGE_STARTED),
  
  // Estimated duration for this stage (in milliseconds)
  estimatedDuration: z.number().positive().optional(),
  
  // Stage-specific data
  stageData: z.object({
    url: z.string().url().optional(),
    consentMethod: z.string().optional(),
    extractorType: z.string().optional()
  }).optional()
});

/**
 * Stage progress event - incremental progress within a stage
 */
export const StageProgressEventSchema = BaseProgressEventSchema.extend({
  eventType: z.literal(ProgressEventType.STAGE_PROGRESS),
  
  // Current progress within this stage
  progress: z.number().min(0).max(100),
  
  // Stage-specific progress details
  progressDetails: z.record(z.unknown()).optional()
});

/**
 * Stage completed event - when a stage finishes successfully
 */
export const StageCompletedEventSchema = BaseProgressEventSchema.extend({
  eventType: z.literal(ProgressEventType.STAGE_COMPLETED),
  progress: z.literal(100),
  
  // Actual duration this stage took
  actualDuration: z.number().positive(),
  
  // Stage results
  stageResults: z.object({
    success: z.boolean(),
    data: z.record(z.unknown()).optional(),
    warnings: z.array(z.string()).optional()
  })
});

/**
 * Operation completed event - when entire operation finishes
 */
export const OperationCompletedEventSchema = BaseProgressEventSchema.extend({
  eventType: z.literal(ProgressEventType.OPERATION_COMPLETED),
  stage: z.literal(ProgressStage.COMPLETED),
  progress: z.literal(100),
  
  // Total operation duration
  totalDuration: z.number().positive(),
  
  // Final operation results
  finalResults: z.record(z.unknown())
});

/**
 * Operation failed event - when operation fails
 */
export const OperationFailedEventSchema = BaseProgressEventSchema.extend({
  eventType: z.literal(ProgressEventType.OPERATION_FAILED),
  stage: z.literal(ProgressStage.FAILED),
  
  // Error details
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    stage: z.nativeEnum(ProgressStage)
  })
});

/**
 * Union type for all progress events
 */
export const ProgressEventSchema = z.discriminatedUnion('eventType', [
  StageStartedEventSchema,
  StageProgressEventSchema,
  StageCompletedEventSchema,
  OperationCompletedEventSchema,
  OperationFailedEventSchema
]);

/**
 * TypeScript types derived from schemas
 */
export type BaseProgressEvent = z.infer<typeof BaseProgressEventSchema>;
export type StageStartedEvent = z.infer<typeof StageStartedEventSchema>;
export type StageProgressEvent = z.infer<typeof StageProgressEventSchema>;
export type StageCompletedEvent = z.infer<typeof StageCompletedEventSchema>;
export type OperationCompletedEvent = z.infer<typeof OperationCompletedEventSchema>;
export type OperationFailedEvent = z.infer<typeof OperationFailedEventSchema>;
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

/**
 * MCP notification schema for progress events
 * 
 * Progress events are sent as MCP notifications (no response expected)
 */
export const MCPProgressNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('notifications/progress'),
  params: z.object({
    progressEvent: ProgressEventSchema
  })
});

export type MCPProgressNotification = z.infer<typeof MCPProgressNotificationSchema>;

/**
 * Progress tracker configuration
 */
export const ProgressConfigSchema = z.object({
  // Enable/disable progress notifications
  enabled: z.boolean().default(true),
  
  // Minimum interval between progress updates (milliseconds)
  updateInterval: z.number().positive().default(500),
  
  // Maximum number of progress events to buffer
  maxBufferSize: z.number().positive().default(100),
  
  // Stages to track (all by default)
  trackedStages: z.array(z.nativeEnum(ProgressStage)).default(Object.values(ProgressStage))
});

export type ProgressConfig = z.infer<typeof ProgressConfigSchema>;

/**
 * Correlation context for progress events
 */
export interface CorrelationContext {
    correlationId?: string;
    requestId?: string;
    connectionId?: string;
}

/**
 * Helper functions for creating progress events
 */
export class ProgressEventFactory {
  static createStageStarted(
    operationId: string,
    toolName: string,
    stage: ProgressStage,
    message: string,
    options?: {
      estimatedDuration?: number;
      stageData?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
        correlation?: CorrelationContext;
    }
  ): StageStartedEvent {
    return {
      operationId,
        correlationId: options?.correlation?.correlationId,
        requestId: options?.correlation?.requestId,
        connectionId: options?.correlation?.connectionId,
      toolName,
      eventType: ProgressEventType.STAGE_STARTED,
      stage,
      timestamp: new Date().toISOString(),
      message,
      estimatedDuration: options?.estimatedDuration,
      stageData: options?.stageData,
      metadata: options?.metadata
    };
  }

  static createStageProgress(
    operationId: string,
    toolName: string,
    stage: ProgressStage,
    progress: number,
    message: string,
    options?: {
      progressDetails?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
        correlation?: CorrelationContext;
    }
  ): StageProgressEvent {
    return {
      operationId,
        correlationId: options?.correlation?.correlationId,
        requestId: options?.correlation?.requestId,
        connectionId: options?.correlation?.connectionId,
      toolName,
      eventType: ProgressEventType.STAGE_PROGRESS,
      stage,
      timestamp: new Date().toISOString(),
      message,
      progress,
      progressDetails: options?.progressDetails,
      metadata: options?.metadata
    };
  }

  static createStageCompleted(
    operationId: string,
    toolName: string,
    stage: ProgressStage,
    actualDuration: number,
    stageResults: Record<string, unknown>,
    message: string = `${stage} completed successfully`,
    correlation?: CorrelationContext
  ): StageCompletedEvent {
    return {
      operationId,
        correlationId: correlation?.correlationId,
        requestId: correlation?.requestId,
        connectionId: correlation?.connectionId,
      toolName,
      eventType: ProgressEventType.STAGE_COMPLETED,
      stage,
      timestamp: new Date().toISOString(),
      message,
      progress: 100,
      actualDuration,
      stageResults: {
        success: true,
        data: stageResults
      }
    };
  }

  static createOperationCompleted(
    operationId: string,
    toolName: string,
    totalDuration: number,
    finalResults: Record<string, unknown>,
    message: string = 'Operation completed successfully',
    correlation?: CorrelationContext
  ): OperationCompletedEvent {
    return {
      operationId,
        correlationId: correlation?.correlationId,
        requestId: correlation?.requestId,
        connectionId: correlation?.connectionId,
      toolName,
      eventType: ProgressEventType.OPERATION_COMPLETED,
      stage: ProgressStage.COMPLETED,
      timestamp: new Date().toISOString(),
      message,
      progress: 100,
      totalDuration,
      finalResults
    };
  }

  static createOperationFailed(
    operationId: string,
    toolName: string,
    error: { code: string; message: string; details?: Record<string, unknown> },
    stage: ProgressStage,
    message: string = 'Operation failed',
    correlation?: CorrelationContext
  ): OperationFailedEvent {
    return {
      operationId,
        correlationId: correlation?.correlationId,
        requestId: correlation?.requestId,
        connectionId: correlation?.connectionId,
      toolName,
      eventType: ProgressEventType.OPERATION_FAILED,
      stage: ProgressStage.FAILED,
      timestamp: new Date().toISOString(),
      message,
      error: {
        ...error,
        stage
      }
    };
  }
}