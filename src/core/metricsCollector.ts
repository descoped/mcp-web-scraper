/**
 * Metrics collection and aggregation for production monitoring.
 *
 * Provides comprehensive metrics tracking including counters, gauges,
 * histograms, and performance measurements for the MCP server.
 */

import {IMetricsCollector, MetricEntry, MetricType, MonitoringConfig, PerformanceMetrics} from '@/types/monitoring.js';

/**
 * Histogram bucket configuration for response time measurements
 */
const DEFAULT_HISTOGRAM_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

/**
 * Metrics collector implementation with in-memory storage
 */
export class MetricsCollector implements IMetricsCollector {
    private readonly config: MonitoringConfig['metrics'];
    private readonly metrics: Map<string, MetricEntry[]> = new Map();
    private readonly timers: Map<string, number> = new Map();

    // Aggregated metrics for quick access
    private counters: Map<string, number> = new Map();
    private gauges: Map<string, number> = new Map();
    private histograms: Map<string, number[]> = new Map();

    constructor(config: MonitoringConfig['metrics']) {
        this.config = config;
        this.startCleanupTimer();
    }

    /**
     * Increment a counter metric
     */
    incrementCounter(name: string, labels: Record<string, string> = {}, value: number = 1): void {
        if (!this.config.enableMetrics) return;

        const metricKey = this.createMetricKey(name, labels);
        const currentValue = this.counters.get(metricKey) || 0;
        this.counters.set(metricKey, currentValue + value);

        this.recordMetric({
            name,
            type: MetricType.COUNTER,
            value: currentValue + value,
            timestamp: new Date().toISOString(),
            labels
        });
    }

    /**
     * Set a gauge metric value
     */
    setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
        if (!this.config.enableMetrics) return;

        const metricKey = this.createMetricKey(name, labels);
        this.gauges.set(metricKey, value);

        this.recordMetric({
            name,
            type: MetricType.GAUGE,
            value,
            timestamp: new Date().toISOString(),
            labels
        });
    }

    /**
     * Record a value in a histogram
     */
    recordHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
        if (!this.config.enableMetrics) return;

        const metricKey = this.createMetricKey(name, labels);
        const values = this.histograms.get(metricKey) || [];
        values.push(value);
        this.histograms.set(metricKey, values);

        // Calculate percentiles for this histogram
        const sortedValues = [...values].sort((a, b) => a - b);
        const percentiles = this.calculatePercentiles(sortedValues);

        this.recordMetric({
            name,
            type: MetricType.HISTOGRAM,
            value,
            timestamp: new Date().toISOString(),
            labels,
            buckets: DEFAULT_HISTOGRAM_BUCKETS,
            percentiles
        });
    }

    /**
     * Start a timer and return a function to stop it
     */
    startTimer(name: string, labels: Record<string, string> = {}): () => void {
        const timerKey = `${name}:${JSON.stringify(labels)}:${Date.now()}`;
        this.timers.set(timerKey, Date.now());

        return () => {
            const startTime = this.timers.get(timerKey);
            if (startTime) {
                const duration = Date.now() - startTime;
                this.recordTiming(name, duration, labels);
                this.timers.delete(timerKey);
            }
        };
    }

    /**
     * Record a timing measurement
     */
    recordTiming(name: string, duration: number, labels: Record<string, string> = {}): void {
        if (!this.config.enableMetrics) return;

        this.recordMetric({
            name,
            type: MetricType.TIMER,
            value: duration,
            unit: 'ms',
            timestamp: new Date().toISOString(),
            labels
        });

        // Also record as histogram for percentile calculations
        this.recordHistogram(`${name}_histogram`, duration, labels);
    }

    /**
     * Get all metrics
     */
    getMetrics(): MetricEntry[] {
        const allMetrics: MetricEntry[] = [];

        for (const metricEntries of this.metrics.values()) {
            allMetrics.push(...metricEntries);
        }

        return allMetrics.sort((a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }

    /**
     * Get aggregated performance metrics for a time window
     */
    getPerformanceMetrics(windowMs: number = 60000): PerformanceMetrics {
        const now = Date.now();
        const windowStart = new Date(now - windowMs);
        const windowEnd = new Date(now);

        // Filter metrics to the time window
        const windowMetrics = this.getMetrics().filter(metric => {
            const metricTime = new Date(metric.timestamp).getTime();
            return metricTime >= windowStart.getTime() && metricTime <= windowEnd.getTime();
        });

        // Calculate aggregated metrics
        const requestMetrics = windowMetrics.filter(m => m.name === 'requests_total');
        const errorMetrics = windowMetrics.filter(m => m.name === 'errors_total');
        const responseTimeMetrics = windowMetrics.filter(m => m.name.includes('response_time'));

        const requestCount = this.sumMetricValues(requestMetrics);
        const errorCount = this.sumMetricValues(errorMetrics);
        const successRate = requestCount > 0 ? (requestCount - errorCount) / requestCount : 1;

        // Response time percentiles
        const responseTimes = responseTimeMetrics.map(m => m.value);
        const sortedResponseTimes = responseTimes.sort((a, b) => a - b);

        const performanceMetrics: PerformanceMetrics = {
            requestCount,
            errorCount,
            successRate,

            averageResponseTime: responseTimes.length > 0 ?
                responseTimes.reduce((sum, val) => sum + val, 0) / responseTimes.length : 0,
            p50ResponseTime: this.getPercentile(sortedResponseTimes, 50),
            p95ResponseTime: this.getPercentile(sortedResponseTimes, 95),
            p99ResponseTime: this.getPercentile(sortedResponseTimes, 99),

            activeConnections: this.getLatestGaugeValue('active_connections'),
            activeBrowsers: this.getLatestGaugeValue('active_browsers'),
            memoryUsageMB: Math.round(this.getLatestGaugeValue('memory_usage_bytes') / 1024 / 1024),

            toolExecutions: this.getToolExecutionCounts(windowMetrics),
            consentSuccessRate: this.getConsentSuccessRate(windowMetrics),
            streamingOperations: this.getLatestGaugeValue('streaming_operations'),

            windowStart: windowStart.toISOString(),
            windowEnd: windowEnd.toISOString(),
            windowDurationMs: windowMs
        };

        return performanceMetrics;
    }

    /**
     * Clear all metrics
     */
    clearMetrics(): void {
        this.metrics.clear();
        this.counters.clear();
        this.gauges.clear();
        this.histograms.clear();
        this.timers.clear();
    }

    /**
     * Record a metric entry
     */
    private recordMetric(metric: MetricEntry): void {
        const key = this.createMetricKey(metric.name, metric.labels);
        const entries = this.metrics.get(key) || [];
        entries.push(metric);
        this.metrics.set(key, entries);

        // Limit the number of entries to prevent memory leaks
        if (entries.length > this.config.maxMetricEntries) {
            entries.splice(0, entries.length - this.config.maxMetricEntries);
        }
    }

    /**
     * Create a unique key for metric storage
     */
    private createMetricKey(name: string, labels: Record<string, string>): string {
        const labelString = Object.entries(labels)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}="${value}"`)
            .join(',');

        return labelString ? `${name}{${labelString}}` : name;
    }

    /**
     * Calculate percentiles for a sorted array of values
     */
    private calculatePercentiles(sortedValues: number[]): Record<string, number> {
        if (sortedValues.length === 0) {
            return {};
        }

        const percentiles = [50, 75, 90, 95, 99];
        const result: Record<string, number> = {};

        for (const p of percentiles) {
            result[`p${p}`] = this.getPercentile(sortedValues, p);
        }

        return result;
    }

    /**
     * Get a specific percentile from sorted values
     */
    private getPercentile(sortedValues: number[], percentile: number): number {
        if (sortedValues.length === 0) return 0;

        const index = Math.ceil((percentile / 100) * sortedValues.length) - 1;
        const safeIndex = Math.max(0, Math.min(index, sortedValues.length - 1));
        return sortedValues[safeIndex] || 0;
    }

    /**
     * Sum values from metric entries
     */
    private sumMetricValues(metrics: MetricEntry[]): number {
        return metrics.reduce((sum, metric) => sum + metric.value, 0);
    }

    /**
     * Get the latest gauge value for a metric
     */
    private getLatestGaugeValue(metricName: string): number {
        const gaugeMetrics = this.getMetrics()
            .filter(m => m.name === metricName && m.type === MetricType.GAUGE)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return gaugeMetrics.length > 0 ? (gaugeMetrics[0]?.value || 0) : 0;
    }

    /**
     * Get tool execution counts from metrics
     */
    private getToolExecutionCounts(metrics: MetricEntry[]): Record<string, number> {
        const toolMetrics = metrics.filter(m =>
            m.name === 'tool_executions_total' && m.labels?.tool_name
        );

        const counts: Record<string, number> = {};
        for (const metric of toolMetrics) {
            const toolName = metric.labels?.tool_name;
            if (toolName) {
                counts[toolName] = (counts[toolName] || 0) + metric.value;
            }
        }

        return counts;
    }

    /**
     * Calculate consent handling success rate
     */
    private getConsentSuccessRate(metrics: MetricEntry[]): number {
        const consentMetrics = metrics.filter(m => m.name === 'consent_handling_total');
        const successMetrics = consentMetrics.filter(m => m.labels?.result === 'success');

        const total = this.sumMetricValues(consentMetrics);
        const successful = this.sumMetricValues(successMetrics);

        return total > 0 ? successful / total : 1;
    }

    /**
     * Start cleanup timer to remove old metrics
     */
    private startCleanupTimer(): void {
        setInterval(() => {
            this.cleanupOldMetrics();
        }, this.config.aggregationIntervalMs);
    }

    /**
     * Remove metrics older than retention period
     */
    private cleanupOldMetrics(): void {
        const cutoffTime = Date.now() - (this.config.metricsRetentionHours * 60 * 60 * 1000);

        for (const [key, entries] of this.metrics.entries()) {
            const filteredEntries = entries.filter(entry =>
                new Date(entry.timestamp).getTime() > cutoffTime
            );

            if (filteredEntries.length > 0) {
                this.metrics.set(key, filteredEntries);
            } else {
                this.metrics.delete(key);
            }
        }
    }
}

/**
 * Common metric names used throughout the application
 */
export const MetricNames = {
    // Request metrics
    REQUESTS_TOTAL: 'requests_total',
    ERRORS_TOTAL: 'errors_total',
    RESPONSE_TIME: 'response_time_ms',

    // Tool metrics
    TOOL_EXECUTIONS_TOTAL: 'tool_executions_total',
    TOOL_EXECUTION_TIME: 'tool_execution_time_ms',
    TOOL_ERRORS_TOTAL: 'tool_errors_total',

    // Browser metrics
    ACTIVE_BROWSERS: 'active_browsers',
    BROWSER_ACQUISITION_TIME: 'browser_acquisition_time_ms',
    BROWSER_ERRORS_TOTAL: 'browser_errors_total',

    // Connection metrics
    ACTIVE_CONNECTIONS: 'active_connections',
    CONNECTION_DURATION: 'connection_duration_ms',

    // Consent metrics
    CONSENT_HANDLING_TOTAL: 'consent_handling_total',
    CONSENT_HANDLING_TIME: 'consent_handling_time_ms',

    // Streaming metrics
    STREAMING_OPERATIONS: 'streaming_operations',
    STREAMING_EVENTS_TOTAL: 'streaming_events_total',
    STREAMING_CHUNK_SIZE: 'streaming_chunk_size_bytes',

    // System metrics
    MEMORY_USAGE_BYTES: 'memory_usage_bytes',
    CPU_USAGE_PERCENT: 'cpu_usage_percent',
    UPTIME_SECONDS: 'uptime_seconds'
} as const;