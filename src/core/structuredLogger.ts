/**
 * Structured logging implementation for production observability.
 * 
 * Provides comprehensive logging with structured data, context propagation,
 * and performance tracking for the MCP Playwright server.
 */

import { v4 as uuidv4 } from 'uuid';
import { 
  LogLevel, 
  StructuredLogEntry, 
  OperationContext, 
  IStructuredLogger,
  MonitoringConfig
} from '../types/monitoring.js';

/**
 * Structured logger implementation with context propagation
 */
export class StructuredLogger implements IStructuredLogger {
  private readonly config: MonitoringConfig['logging'];
  private readonly service: string;
  private readonly version: string;
  private readonly baseContext: OperationContext;
  private readonly logBuffer: StructuredLogEntry[] = [];

  constructor(
    config: MonitoringConfig['logging'],
    service: string = 'mcp-playwright',
    version: string = '1.0.0',
    baseContext: OperationContext = {}
  ) {
    this.config = config;
    this.service = service;
    this.version = version;
    this.baseContext = baseContext;
  }

  /**
   * Trace level logging - most verbose
   */
  trace(message: string, context?: OperationContext, extra?: Record<string, unknown>): void {
    this.log(LogLevel.TRACE, message, undefined, context, extra);
  }

  /**
   * Debug level logging - detailed diagnostic information
   */
  debug(message: string, context?: OperationContext, extra?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, undefined, context, extra);
  }

  /**
   * Info level logging - general information
   */
  info(message: string, context?: OperationContext, extra?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, undefined, context, extra);
  }

  /**
   * Warning level logging - potentially harmful situations
   */
  warn(message: string, context?: OperationContext, extra?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, undefined, context, extra);
  }

  /**
   * Error level logging - error events with optional error object
   */
  error(message: string, error?: Error, context?: OperationContext, extra?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, error, context, extra);
  }

  /**
   * Fatal level logging - very severe error events
   */
  fatal(message: string, error?: Error, context?: OperationContext, extra?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, message, error, context, extra);
  }

  /**
   * Performance timing logging
   */
  timing(name: string, duration: number, context?: OperationContext): void {
    this.log(LogLevel.INFO, `Performance: ${name}`, undefined, context, {
      timing: {
        name,
        duration,
        unit: 'ms'
      }
    });
  }

  /**
   * Create child logger with fixed context
   */
  child(context: OperationContext): IStructuredLogger {
    const mergedContext = { ...this.baseContext, ...context };
    return new StructuredLogger(this.config, this.service, this.version, mergedContext);
  }

  /**
   * Core logging implementation
   */
  private log(
    level: LogLevel, 
    message: string, 
    error?: Error, 
    context?: OperationContext, 
    extra?: Record<string, unknown>
  ): void {
    // Check if this log level should be emitted
    if (!this.shouldLog(level)) {
      return;
    }

    // Merge contexts
    const finalContext = { ...this.baseContext, ...context };

    // Create structured log entry
    const logEntry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      version: this.version,
      
      // Context information
      requestId: finalContext.requestId,
      operationId: finalContext.operationId,
      toolName: finalContext.toolName,
      connectionId: finalContext.connectionId,
      
      // Error details if provided
      ...(error && {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          code: (error as any).code,
          cause: (error as any).cause
        }
      }),
      
      // Additional context and extra data
      context: { ...extra, labels: finalContext.labels },
      
      // Performance data
      duration: this.calculateDuration(finalContext.startTime),
      memoryUsage: this.getMemoryUsage(),
      
      // Labels for filtering
      labels: finalContext.labels
    };

    // Output the log entry
    this.outputLog(logEntry);
    
    // Buffer recent logs for error tracking
    this.bufferLog(logEntry);
  }

  /**
   * Check if log level should be emitted based on configuration
   */
  private shouldLog(level: LogLevel): boolean {
    const levelOrder = [LogLevel.TRACE, LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.FATAL];
    const configLevel = this.config.level;
    const levelIndex = levelOrder.indexOf(level);
    const configIndex = levelOrder.indexOf(configLevel);
    
    return levelIndex >= configIndex;
  }

  /**
   * Calculate operation duration if start time is available
   */
  private calculateDuration(startTime?: number): number | undefined {
    if (!startTime) return undefined;
    return Date.now() - startTime;
  }

  /**
   * Get current memory usage
   */
  private getMemoryUsage(): number {
    try {
      return process.memoryUsage().heapUsed;
    } catch {
      return 0;
    }
  }

  /**
   * Output log entry to configured destinations
   */
  private outputLog(logEntry: StructuredLogEntry): void {
    if (this.config.enableStructuredLogs) {
      // Structured JSON output
      const jsonOutput = JSON.stringify(logEntry);
      
      if (this.config.enableConsoleOutput) {
        this.outputToConsole(logEntry, jsonOutput);
      }
      
      if (this.config.enableFileOutput && this.config.logFilePath) {
        this.outputToFile(jsonOutput);
      }
    } else {
      // Simple text output for development
      if (this.config.enableConsoleOutput) {
        this.outputSimpleConsole(logEntry);
      }
    }
  }

  /**
   * Output to console with formatting
   */
  private outputToConsole(logEntry: StructuredLogEntry, jsonOutput: string): void {
    const levelColors = {
      [LogLevel.TRACE]: '\x1b[90m', // gray
      [LogLevel.DEBUG]: '\x1b[36m', // cyan
      [LogLevel.INFO]: '\x1b[32m',  // green
      [LogLevel.WARN]: '\x1b[33m',  // yellow
      [LogLevel.ERROR]: '\x1b[31m', // red
      [LogLevel.FATAL]: '\x1b[35m'  // magenta
    };
    
    const resetColor = '\x1b[0m';
    const color = levelColors[logEntry.level] || '';
    
    if (this.config.enableStructuredLogs) {
      // Pretty-printed JSON for structured logs
      console.log(`${color}[${logEntry.level.toUpperCase()}]${resetColor} ${jsonOutput}`);
    } else {
      // Simple formatted output
      const contextStr = logEntry.operationId ? `[${logEntry.operationId}] ` : '';
      const durationStr = logEntry.duration ? ` (${logEntry.duration}ms)` : '';
      console.log(`${color}[${logEntry.level.toUpperCase()}]${resetColor} ${contextStr}${logEntry.message}${durationStr}`);
    }
  }

  /**
   * Simple console output for development
   */
  private outputSimpleConsole(logEntry: StructuredLogEntry): void {
    const timestamp = new Date(logEntry.timestamp).toISOString();
    const contextStr = logEntry.operationId ? `[${logEntry.operationId}] ` : '';
    const durationStr = logEntry.duration ? ` (${logEntry.duration}ms)` : '';
    
    let output = `${timestamp} [${logEntry.level.toUpperCase()}] ${contextStr}${logEntry.message}${durationStr}`;
    
    if (logEntry.error) {
      output += `\nError: ${logEntry.error.name}: ${logEntry.error.message}`;
      if (logEntry.error.stack) {
        output += `\n${logEntry.error.stack}`;
      }
    }
    
    console.log(output);
  }

  /**
   * Output to file (simplified implementation)
   */
  private outputToFile(jsonOutput: string): void {
    // In a real implementation, this would use fs.appendFile with rotation
    // For now, we'll skip file output to avoid filesystem complexity
    console.log(`[FILE] ${jsonOutput}`);
  }

  /**
   * Buffer recent logs for error tracking and debugging
   */
  private bufferLog(logEntry: StructuredLogEntry): void {
    this.logBuffer.push(logEntry);
    
    // Keep only recent logs to prevent memory leaks
    const maxBuffer = 1000;
    if (this.logBuffer.length > maxBuffer) {
      this.logBuffer.splice(0, this.logBuffer.length - maxBuffer);
    }
  }

  /**
   * Get recent log entries for debugging
   */
  getRecentLogs(count: number = 100, level?: LogLevel): StructuredLogEntry[] {
    let logs = this.logBuffer.slice(-count);
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    return logs;
  }

  /**
   * Get error logs from buffer
   */
  getRecentErrors(count: number = 50): StructuredLogEntry[] {
    return this.logBuffer
      .filter(log => log.level === LogLevel.ERROR || log.level === LogLevel.FATAL)
      .slice(-count);
  }

  /**
   * Clear log buffer
   */
  clearBuffer(): void {
    this.logBuffer.length = 0;
  }
}

/**
 * Default logger instance factory
 */
export function createLogger(
  config: MonitoringConfig['logging'], 
  context?: OperationContext
): IStructuredLogger {
  return new StructuredLogger(config, 'mcp-playwright', '1.0.0', context);
}

/**
 * Request-scoped logger factory
 */
export function createRequestLogger(
  baseLogger: IStructuredLogger,
  requestId?: string,
  operationId?: string
): IStructuredLogger {
  return baseLogger.child({
    requestId: requestId || uuidv4(),
    operationId: operationId || uuidv4(),
    startTime: Date.now()
  });
}

/**
 * Tool-scoped logger factory
 */
export function createToolLogger(
  baseLogger: IStructuredLogger,
  toolName: string,
  operationId?: string
): IStructuredLogger {
  return baseLogger.child({
    toolName,
    operationId: operationId || uuidv4(),
    startTime: Date.now()
  });
}