/**
 * Monitoring, metrics, and structured logging types for production observability.
 * 
 * Provides comprehensive telemetry for MCP server operations including
 * performance metrics, error tracking, and detailed structured logging.
 */

import { z } from 'zod';

/**
 * Log levels for structured logging
 */
export enum LogLevel {
  TRACE = 'trace',
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

/**
 * Operation types for metrics tracking
 */
export enum OperationType {
  TOOL_EXECUTION = 'tool_execution',
  BROWSER_OPERATION = 'browser_operation',
  CONSENT_HANDLING = 'consent_handling',
  CONTENT_EXTRACTION = 'content_extraction',
  STREAMING_OPERATION = 'streaming_operation',
  CONNECTION_MANAGEMENT = 'connection_management',
  PROGRESS_NOTIFICATION = 'progress_notification'
}

/**
 * Metric types for different measurement categories
 */
export enum MetricType {
  COUNTER = 'counter',        // Cumulative values (requests count, errors count)
  GAUGE = 'gauge',           // Current values (active connections, memory usage)
  HISTOGRAM = 'histogram',   // Distribution of values (response times, payload sizes)
  TIMER = 'timer'           // Duration measurements with automatic histogram
}

/**
 * Base structured log entry schema
 */
export const StructuredLogEntrySchema = z.object({
  // Core log metadata
  timestamp: z.string().datetime(),
  level: z.nativeEnum(LogLevel),
  message: z.string(),
  service: z.string().default('mcp-playwright'),
  version: z.string().default('1.0.0'),
  
  // Request/operation context
  requestId: z.string().optional(),
  operationId: z.string().optional(),
  toolName: z.string().optional(),
  connectionId: z.string().optional(),
  
  // Error details (for error level logs)
  error: z.object({
    name: z.string(),
    message: z.string(),
    stack: z.string().optional(),
    code: z.string().optional(),
    cause: z.unknown().optional()
  }).optional(),
  
  // Operation-specific context
  context: z.record(z.unknown()).optional(),
  
  // Performance metrics
  duration: z.number().optional(), // milliseconds
  memoryUsage: z.number().optional(), // bytes
  
  // Labels for filtering and aggregation
  labels: z.record(z.string()).optional()
});

export type StructuredLogEntry = z.infer<typeof StructuredLogEntrySchema>;

/**
 * Metric entry schema for telemetry collection
 */
export const MetricEntrySchema = z.object({
  // Metric identification
  name: z.string(),
  type: z.nativeEnum(MetricType),
  value: z.number(),
  unit: z.string().optional(), // ms, bytes, requests, etc.
  
  // Temporal information
  timestamp: z.string().datetime(),
  
  // Dimensional data for grouping/filtering
  labels: z.record(z.string()).default({}),
  
  // Additional context
  operationType: z.nativeEnum(OperationType).optional(),
  operationId: z.string().optional(),
  
  // Histogram-specific data
  buckets: z.array(z.number()).optional(), // for histogram metrics
  percentiles: z.record(z.number()).optional() // p50, p95, p99, etc.
});

export type MetricEntry = z.infer<typeof MetricEntrySchema>;

/**
 * Performance metrics aggregation
 */
export const PerformanceMetricsSchema = z.object({
  // Request metrics
  requestCount: z.number().default(0),
  errorCount: z.number().default(0),
  successRate: z.number().min(0).max(1).default(1),
  
  // Timing metrics (milliseconds)
  averageResponseTime: z.number().default(0),
  p50ResponseTime: z.number().default(0),
  p95ResponseTime: z.number().default(0),
  p99ResponseTime: z.number().default(0),
  
  // Resource metrics
  activeConnections: z.number().default(0),
  activeBrowsers: z.number().default(0),
  memoryUsageMB: z.number().default(0),
  
  // Operation-specific metrics
  toolExecutions: z.record(z.number()).default({}),
  consentSuccessRate: z.number().min(0).max(1).default(1),
  streamingOperations: z.number().default(0),
  
  // Time window
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  windowDurationMs: z.number()
});

export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;

/**
 * Error aggregation and tracking
 */
export const ErrorSummarySchema = z.object({
  // Error counts by type
  errorsByType: z.record(z.number()).default({}),
  errorsByTool: z.record(z.number()).default({}),
  errorsByStage: z.record(z.number()).default({}),
  
  // Recent errors for debugging
  recentErrors: z.array(z.object({
    timestamp: z.string().datetime(),
    level: z.nativeEnum(LogLevel),
    message: z.string(),
    toolName: z.string().optional(),
    operationId: z.string().optional(),
    errorCode: z.string().optional(),
    context: z.record(z.unknown()).optional()
  })).default([]),
  
  // Error rate trends
  errorRate: z.number().min(0).max(1).default(0),
  errorTrend: z.enum(['increasing', 'decreasing', 'stable']).default('stable'),
  
  // Time window
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime()
});

export type ErrorSummary = z.infer<typeof ErrorSummarySchema>;

/**
 * System health status
 */
export const HealthStatusSchema = z.object({
  // Overall health
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  uptime: z.number(), // seconds
  version: z.string(),
  
  // Component health
  components: z.object({
    browserPool: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      activeBrowsers: z.number(),
      availableBrowsers: z.number(),
      queuedRequests: z.number()
    }),
    
    connections: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      totalConnections: z.number(),
      oldestConnectionAge: z.number().optional() // seconds
    }),
    
    tools: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      totalTools: z.number(),
      recentFailures: z.number()
    }),
    
    streaming: z.object({
      status: z.enum(['healthy', 'degraded', 'unhealthy']),
      activeStreams: z.number(),
      streamingErrors: z.number()
    })
  }),
  
  // Performance indicators
  performance: z.object({
    averageResponseTime: z.number(),
    errorRate: z.number(),
    memoryUsage: z.number(),
    cpuUsage: z.number().optional()
  }),
  
  // Health check timestamp
  timestamp: z.string().datetime()
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

/**
 * Monitoring configuration
 */
export const MonitoringConfigSchema = z.object({
  // Logging configuration
  logging: z.object({
    level: z.nativeEnum(LogLevel).default(LogLevel.INFO),
    enableStructuredLogs: z.boolean().default(true),
    enableConsoleOutput: z.boolean().default(true),
    enableFileOutput: z.boolean().default(false),
    logFilePath: z.string().optional(),
    maxLogFileSize: z.number().default(100 * 1024 * 1024), // 100MB
    maxLogFiles: z.number().default(5)
  }),
  
  // Metrics configuration
  metrics: z.object({
    enableMetrics: z.boolean().default(true),
    metricsRetentionHours: z.number().default(24),
    aggregationIntervalMs: z.number().default(60000), // 1 minute
    maxMetricEntries: z.number().default(10000)
  }),
  
  // Health check configuration
  healthCheck: z.object({
    enableHealthEndpoint: z.boolean().default(true),
    healthCheckIntervalMs: z.number().default(30000), // 30 seconds
    degradedThresholds: z.object({
      errorRate: z.number().default(0.05), // 5%
      responseTime: z.number().default(5000), // 5 seconds
      memoryUsage: z.number().default(512 * 1024 * 1024) // 512MB
    }),
    unhealthyThresholds: z.object({
      errorRate: z.number().default(0.20), // 20%
      responseTime: z.number().default(10000), // 10 seconds
      memoryUsage: z.number().default(1024 * 1024 * 1024) // 1GB
    })
  }),
  
  // Error tracking
  errorTracking: z.object({
    enableErrorTracking: z.boolean().default(true),
    maxRecentErrors: z.number().default(100),
    errorRetentionHours: z.number().default(24)
  })
});

export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;

/**
 * Operation context for logging and metrics
 */
export interface OperationContext {
  requestId?: string;
  operationId?: string;
  toolName?: string;
  connectionId?: string;
  labels?: Record<string, string>;
  startTime?: number; // timestamp
}

/**
 * Logger interface for structured logging
 */
export interface IStructuredLogger {
  trace(message: string, context?: OperationContext, extra?: Record<string, unknown>): void;
  debug(message: string, context?: OperationContext, extra?: Record<string, unknown>): void;
  info(message: string, context?: OperationContext, extra?: Record<string, unknown>): void;
  warn(message: string, context?: OperationContext, extra?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: OperationContext, extra?: Record<string, unknown>): void;
  fatal(message: string, error?: Error, context?: OperationContext, extra?: Record<string, unknown>): void;
  
  // Performance logging
  timing(name: string, duration: number, context?: OperationContext): void;
  
  // Child logger with fixed context
  child(context: OperationContext): IStructuredLogger;
}

/**
 * Metrics collector interface
 */
export interface IMetricsCollector {
  // Counter operations
  incrementCounter(name: string, labels?: Record<string, string>, value?: number): void;
  
  // Gauge operations
  setGauge(name: string, value: number, labels?: Record<string, string>): void;
  
  // Histogram operations
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  
  // Timer operations
  startTimer(name: string, labels?: Record<string, string>): () => void; // Returns stop function
  recordTiming(name: string, duration: number, labels?: Record<string, string>): void;
  
  // Metric retrieval
  getMetrics(): MetricEntry[];
  getPerformanceMetrics(windowMs?: number): PerformanceMetrics;
  
  // Cleanup
  clearMetrics(): void;
}

/**
 * Health monitor interface
 */
export interface IHealthMonitor {
  getHealthStatus(): HealthStatus;
  isHealthy(): boolean;
  getComponentHealth(component: string): 'healthy' | 'degraded' | 'unhealthy';
  recordHealthCheck(): void;
}

/**
 * Monitor manager interface - coordinates all monitoring components
 */
export interface IMonitorManager {
  readonly logger: IStructuredLogger;
  readonly metrics: IMetricsCollector;
  readonly health: IHealthMonitor;
  
  // Operation tracking
  startOperation(operationType: OperationType, context?: OperationContext): OperationTracker;
  
  // Error tracking
  recordError(error: Error, context?: OperationContext): void;
  getErrorSummary(windowMs?: number): ErrorSummary;
  
  // System information
  getSystemStats(): {
    memoryUsage: number;
    uptime: number;
    version: string;
  };
  
  // Lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Operation tracker for automatic metrics collection
 */
export interface OperationTracker {
  readonly operationId: string;
  readonly operationType: OperationType;
  readonly startTime: number;
  
  // Add context during operation
  addContext(key: string, value: unknown): void;
  setLabels(labels: Record<string, string>): void;
  
  // Log during operation
  log(level: LogLevel, message: string, extra?: Record<string, unknown>): void;
  
  // Record metrics during operation
  recordMetric(name: string, value: number, type?: MetricType): void;
  
  // Complete operation (automatically records duration)
  complete(result?: 'success' | 'error', message?: string): void;
  
  // Fail operation with error
  fail(error: Error, message?: string): void;
}