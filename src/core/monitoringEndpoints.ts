/**
 * HTTP endpoints for monitoring dashboard and metrics exposition.
 * 
 * Provides comprehensive monitoring endpoints for health checks,
 * metrics, performance data, and error tracking.
 */

import express from 'express';
import type { IMonitorManager } from '../types/monitoring.js';

/**
 * Setup monitoring endpoints on an Express app
 */
export function setupMonitoringEndpoints(app: express.Application, monitor: IMonitorManager): void {
  
  /**
   * Enhanced health endpoint with detailed component status
   */
  app.get('/health', (req, res) => {
    try {
      const healthStatus = monitor.health.getHealthStatus();
      
      // Set appropriate HTTP status based on health
      let httpStatus = 200;
      if (healthStatus.status === 'degraded') {
        httpStatus = 200; // Still operational but with warnings
      } else if (healthStatus.status === 'unhealthy') {
        httpStatus = 503; // Service unavailable
      }

      res.status(httpStatus).json(healthStatus);
    } catch (error) {
      monitor.logger.error('Health check failed', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Simple health check endpoint for load balancers
   */
  app.get('/health/live', (req, res) => {
    try {
      const isHealthy = monitor.health.isHealthy();
      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'ok' : 'unhealthy',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Readiness check for Kubernetes deployments
   */
  app.get('/health/ready', (req, res) => {
    try {
      const healthStatus = monitor.health.getHealthStatus();
      const isReady = healthStatus.status !== 'unhealthy';
      
      res.status(isReady ? 200 : 503).json({
        status: isReady ? 'ready' : 'not-ready',
        components: healthStatus.components,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Prometheus-style metrics endpoint
   */
  app.get('/metrics', (req, res) => {
    try {
      const metrics = monitor.metrics.getMetrics();
      const prometheusFormat = convertToPrometheusFormat(metrics);
      
      res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(prometheusFormat);
    } catch (error) {
      monitor.logger.error('Metrics endpoint failed', error instanceof Error ? error : new Error(String(error)));
      res.status(500).send('# Error generating metrics\n');
    }
  });

  /**
   * JSON metrics endpoint for custom dashboards
   */
  app.get('/metrics/json', (req, res) => {
    try {
      const windowMs = parseInt(req.query.window as string) || 300000; // 5 minutes default
      const performanceMetrics = monitor.metrics.getPerformanceMetrics(windowMs);
      
      res.json({
        performance: performanceMetrics,
        raw_metrics: monitor.metrics.getMetrics().slice(-100), // Last 100 metrics
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      monitor.logger.error('JSON metrics endpoint failed', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        error: 'Failed to generate metrics',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Performance dashboard endpoint
   */
  app.get('/dashboard/performance', (req, res) => {
    try {
      const windowMs = parseInt(req.query.window as string) || 3600000; // 1 hour default
      const performanceMetrics = monitor.metrics.getPerformanceMetrics(windowMs);
      const systemStats = monitor.getSystemStats();
      const healthStatus = monitor.health.getHealthStatus();

      const dashboard = {
        overview: {
          status: healthStatus.status,
          uptime: systemStats.uptime,
          version: systemStats.version,
          memoryUsageMB: Math.round(systemStats.memoryUsage / 1024 / 1024)
        },
        performance: performanceMetrics,
        components: healthStatus.components,
        window: {
          duration: windowMs,
          start: performanceMetrics.windowStart,
          end: performanceMetrics.windowEnd
        },
        timestamp: new Date().toISOString()
      };

      res.json(dashboard);
    } catch (error) {
      monitor.logger.error('Performance dashboard failed', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        error: 'Failed to generate performance dashboard',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Error tracking and analysis endpoint
   */
  app.get('/dashboard/errors', (req, res) => {
    try {
      const windowMs = parseInt(req.query.window as string) || 3600000; // 1 hour default
      const errorSummary = monitor.getErrorSummary(windowMs);

      res.json({
        ...errorSummary,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      monitor.logger.error('Error dashboard failed', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        error: 'Failed to generate error dashboard',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Recent logs endpoint for debugging
   */
  app.get('/dashboard/logs', (req, res) => {
    try {
      const count = parseInt(req.query.count as string) || 100;
      const level = req.query.level as string;
      
      // Access recent logs from structured logger
      const structuredLogger = monitor.logger as any;
      const recentLogs = structuredLogger.getRecentLogs ? 
        structuredLogger.getRecentLogs(count, level) : [];

      res.json({
        logs: recentLogs,
        count: recentLogs.length,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      monitor.logger.error('Logs endpoint failed', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        error: 'Failed to retrieve logs',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Configuration and system info endpoint
   */
  app.get('/dashboard/info', (req, res) => {
    try {
      const systemStats = monitor.getSystemStats();
      const healthStatus = monitor.health.getHealthStatus();

      const info = {
        system: {
          version: systemStats.version,
          uptime: systemStats.uptime,
          memoryUsage: systemStats.memoryUsage,
          platform: process.platform,
          nodeVersion: process.version,
          pid: process.pid
        },
        server: {
          name: 'mcp-web-scraper',
          version: '1.0.0',
          mcpCompliant: true,
          features: [
            'progress_notifications',
            'streaming_responses', 
            'structured_logging',
            'health_monitoring',
            'metrics_collection'
          ]
        },
        components: healthStatus.components,
        timestamp: new Date().toISOString()
      };

      res.json(info);
    } catch (error) {
      monitor.logger.error('Info endpoint failed', error instanceof Error ? error : new Error(String(error)));
      res.status(500).json({
        error: 'Failed to retrieve system info',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Simple monitoring dashboard HTML page
   */
  app.get('/dashboard', (req, res) => {
    const dashboardHtml = generateDashboardHtml();
    res.send(dashboardHtml);
  });
}

/**
 * Convert metrics to Prometheus format
 */
function convertToPrometheusFormat(metrics: any[]): string {
  const promLines: string[] = [];
  const metricGroups = new Map<string, any[]>();

  // Group metrics by name
  for (const metric of metrics) {
    const group = metricGroups.get(metric.name) || [];
    group.push(metric);
    metricGroups.set(metric.name, group);
  }

  // Convert each metric group
  for (const [name, group] of metricGroups) {
    const latestMetric = group[group.length - 1];
    
    // Add help and type comments
    promLines.push(`# HELP ${name} ${getMetricHelp(name)}`);
    promLines.push(`# TYPE ${name} ${getPrometheusType(latestMetric.type)}`);
    
    // Add metric values
    for (const metric of group) {
      const labels = formatPrometheusLabels(metric.labels || {});
      const timestamp = new Date(metric.timestamp).getTime();
      promLines.push(`${name}${labels} ${metric.value} ${timestamp}`);
    }
    
    promLines.push('');
  }

  return promLines.join('\n');
}

/**
 * Get metric help text
 */
function getMetricHelp(metricName: string): string {
  const helpTexts: Record<string, string> = {
    'requests_total': 'Total number of requests processed',
    'errors_total': 'Total number of errors encountered',
    'response_time_ms': 'Response time in milliseconds',
    'active_connections': 'Number of active connections',
    'active_browsers': 'Number of active browser instances',
    'memory_usage_bytes': 'Memory usage in bytes',
    'uptime_seconds': 'Server uptime in seconds'
  };
  
  return helpTexts[metricName] || `Metric: ${metricName}`;
}

/**
 * Convert metric type to Prometheus type
 */
function getPrometheusType(metricType: string): string {
  const typeMap: Record<string, string> = {
    'counter': 'counter',
    'gauge': 'gauge',
    'histogram': 'histogram',
    'timer': 'histogram'
  };
  
  return typeMap[metricType] || 'gauge';
}

/**
 * Format labels for Prometheus
 */
function formatPrometheusLabels(labels: Record<string, string>): string {
  const labelPairs = Object.entries(labels)
    .map(([key, value]) => `${key}="${value}"`)
    .join(',');
  
  return labelPairs ? `{${labelPairs}}` : '';
}

/**
 * Generate simple HTML dashboard
 */
function generateDashboardHtml(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Playwright Server - Monitoring Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .status-healthy { color: #28a745; font-weight: bold; }
        .status-degraded { color: #ffc107; font-weight: bold; }
        .status-unhealthy { color: #dc3545; font-weight: bold; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
        .metric { background: #f8f9fa; padding: 15px; border-radius: 4px; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007bff; }
        .links { margin: 20px 0; }
        .links a { margin-right: 15px; color: #007bff; text-decoration: none; }
        .links a:hover { text-decoration: underline; }
        pre { background: #f8f9fa; padding: 15px; border-radius: 4px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>MCP Playwright Server - Monitoring Dashboard</h1>
        
        <div class="card">
            <h2>Quick Links</h2>
            <div class="links">
                <a href="/health" target="_blank">Health Status</a>
                <a href="/metrics" target="_blank">Metrics (Prometheus)</a>
                <a href="/metrics/json" target="_blank">Metrics (JSON)</a>
                <a href="/dashboard/performance" target="_blank">Performance Data</a>
                <a href="/dashboard/errors" target="_blank">Error Analysis</a>
                <a href="/dashboard/logs" target="_blank">Recent Logs</a>
                <a href="/dashboard/info" target="_blank">System Info</a>
            </div>
        </div>

        <div class="card">
            <h2>Real-time Status</h2>
            <div id="status-container">
                <p>Loading status...</p>
            </div>
        </div>

        <div class="card">
            <h2>Performance Metrics</h2>
            <div id="metrics-container">
                <p>Loading metrics...</p>
            </div>
        </div>
    </div>

    <script>
        // Auto-refresh dashboard data
        async function refreshData() {
            try {
                // Fetch health status
                const healthResponse = await fetch('/health');
                const health = await healthResponse.json();
                
                // Fetch performance metrics
                const metricsResponse = await fetch('/dashboard/performance');
                const metrics = await metricsResponse.json();
                
                updateStatusDisplay(health);
                updateMetricsDisplay(metrics);
            } catch (error) {
                console.error('Failed to refresh data:', error);
            }
        }
        
        function updateStatusDisplay(health) {
            const container = document.getElementById('status-container');
            const statusClass = 'status-' + health.status;
            
            container.innerHTML = \`
                <div class="metrics-grid">
                    <div class="metric">
                        <div>Overall Status</div>
                        <div class="metric-value \${statusClass}">\${health.status.toUpperCase()}</div>
                    </div>
                    <div class="metric">
                        <div>Uptime</div>
                        <div class="metric-value">\${Math.floor(health.uptime / 60)} min</div>
                    </div>
                    <div class="metric">
                        <div>Memory Usage</div>
                        <div class="metric-value">\${Math.round(health.performance.memoryUsage / 1024 / 1024)} MB</div>
                    </div>
                    <div class="metric">
                        <div>Error Rate</div>
                        <div class="metric-value">\${(health.performance.errorRate * 100).toFixed(2)}%</div>
                    </div>
                </div>
            \`;
        }
        
        function updateMetricsDisplay(metrics) {
            const container = document.getElementById('metrics-container');
            
            container.innerHTML = \`
                <div class="metrics-grid">
                    <div class="metric">
                        <div>Requests</div>
                        <div class="metric-value">\${metrics.performance.requestCount}</div>
                    </div>
                    <div class="metric">
                        <div>Success Rate</div>
                        <div class="metric-value">\${(metrics.performance.successRate * 100).toFixed(1)}%</div>
                    </div>
                    <div class="metric">
                        <div>Avg Response Time</div>
                        <div class="metric-value">\${Math.round(metrics.performance.averageResponseTime)}ms</div>
                    </div>
                    <div class="metric">
                        <div>Active Connections</div>
                        <div class="metric-value">\${metrics.performance.activeConnections}</div>
                    </div>
                    <div class="metric">
                        <div>Active Browsers</div>
                        <div class="metric-value">\${metrics.performance.activeBrowsers}</div>
                    </div>
                    <div class="metric">
                        <div>Streaming Operations</div>
                        <div class="metric-value">\${metrics.performance.streamingOperations}</div>
                    </div>
                </div>
            \`;
        }
        
        // Initial load and set up auto-refresh
        refreshData();
        setInterval(refreshData, 10000); // Refresh every 10 seconds
    </script>
</body>
</html>
  `;
}