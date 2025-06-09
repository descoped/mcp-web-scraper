/**
 * Streaming manager for real-time content delivery during article scraping.
 * 
 * Handles incremental content streaming with SSE notifications and proper
 * sequence management for ordered content delivery.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  StreamingEvent,
  StreamingEventType,
  ContentChunkType,
  StreamingEventFactory,
  StreamingConfig,
  StreamingConfigSchema,
  MCPStreamingNotification
} from '../types/streaming.js';
import type { IConnectionManager } from '../types/index.js';

/**
 * Streaming operation tracker manages streaming events for a single operation
 */
export class OperationStreamingTracker {
  private readonly streamId: string;
  private readonly toolName: string;
  private readonly startTime: number;
  private readonly emitter: EventEmitter;
  private readonly config: StreamingConfig;
  private readonly connectionManager: IConnectionManager | undefined;
  
  private sequenceNumber: number = 0;
  private isCompleted: boolean = false;
  private streamingEvents: StreamingEvent[] = [];
  private lastChunkTime: number = Date.now();
  private chunkBuffer: string = '';

  constructor(
    streamId: string,
    toolName: string,
    emitter: EventEmitter,
    config: Partial<StreamingConfig> = {},
    connectionManager?: IConnectionManager
  ) {
    this.streamId = streamId;
    this.toolName = toolName;
    this.startTime = Date.now();
    this.emitter = emitter;
    this.config = StreamingConfigSchema.parse(config);
    this.connectionManager = connectionManager;
  }

  /**
   * Start streaming with initial information
   */
  startStream(url: string, expectedContentTypes: ContentChunkType[]): void {
    if (this.isCompleted) return;
    
    if (this.config.enabled) {
      const event = StreamingEventFactory.createStreamStarted(
        this.streamId,
        this.toolName,
        url,
        expectedContentTypes,
        this.sequenceNumber++
      );
      this.emitStreamingEvent(event);
    }
  }

  /**
   * Stream a content chunk
   */
  streamContentChunk(
    chunkType: ContentChunkType,
    content: string,
    chunkIndex: number = 0,
    isComplete: boolean = false
  ): void {
    if (this.isCompleted || !this.config.enabled) return;
    
    // Check if this content type should be streamed
    if (!this.config.streamedContentTypes.includes(chunkType)) {
      return;
    }

    // Chunk size management
    let processedContent = content;
    if (content.length > this.config.maxChunkSize) {
      processedContent = content.slice(0, this.config.maxChunkSize) + '...';
    }

    // Skip tiny chunks unless they're complete
    if (!isComplete && processedContent.length < this.config.minChunkSize) {
      this.chunkBuffer += processedContent;
      return;
    }

    // Include buffered content if we have it
    if (this.chunkBuffer) {
      processedContent = this.chunkBuffer + processedContent;
      this.chunkBuffer = '';
    }

    // Rate limiting check
    const now = Date.now();
    if (now - this.lastChunkTime < this.config.chunkInterval && !isComplete) {
      return;
    }
    this.lastChunkTime = now;

    const event = StreamingEventFactory.createContentChunk(
      this.streamId,
      this.toolName,
      chunkType,
      processedContent,
      chunkIndex,
      this.sequenceNumber++,
      isComplete
    );
    
    this.emitStreamingEvent(event);
  }

  /**
   * Send metadata update
   */
  updateMetadata(field: string, value: unknown, source?: string): void {
    if (this.isCompleted || !this.config.enabled) return;

    const event: StreamingEvent = {
      streamId: this.streamId,
      toolName: this.toolName,
      eventType: StreamingEventType.METADATA_UPDATE,
      timestamp: new Date().toISOString(),
      sequenceNumber: this.sequenceNumber++,
      message: `Updated ${field}`,
      metadataUpdate: {
        field,
        value,
        source
      }
    };
    
    this.emitStreamingEvent(event);
  }

  /**
   * Signal extraction completion
   */
  completeExtraction(extractionSummary: {
    totalChunks: number;
    contentTypes: ContentChunkType[];
    successfulExtractions: number;
    failedExtractions: number;
  }): void {
    if (this.isCompleted || !this.config.enabled) return;

    const event: StreamingEvent = {
      streamId: this.streamId,
      toolName: this.toolName,
      eventType: StreamingEventType.EXTRACTION_COMPLETE,
      timestamp: new Date().toISOString(),
      sequenceNumber: this.sequenceNumber++,
      message: 'Content extraction completed',
      extractionSummary: {
        ...extractionSummary,
        extractionDuration: Date.now() - this.startTime
      }
    };
    
    this.emitStreamingEvent(event);
  }

  /**
   * Complete the streaming operation with final result
   */
  completeStream(finalResult: any): void {
    if (this.isCompleted) return;
    
    // Flush any remaining buffered content
    if (this.chunkBuffer) {
      this.streamContentChunk(ContentChunkType.CONTENT_PARAGRAPH, this.chunkBuffer, 0, true);
    }

    this.isCompleted = true;

    if (this.config.enabled) {
      const streamStats = {
        totalEvents: this.sequenceNumber,
        streamDuration: Date.now() - this.startTime,
        averageChunkSize: this.streamingEvents.length > 0 ? 
          this.streamingEvents.reduce((sum, event) => {
            if (event.eventType === StreamingEventType.CONTENT_CHUNK) {
              return sum + event.contentChunk.content.length;
            }
            return sum;
          }, 0) / this.streamingEvents.filter(e => e.eventType === StreamingEventType.CONTENT_CHUNK).length : 0
      };

      const event = StreamingEventFactory.createStreamCompleted(
        this.streamId,
        this.toolName,
        finalResult,
        this.sequenceNumber++,
        streamStats
      );
      
      this.emitStreamingEvent(event);
    }
  }

  /**
   * Fail the streaming operation
   */
  failStream(error: { code: string; message: string; stage: string }): void {
    if (this.isCompleted) return;
    
    this.isCompleted = true;

    if (this.config.enabled) {
      const event = StreamingEventFactory.createStreamError(
        this.streamId,
        this.toolName,
        error,
        this.sequenceNumber++
      );
      
      this.emitStreamingEvent(event);
    }
  }

  /**
   * Emit streaming event
   */
  private emitStreamingEvent(event: StreamingEvent): void {
    this.streamingEvents.push(event);
    this.emitter.emit('streaming', event);
    
    // Also broadcast via SSE if connection manager is available
    if (this.connectionManager) {
      this.connectionManager.broadcastNotification({
        method: 'notifications/streaming',
        params: {
          streamingEvent: event
        }
      }).catch(error => {
        console.error(`Failed to broadcast streaming event:`, error);
      });
    }
  }

  /**
   * Get current streaming info
   */
  getInfo(): {
    streamId: string;
    toolName: string;
    sequenceNumber: number;
    isCompleted: boolean;
    elapsedTime: number;
    eventCount: number;
  } {
    return {
      streamId: this.streamId,
      toolName: this.toolName,
      sequenceNumber: this.sequenceNumber,
      isCompleted: this.isCompleted,
      elapsedTime: Date.now() - this.startTime,
      eventCount: this.streamingEvents.length
    };
  }
}

/**
 * Global streaming manager handles multiple streaming operations
 */
export class StreamingManager {
  private readonly emitter: EventEmitter;
  private readonly config: StreamingConfig;
  private readonly activeStreams: Map<string, OperationStreamingTracker> = new Map();
  private readonly streamingBuffer: StreamingEvent[] = [];
  private readonly connectionManager: IConnectionManager | undefined;

  constructor(config: Partial<StreamingConfig> = {}, connectionManager?: IConnectionManager) {
    this.config = StreamingConfigSchema.parse(config);
    this.emitter = new EventEmitter();
    this.connectionManager = connectionManager;
    this.setupEventHandling();
  }

  /**
   * Create a new streaming operation tracker
   */
  createStream(toolName: string, streamId?: string): OperationStreamingTracker {
    const id = streamId || uuidv4();
    const tracker = new OperationStreamingTracker(
      id,
      toolName,
      this.emitter,
      this.config,
      this.connectionManager
    );

    this.activeStreams.set(id, tracker);
    
    // Clean up completed streams after some time
    setTimeout(() => {
      if (tracker.getInfo().isCompleted) {
        this.activeStreams.delete(id);
      }
    }, 60000); // Clean up after 1 minute

    return tracker;
  }

  /**
   * Get streaming operation tracker by ID
   */
  getStream(streamId: string): OperationStreamingTracker | undefined {
    return this.activeStreams.get(streamId);
  }

  /**
   * Get all active streaming operations
   */
  getActiveStreams(): OperationStreamingTracker[] {
    return Array.from(this.activeStreams.values());
  }

  /**
   * Add streaming event listener
   */
  onStreaming(listener: (event: StreamingEvent) => void): void {
    this.emitter.on('streaming', listener);
  }

  /**
   * Remove streaming event listener
   */
  offStreaming(listener: (event: StreamingEvent) => void): void {
    this.emitter.off('streaming', listener);
  }

  /**
   * Add MCP streaming notification listener
   */
  onMCPStreamingNotification(listener: (notification: MCPStreamingNotification) => void): void {
    this.emitter.on('mcpStreamingNotification', listener);
  }

  /**
   * Get recent streaming events from buffer
   */
  getRecentEvents(limit: number = 10): StreamingEvent[] {
    return this.streamingBuffer.slice(-limit);
  }

  /**
   * Get statistics about streaming operations
   */
  getStats(): {
    activeStreams: number;
    totalEventsBuffered: number;
    configEnabled: boolean;
    streamedContentTypes: ContentChunkType[];
  } {
    return {
      activeStreams: this.activeStreams.size,
      totalEventsBuffered: this.streamingBuffer.length,
      configEnabled: this.config.enabled,
      streamedContentTypes: this.config.streamedContentTypes
    };
  }

  /**
   * Setup internal event handling
   */
  private setupEventHandling(): void {
    this.emitter.on('streaming', (event: StreamingEvent) => {
      // Add to buffer
      this.streamingBuffer.push(event);
      
      // Trim buffer if too large
      if (this.streamingBuffer.length > this.config.maxBufferSize) {
        this.streamingBuffer.shift();
      }

      // Convert to MCP notification format
      const mcpNotification: MCPStreamingNotification = {
        jsonrpc: '2.0',
        method: 'notifications/streaming',
        params: {
          streamingEvent: event
        }
      };

      // Emit MCP notification
      this.emitter.emit('mcpStreamingNotification', mcpNotification);
    });
  }
}

/**
 * Default streaming manager instance
 */
export const defaultStreamingManager = new StreamingManager();