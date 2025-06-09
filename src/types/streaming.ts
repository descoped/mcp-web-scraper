/**
 * Streaming response types for real-time content delivery.
 * 
 * Provides incremental content updates during article scraping operations.
 */

import { z } from 'zod';

/**
 * Streaming response event types
 */
export enum StreamingEventType {
  STREAM_STARTED = 'stream_started',
  CONTENT_CHUNK = 'content_chunk', 
  METADATA_UPDATE = 'metadata_update',
  EXTRACTION_COMPLETE = 'extraction_complete',
  STREAM_COMPLETED = 'stream_completed',
  STREAM_ERROR = 'stream_error'
}

/**
 * Content chunk types for different extraction phases
 */
export enum ContentChunkType {
  TITLE = 'title',
  AUTHOR = 'author', 
  PUBLICATION_DATE = 'publication_date',
  SUMMARY = 'summary',
  CONTENT_PARAGRAPH = 'content_paragraph',
  FULL_TEXT_CHUNK = 'full_text_chunk',
  METADATA = 'metadata'
}

/**
 * Base streaming event schema
 */
export const BaseStreamingEventSchema = z.object({
  // Unique identifier for the streaming operation
  streamId: z.string().uuid(),
  
  // Tool name that triggered the streaming
  toolName: z.string(),
  
  // Event type
  eventType: z.nativeEnum(StreamingEventType),
  
  // Timestamp when event occurred
  timestamp: z.string().datetime(),
  
  // Sequence number for ordering
  sequenceNumber: z.number().int().min(0),
  
  // Human-readable message
  message: z.string(),
  
  // Additional context data
  metadata: z.record(z.unknown()).optional()
});

/**
 * Stream started event - initial response with basic info
 */
export const StreamStartedEventSchema = BaseStreamingEventSchema.extend({
  eventType: z.literal(StreamingEventType.STREAM_STARTED),
  
  // Initial article information
  initialData: z.object({
    url: z.string().url(),
    expectedContentTypes: z.array(z.nativeEnum(ContentChunkType)),
    estimatedTotalChunks: z.number().int().min(1).optional(),
    scrapeStartTime: z.string().datetime()
  })
});

/**
 * Content chunk event - incremental content delivery
 */
export const ContentChunkEventSchema = BaseStreamingEventSchema.extend({
  eventType: z.literal(StreamingEventType.CONTENT_CHUNK),
  
  // Content chunk data
  contentChunk: z.object({
    chunkType: z.nativeEnum(ContentChunkType),
    content: z.string(),
    chunkIndex: z.number().int().min(0),
    isComplete: z.boolean(),
    extractionMethod: z.string().optional(),
    confidence: z.number().min(0).max(1).optional()
  })
});

/**
 * Metadata update event - article metadata as discovered
 */
export const MetadataUpdateEventSchema = BaseStreamingEventSchema.extend({
  eventType: z.literal(StreamingEventType.METADATA_UPDATE),
  
  // Updated metadata
  metadataUpdate: z.object({
    field: z.string(),
    value: z.unknown(),
    source: z.string().optional(),
    confidence: z.number().min(0).max(1).optional()
  })
});

/**
 * Extraction complete event - all content extracted, processing final result
 */
export const ExtractionCompleteEventSchema = BaseStreamingEventSchema.extend({
  eventType: z.literal(StreamingEventType.EXTRACTION_COMPLETE),
  
  // Extraction summary
  extractionSummary: z.object({
    totalChunks: z.number().int().min(0),
    contentTypes: z.array(z.nativeEnum(ContentChunkType)),
    extractionDuration: z.number().positive(),
    successfulExtractions: z.number().int().min(0),
    failedExtractions: z.number().int().min(0)
  })
});

/**
 * Stream completed event - final response with complete article
 */
export const StreamCompletedEventSchema = BaseStreamingEventSchema.extend({
  eventType: z.literal(StreamingEventType.STREAM_COMPLETED),
  
  // Final article result
  finalResult: z.object({
    url: z.string(),
    extracted: z.object({
      title: z.string().optional(),
      content: z.string().optional(),
      author: z.string().optional(),
      date: z.string().optional(),
      summary: z.string().optional()
    }),
    fullText: z.string(),
    timestamp: z.string(),
    streamingStats: z.object({
      totalEvents: z.number().int().min(0),
      streamDuration: z.number().positive(),
      averageChunkSize: z.number().positive(),
      compressionRatio: z.number().positive().optional()
    })
  })
});

/**
 * Stream error event - streaming operation failed
 */
export const StreamErrorEventSchema = BaseStreamingEventSchema.extend({
  eventType: z.literal(StreamingEventType.STREAM_ERROR),
  
  // Error details
  error: z.object({
    code: z.string(),
    message: z.string(),
    stage: z.string(),
    recoverableAction: z.string().optional(),
    partialData: z.record(z.unknown()).optional()
  })
});

/**
 * Union type for all streaming events
 */
export const StreamingEventSchema = z.discriminatedUnion('eventType', [
  StreamStartedEventSchema,
  ContentChunkEventSchema, 
  MetadataUpdateEventSchema,
  ExtractionCompleteEventSchema,
  StreamCompletedEventSchema,
  StreamErrorEventSchema
]);

/**
 * TypeScript types derived from schemas
 */
export type BaseStreamingEvent = z.infer<typeof BaseStreamingEventSchema>;
export type StreamStartedEvent = z.infer<typeof StreamStartedEventSchema>;
export type ContentChunkEvent = z.infer<typeof ContentChunkEventSchema>;
export type MetadataUpdateEvent = z.infer<typeof MetadataUpdateEventSchema>;
export type ExtractionCompleteEvent = z.infer<typeof ExtractionCompleteEventSchema>;
export type StreamCompletedEvent = z.infer<typeof StreamCompletedEventSchema>;
export type StreamErrorEvent = z.infer<typeof StreamErrorEventSchema>;
export type StreamingEvent = z.infer<typeof StreamingEventSchema>;

/**
 * MCP notification schema for streaming events
 */
export const MCPStreamingNotificationSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.literal('notifications/streaming'),
  params: z.object({
    streamingEvent: StreamingEventSchema
  })
});

export type MCPStreamingNotification = z.infer<typeof MCPStreamingNotificationSchema>;

/**
 * Streaming configuration
 */
export const StreamingConfigSchema = z.object({
  // Enable/disable streaming responses
  enabled: z.boolean().default(true),
  
  // Minimum chunk size before sending (characters)
  minChunkSize: z.number().positive().default(100),
  
  // Maximum chunk size to prevent huge notifications (characters) 
  maxChunkSize: z.number().positive().default(2000),
  
  // Minimum interval between chunk notifications (milliseconds)
  chunkInterval: z.number().positive().default(200),
  
  // Maximum number of streaming events to buffer
  maxBufferSize: z.number().positive().default(50),
  
  // Content types to stream
  streamedContentTypes: z.array(z.nativeEnum(ContentChunkType)).default([
    ContentChunkType.TITLE,
    ContentChunkType.AUTHOR,
    ContentChunkType.PUBLICATION_DATE,
    ContentChunkType.CONTENT_PARAGRAPH,
    ContentChunkType.SUMMARY
  ])
});

export type StreamingConfig = z.infer<typeof StreamingConfigSchema>;

/**
 * Helper functions for creating streaming events
 */
export class StreamingEventFactory {
  static createStreamStarted(
    streamId: string,
    toolName: string,
    url: string,
    expectedContentTypes: ContentChunkType[],
    sequenceNumber: number = 0
  ): StreamStartedEvent {
    return {
      streamId,
      toolName,
      eventType: StreamingEventType.STREAM_STARTED,
      timestamp: new Date().toISOString(),
      sequenceNumber,
      message: `Started streaming extraction for ${url}`,
      initialData: {
        url,
        expectedContentTypes,
        scrapeStartTime: new Date().toISOString()
      }
    };
  }

  static createContentChunk(
    streamId: string,
    toolName: string,
    chunkType: ContentChunkType,
    content: string,
    chunkIndex: number,
    sequenceNumber: number,
    isComplete: boolean = false
  ): ContentChunkEvent {
    return {
      streamId,
      toolName,
      eventType: StreamingEventType.CONTENT_CHUNK,
      timestamp: new Date().toISOString(),
      sequenceNumber,
      message: `Extracted ${chunkType}: ${content.slice(0, 50)}${content.length > 50 ? '...' : ''}`,
      contentChunk: {
        chunkType,
        content,
        chunkIndex,
        isComplete
      }
    };
  }

  static createStreamCompleted(
    streamId: string,
    toolName: string,
    finalResult: any,
    sequenceNumber: number,
    streamStats: any
  ): StreamCompletedEvent {
    return {
      streamId,
      toolName,
      eventType: StreamingEventType.STREAM_COMPLETED,
      timestamp: new Date().toISOString(),
      sequenceNumber,
      message: 'Streaming extraction completed successfully',
      finalResult: {
        ...finalResult,
        streamingStats: streamStats
      }
    };
  }

  static createStreamError(
    streamId: string,
    toolName: string,
    error: { code: string; message: string; stage: string },
    sequenceNumber: number
  ): StreamErrorEvent {
    return {
      streamId,
      toolName,
      eventType: StreamingEventType.STREAM_ERROR,
      timestamp: new Date().toISOString(),
      sequenceNumber,
      message: `Streaming error: ${error.message}`,
      error
    };
  }
}