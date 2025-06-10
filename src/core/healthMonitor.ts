/**
 * Health monitoring and system status tracking.
 * 
 * Provides comprehensive health checks for all server components
 * including browser pool, connections, tools, and streaming operations.
 */

import {HealthStatus, IHealthMonitor, IMetricsCollector, MonitoringConfig} from '../types/monitoring.js';
import {MetricNames} from './metricsCollector.js';
import type {IBrowserPool, IConnectionManager, IToolRegistry} from '../types/index.js';
import type {StreamingManager} from './streamingManager.js';

/**
 * Health monitor implementation
 */
export class HealthMonitor implements IHealthMonitor {
  private readonly config: MonitoringConfig['healthCheck'];
  private readonly startTime: number = Date.now();
  
  constructor(
    private readonly metrics: IMetricsCollector,
    private readonly browserPool: IBrowserPool,
    private readonly connectionManager: IConnectionManager,
    private readonly toolRegistry: IToolRegistry,
    private readonly streamingManager: StreamingManager,
    config: MonitoringConfig['healthCheck']
  ) {
    this.config = config;
    
    if (this.config.enableHealthEndpoint) {
      this.startHealthCheckTimer();
    }
  }

  /**
   * Get comprehensive health status
   */
  getHealthStatus(): HealthStatus {
    const components = this.checkAllComponents();
    const performance = this.getPerformanceIndicators();
    
    // Determine overall health based on components
    const overallStatus = this.determineOverallHealth(components, performance);
    
    const healthStatus: HealthStatus = {
      status: overallStatus,
      uptime: this.getUptimeSeconds(),
      version: '1.0.0',
      components,
      performance,
      timestamp: new Date().toISOString()
    };

    return healthStatus;
  }

  /**
   * Simple health check - returns true if healthy
   */
  isHealthy(): boolean {
    const status = this.getHealthStatus();
    return status.status === 'healthy';
  }

  /**
   * Get health status for a specific component
   */
  getComponentHealth(component: string): 'healthy' | 'degraded' | 'unhealthy' {
    const healthStatus = this.getHealthStatus();
    
    switch (component) {
      case 'browserPool':
        return healthStatus.components.browserPool.status;
      case 'connections':
        return healthStatus.components.connections.status;
      case 'tools':
        return healthStatus.components.tools.status;
      case 'streaming':
        return healthStatus.components.streaming.status;
      default:
        return 'unhealthy';
    }
  }

  /**
   * Record a health check (updates metrics)
   */
  recordHealthCheck(): void {
    const healthStatus = this.getHealthStatus();
    
    // Record health status as metrics
    this.metrics.setGauge('system_healthy', healthStatus.status === 'healthy' ? 1 : 0);
    this.metrics.setGauge('system_uptime_seconds', healthStatus.uptime);
    this.metrics.setGauge('component_browser_pool_healthy', 
      healthStatus.components.browserPool.status === 'healthy' ? 1 : 0);
    this.metrics.setGauge('component_connections_healthy',
      healthStatus.components.connections.status === 'healthy' ? 1 : 0);
    this.metrics.setGauge('component_tools_healthy',
      healthStatus.components.tools.status === 'healthy' ? 1 : 0);
    this.metrics.setGauge('component_streaming_healthy',
      healthStatus.components.streaming.status === 'healthy' ? 1 : 0);
  }

  /**
   * Check health of all components
   */
  private checkAllComponents(): HealthStatus['components'] {
    return {
      browserPool: this.checkBrowserPoolHealth(),
      connections: this.checkConnectionsHealth(),
      tools: this.checkToolsHealth(),
      streaming: this.checkStreamingHealth()
    };
  }

  /**
   * Check browser pool health
   */
  private checkBrowserPoolHealth(): HealthStatus['components']['browserPool'] {
    try {
      const poolStats = (this.browserPool as any).getStats?.() || {
        activeBrowsers: 0,
        availableBrowsers: 0,
        queuedRequests: 0
      };

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      // Check for degraded conditions
      // Note: availableBrowsers === 0 is healthy with lazy initialization
      if (poolStats.queuedRequests > 5) {
        status = 'degraded';
      }
      
      // Check for unhealthy conditions
      // Only unhealthy if there are queued requests but no way to serve them
      if (poolStats.queuedRequests > 20 ||
          (poolStats.queuedRequests > 0 && poolStats.activeBrowsers === 0 && poolStats.availableBrowsers === 0)) {
        status = 'unhealthy';
      }

      return {
        status,
        activeBrowsers: poolStats.activeBrowsers,
        availableBrowsers: poolStats.availableBrowsers,
        queuedRequests: poolStats.queuedRequests
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        activeBrowsers: 0,
        availableBrowsers: 0,
        queuedRequests: 0
      };
    }
  }

  /**
   * Check connections health
   */
  private checkConnectionsHealth(): HealthStatus['components']['connections'] {
    try {
      const connectionStats = (this.connectionManager as any).getStats?.() || {
        totalConnections: 0,
        oldestConnection: null
      };

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      let oldestConnectionAge: number | undefined;

      if (connectionStats.oldestConnection) {
        oldestConnectionAge = Math.floor(
          (Date.now() - new Date(connectionStats.oldestConnection).getTime()) / 1000
        );
        
        // Check for degraded conditions (connections older than 1 hour)
        if (oldestConnectionAge > 3600) {
          status = 'degraded';
        }
        
        // Check for unhealthy conditions (connections older than 6 hours)
        if (oldestConnectionAge > 21600) {
          status = 'unhealthy';
        }
      }

      // Too many connections might indicate a problem
      if (connectionStats.totalConnections > 100) {
        status = 'degraded';
      }
      if (connectionStats.totalConnections > 500) {
        status = 'unhealthy';
      }

      return {
        status,
        totalConnections: connectionStats.totalConnections,
        oldestConnectionAge
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        totalConnections: 0
      };
    }
  }

  /**
   * Check tools health
   */
  private checkToolsHealth(): HealthStatus['components']['tools'] {
    try {
      const toolStats = (this.toolRegistry as any).getStats?.() || {
        totalTools: 0
      };

      // Get recent tool failures from metrics
      const recentMetrics = this.metrics.getMetrics().filter(metric => 
        metric.name === MetricNames.TOOL_ERRORS_TOTAL &&
        new Date(metric.timestamp).getTime() > Date.now() - 300000 // last 5 minutes
      );
      
      const recentFailures = recentMetrics.reduce((sum, metric) => sum + metric.value, 0);

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      // Check for degraded conditions
      if (recentFailures > 5 || toolStats.totalTools === 0) {
        status = 'degraded';
      }
      
      // Check for unhealthy conditions
      if (recentFailures > 20) {
        status = 'unhealthy';
      }

      return {
        status,
        totalTools: toolStats.totalTools,
        recentFailures
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        totalTools: 0,
        recentFailures: 0
      };
    }
  }

  /**
   * Check streaming health
   */
  private checkStreamingHealth(): HealthStatus['components']['streaming'] {
    try {
      const streamingStats = this.streamingManager.getStats();
      
      // Get recent streaming errors from metrics
      const recentMetrics = this.metrics.getMetrics().filter(metric => 
        metric.name === 'streaming_errors_total' &&
        new Date(metric.timestamp).getTime() > Date.now() - 300000 // last 5 minutes
      );
      
      const streamingErrors = recentMetrics.reduce((sum, metric) => sum + metric.value, 0);

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      // Check for degraded conditions
      if (streamingErrors > 3 || streamingStats.activeStreams > 50) {
        status = 'degraded';
      }
      
      // Check for unhealthy conditions
      if (streamingErrors > 10 || streamingStats.activeStreams > 200) {
        status = 'unhealthy';
      }

      return {
        status,
        activeStreams: streamingStats.activeStreams,
        streamingErrors
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        activeStreams: 0,
        streamingErrors: 0
      };
    }
  }

  /**
   * Get performance indicators
   */
  private getPerformanceIndicators(): HealthStatus['performance'] {
    const recentMetrics = this.metrics.getPerformanceMetrics(300000); // 5 minutes
    
    return {
      averageResponseTime: recentMetrics.averageResponseTime,
      errorRate: 1 - recentMetrics.successRate,
      memoryUsage: this.getMemoryUsage(),
      cpuUsage: this.getCpuUsage()
    };
  }

  /**
   * Determine overall health based on components and performance
   */
  private determineOverallHealth(
    components: HealthStatus['components'], 
    performance: HealthStatus['performance']
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const componentStatuses = [
      components.browserPool.status,
      components.connections.status,
      components.tools.status,
      components.streaming.status
    ];

    // If any component is unhealthy, system is unhealthy
    if (componentStatuses.includes('unhealthy')) {
      return 'unhealthy';
    }

    // Check performance thresholds
    const isDegraded = 
      performance.errorRate > this.config.degradedThresholds.errorRate ||
      performance.averageResponseTime > this.config.degradedThresholds.responseTime ||
      performance.memoryUsage > this.config.degradedThresholds.memoryUsage;

    const isUnhealthy = 
      performance.errorRate > this.config.unhealthyThresholds.errorRate ||
      performance.averageResponseTime > this.config.unhealthyThresholds.responseTime ||
      performance.memoryUsage > this.config.unhealthyThresholds.memoryUsage;

    if (isUnhealthy) {
      return 'unhealthy';
    }

    if (isDegraded || componentStatuses.includes('degraded')) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Get system uptime in seconds
   */
  private getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get current memory usage in bytes
   */
  private getMemoryUsage(): number {
    try {
      return process.memoryUsage().heapUsed;
    } catch {
      return 0;
    }
  }

  /**
   * Get CPU usage percentage (simplified)
   */
  private getCpuUsage(): number | undefined {
    // CPU usage monitoring would require additional libraries
    // For now, return undefined to indicate it's not available
    return undefined;
  }

  /**
   * Start periodic health check timer
   */
  private startHealthCheckTimer(): void {
    setInterval(() => {
      this.recordHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }
}