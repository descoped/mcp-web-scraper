/**
 * Monitor manager that coordinates all monitoring components.
 * 
 * Provides a unified interface for logging, metrics, health monitoring,
 * and operation tracking across the MCP server.
 */

import { v4 as uuidv4 } from 'uuid';
import { 
  MonitoringConfig,
  MonitoringConfigSchema,
  OperationType,
  OperationContext,
  LogLevel,
  MetricType,
  ErrorSummary,
  IMonitorManager,
  IStructuredLogger,
  IMetricsCollector,
  IHealthMonitor,
  OperationTracker
} from '../types/monitoring.js';

import { StructuredLogger } from './structuredLogger.js';
import { MetricsCollector, MetricNames } from './metricsCollector.js';
import { HealthMonitor } from './healthMonitor.js';

import type { IBrowserPool, IConnectionManager, IToolRegistry } from '../types/index.js';
import type { StreamingManager } from './streamingManager.js';

/**
 * Operation tracker implementation for automatic metrics and logging
 */
class OperationTrackerImpl implements OperationTracker {
  public readonly operationId: string;
  public readonly operationType: OperationType;
  public readonly startTime: number;
  
  private context: Record<string, unknown> = {};
  private labels: Record<string, string> = {};
  private completed: boolean = false;

  constructor(
    operationType: OperationType,
    private readonly logger: IStructuredLogger,
    private readonly metrics: IMetricsCollector,
    initialContext?: OperationContext
  ) {
    this.operationType = operationType;
    this.operationId = initialContext?.operationId || uuidv4();
    this.startTime = initialContext?.startTime || Date.now();
    
    if (initialContext) {
      this.context = { ...initialContext };
      this.labels = initialContext.labels || {};
    }

    // Record operation start
    this.metrics.incrementCounter(MetricNames.REQUESTS_TOTAL, {
      operation_type: operationType,
      ...this.labels
    });

    this.logger.info(`Operation started: ${operationType}`, {
      operationId: this.operationId,
      startTime: this.startTime
    });
  }

  /**
   * Add context during operation
   */
  addContext(key: string, value: unknown): void {
    this.context[key] = value;
  }

  /**
   * Set labels for metrics
   */
  setLabels(labels: Record<string, string>): void {
    this.labels = { ...this.labels, ...labels };
  }

  /**
   * Log during operation
   */
  log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
    const context: OperationContext = {
      operationId: this.operationId,
      startTime: this.startTime,
      labels: this.labels
    };

    switch (level) {
      case LogLevel.TRACE:
        this.logger.trace(message, context, extra);
        break;
      case LogLevel.DEBUG:
        this.logger.debug(message, context, extra);
        break;
      case LogLevel.INFO:
        this.logger.info(message, context, extra);
        break;
      case LogLevel.WARN:
        this.logger.warn(message, context, extra);
        break;
      case LogLevel.ERROR:
        this.logger.error(message, undefined, context, extra);
        break;
      case LogLevel.FATAL:
        this.logger.fatal(message, undefined, context, extra);
        break;
    }
  }

  /**
   * Record metrics during operation
   */
  recordMetric(name: string, value: number, type: MetricType = MetricType.GAUGE): void {
    const labels = {
      operation_id: this.operationId,
      operation_type: this.operationType,
      ...this.labels
    };

    switch (type) {
      case MetricType.COUNTER:
        this.metrics.incrementCounter(name, labels, value);
        break;
      case MetricType.GAUGE:
        this.metrics.setGauge(name, value, labels);
        break;
      case MetricType.HISTOGRAM:
        this.metrics.recordHistogram(name, value, labels);
        break;
      case MetricType.TIMER:
        this.metrics.recordTiming(name, value, labels);
        break;
    }
  }

  /**
   * Complete operation successfully
   */
  complete(result: 'success' | 'error' = 'success', message?: string): void {
    if (this.completed) return;
    this.completed = true;

    const duration = Date.now() - this.startTime;
    const finalMessage = message || `Operation completed: ${this.operationType}`;

    // Record metrics
    this.recordMetric(MetricNames.RESPONSE_TIME, duration, MetricType.TIMER);
    
    if (result === 'success') {
      this.logger.info(finalMessage, {
        operationId: this.operationId,
        startTime: this.startTime,
        labels: this.labels
      }, {
        duration,
        result,
        context: this.context
      });
    } else {
      this.metrics.incrementCounter(MetricNames.ERRORS_TOTAL, {
        operation_type: this.operationType,
        ...this.labels
      });
      
      this.logger.error(finalMessage, undefined, {
        operationId: this.operationId,
        startTime: this.startTime,
        labels: this.labels
      }, {
        duration,
        result,
        context: this.context
      });
    }
  }

  /**
   * Fail operation with error
   */
  fail(error: Error, message?: string): void {
    if (this.completed) return;
    this.completed = true;

    const duration = Date.now() - this.startTime;
    const finalMessage = message || `Operation failed: ${this.operationType}`;

    // Record error metrics
    this.metrics.incrementCounter(MetricNames.ERRORS_TOTAL, {
      operation_type: this.operationType,
      error_type: error.name,
      ...this.labels
    });
    
    this.recordMetric(MetricNames.RESPONSE_TIME, duration, MetricType.TIMER);

    this.logger.error(finalMessage, error, {
      operationId: this.operationId,
      startTime: this.startTime,
      labels: this.labels
    }, {
      duration,
      result: 'error',
      context: this.context
    });
  }
}

/**
 * Monitor manager implementation
 */
export class MonitorManager implements IMonitorManager {
  public readonly logger: IStructuredLogger;
  public readonly metrics: IMetricsCollector;
  public readonly health: IHealthMonitor;
  
  private readonly config: MonitoringConfig;
  private readonly errorBuffer: Array<{
    timestamp: string;
    error: Error;
    context?: OperationContext;
  }> = [];
  
  private readonly startTime: number = Date.now();

  constructor(
    browserPool: IBrowserPool,
    connectionManager: IConnectionManager,
    toolRegistry: IToolRegistry,
    streamingManager: StreamingManager,
    config: Partial<MonitoringConfig> = {}
  ) {
    this.config = MonitoringConfigSchema.parse(config);
    
    // Initialize monitoring components
    this.logger = new StructuredLogger(this.config.logging);
    this.metrics = new MetricsCollector(this.config.metrics);
    this.health = new HealthMonitor(
      this.metrics,
      browserPool,
      connectionManager,
      toolRegistry,
      streamingManager,
      this.config.healthCheck
    );

    this.logger.info('Monitor manager initialized', undefined, {
      config: this.config,
      components: ['logger', 'metrics', 'health']
    });
  }

  /**
   * Start an operation and return tracker
   */
  startOperation(operationType: OperationType, context?: OperationContext): OperationTracker {
    const operationLogger = this.logger.child({
      operationId: context?.operationId || uuidv4(),
      ...context
    });

    return new OperationTrackerImpl(operationType, operationLogger, this.metrics, context);
  }

  /**
   * Record error for tracking and analysis
   */
  recordError(error: Error, context?: OperationContext): void {
    // Add to error buffer
    this.errorBuffer.push({
      timestamp: new Date().toISOString(),
      error,
      ...(context && { context })
    });

    // Limit buffer size
    const maxErrors = this.config.errorTracking.maxRecentErrors;
    if (this.errorBuffer.length > maxErrors) {
      this.errorBuffer.splice(0, this.errorBuffer.length - maxErrors);
    }

    // Record error metrics
    this.metrics.incrementCounter(MetricNames.ERRORS_TOTAL, {
      error_type: error.name,
      tool_name: context?.toolName || 'unknown',
      operation_id: context?.operationId || 'unknown'
    });

    // Log the error
    this.logger.error('Error recorded', error, context);
  }

  /**
   * Get error summary for time window
   */
  getErrorSummary(windowMs: number = 3600000): ErrorSummary {
    const cutoffTime = Date.now() - windowMs;
    const windowStart = new Date(cutoffTime);
    const windowEnd = new Date();

    // Filter errors to time window
    const windowErrors = this.errorBuffer.filter(errorEntry => 
      new Date(errorEntry.timestamp).getTime() > cutoffTime
    );

    // Aggregate errors by type, tool, and stage
    const errorsByType: Record<string, number> = {};
    const errorsByTool: Record<string, number> = {};
    const errorsByStage: Record<string, number> = {};

    for (const errorEntry of windowErrors) {
      const errorType = errorEntry.error.name;
      const toolName = errorEntry.context?.toolName || 'unknown';
      const stage = 'general'; // Could be extracted from context

      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
      errorsByTool[toolName] = (errorsByTool[toolName] || 0) + 1;
      errorsByStage[stage] = (errorsByStage[stage] || 0) + 1;
    }

    // Calculate error rate and trend
    const totalRequests = this.metrics.getPerformanceMetrics(windowMs).requestCount;
    const totalErrors = windowErrors.length;
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

    // Simple trend calculation (would be more sophisticated in production)
    const halfWindow = windowMs / 2;
    const firstHalfErrors = windowErrors.filter(e => 
      new Date(e.timestamp).getTime() < cutoffTime + halfWindow
    ).length;
    const secondHalfErrors = totalErrors - firstHalfErrors;
    
    let errorTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (secondHalfErrors > firstHalfErrors * 1.2) {
      errorTrend = 'increasing';
    } else if (secondHalfErrors < firstHalfErrors * 0.8) {
      errorTrend = 'decreasing';
    }

    // Recent errors for debugging
    const recentErrors = windowErrors.slice(-10).map(errorEntry => ({
      timestamp: errorEntry.timestamp,
      level: LogLevel.ERROR,
      message: errorEntry.error.message,
      toolName: errorEntry.context?.toolName,
      operationId: errorEntry.context?.operationId,
      errorCode: (errorEntry.error as any).code,
      context: errorEntry.context as Record<string, unknown> | undefined
    }));

    return {
      errorsByType,
      errorsByTool,
      errorsByStage,
      recentErrors,
      errorRate,
      errorTrend,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString()
    };
  }

  /**
   * Get system statistics
   */
  getSystemStats(): {
    memoryUsage: number;
    uptime: number;
    version: string;
  } {
    return {
      memoryUsage: process.memoryUsage().heapUsed,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: '1.0.0'
    };
  }

  /**
   * Start monitoring system
   */
  async start(): Promise<void> {
    this.logger.info('Starting monitoring system');
    
    // Record system startup metrics
    this.metrics.setGauge(MetricNames.UPTIME_SECONDS, 0);
    this.metrics.setGauge(MetricNames.MEMORY_USAGE_BYTES, process.memoryUsage().heapUsed);
    
    // Start periodic system metrics collection
    this.startSystemMetricsCollection();
    
    this.logger.info('Monitoring system started successfully');
  }

  /**
   * Stop monitoring system
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping monitoring system');
    
    // Clear buffers and cleanup
    this.errorBuffer.length = 0;
    this.metrics.clearMetrics();
    
    this.logger.info('Monitoring system stopped');
  }

  /**
   * Start periodic collection of system metrics
   */
  private startSystemMetricsCollection(): void {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const uptime = Math.floor((Date.now() - this.startTime) / 1000);
      
      this.metrics.setGauge(MetricNames.MEMORY_USAGE_BYTES, memUsage.heapUsed);
      this.metrics.setGauge(MetricNames.UPTIME_SECONDS, uptime);
      
      // Record health check
      this.health.recordHealthCheck();
      
    }, 30000); // Every 30 seconds
  }
}

/**
 * Default monitor manager factory
 */
export function createMonitorManager(
  browserPool: IBrowserPool,
  connectionManager: IConnectionManager,
  toolRegistry: IToolRegistry,
  streamingManager: StreamingManager,
  config: Partial<MonitoringConfig> = {}
): IMonitorManager {
  return new MonitorManager(
    browserPool,
    connectionManager,
    toolRegistry,
    streamingManager,
    config
  );
}