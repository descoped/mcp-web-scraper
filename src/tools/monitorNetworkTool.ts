/**
 * Network monitoring tool for tracking HTTP requests and responses
 * Provides comprehensive network activity monitoring capabilities
 */

import {zodToJsonSchema} from 'zod-to-json-schema';
import {BaseTool} from '../core/toolRegistry.js';
import type {NavigationToolContext, NetworkMonitorArgs, ToolResult} from '../types/index.js';
import {NetworkMonitorArgsSchema} from '../types/index.js';

interface NetworkRequest {
    url: string;
    method: string;
    status?: number;
    statusText?: string;
    headers: Record<string, string>;
    timestamp: string;
    duration?: number;
    size?: number;
    responseHeaders?: Record<string, string>;
}

// Store for network requests per session
const networkStorage = new Map<string, NetworkRequest[]>();

export class MonitorNetworkTool extends BaseTool {
    public readonly name = 'monitor_network';
    public readonly description = 'Monitor network requests and responses for a browser session';
    public readonly inputSchema = zodToJsonSchema(NetworkMonitorArgsSchema);

    async execute(args: Record<string, unknown>, context: NavigationToolContext): Promise<ToolResult> {
        const validatedArgs = this.validateArgs<NetworkMonitorArgs>(args, NetworkMonitorArgsSchema);

        if (!context.pageManager) {
            throw new Error('Page manager not available. Use navigation tools to create a session first.');
        }

        const session = await context.pageManager.getSession(validatedArgs.sessionId);
        if (!session) {
            throw new Error(`Session ${validatedArgs.sessionId} not found`);
        }

        switch (validatedArgs.action) {
            case 'start':
                return await this.startMonitoring(session, validatedArgs, context);

            case 'stop':
                return await this.stopMonitoring(session, validatedArgs, context);

            case 'get':
                return await this.getNetworkData(session, validatedArgs, context);

            default:
                throw new Error(`Unknown action: ${validatedArgs.action}`);
        }
    }

    private async startMonitoring(session: any, args: NetworkMonitorArgs, context: NavigationToolContext): Promise<ToolResult> {
        const requests: NetworkRequest[] = [];
        networkStorage.set(args.sessionId, requests);

        // Listen to request events
        session.page.on('request', (request: any) => {
            const shouldInclude = !args.filterUrl || request.url().includes(args.filterUrl);

            if (shouldInclude) {
                const networkRequest: NetworkRequest = {
                    url: request.url(),
                    method: request.method(),
                    headers: request.headers(),
                    timestamp: new Date().toISOString()
                };
                requests.push(networkRequest);
            }
        });

        // Listen to response events
        session.page.on('response', (response: any) => {
            const shouldInclude = !args.filterUrl || response.url().includes(args.filterUrl);

            if (shouldInclude) {
                // Find the corresponding request and update it
                const existingRequest = requests.find(req =>
                    req.url === response.url() && !req.status
                );

                if (existingRequest) {
                    existingRequest.status = response.status();
                    existingRequest.statusText = response.statusText();
                    existingRequest.responseHeaders = response.headers();
                    existingRequest.duration = Date.now() - new Date(existingRequest.timestamp).getTime();
                } else {
                    // Response without matching request (could be from before monitoring started)
                    const networkRequest: NetworkRequest = {
                        url: response.url(),
                        method: 'GET', // Default for responses without request
                        status: response.status(),
                        statusText: response.statusText(),
                        headers: {},
                        responseHeaders: response.headers(),
                        timestamp: new Date().toISOString()
                    };
                    requests.push(networkRequest);
                }
            }
        });

        return this.createResult({
            sessionId: session.id,
            url: session.url,
            timestamp: new Date().toISOString(),
            action: 'start',
            monitoring: true,
            filterUrl: args.filterUrl,
            message: 'Network monitoring started'
        });
    }

    private async stopMonitoring(session: any, args: NetworkMonitorArgs, context: NavigationToolContext): Promise<ToolResult> {
        // Remove all listeners
        session.page.removeAllListeners('request');
        session.page.removeAllListeners('response');

        const requests = networkStorage.get(args.sessionId) || [];

        return this.createResult({
            sessionId: session.id,
            url: session.url,
            timestamp: new Date().toISOString(),
            action: 'stop',
            monitoring: false,
            totalRequests: requests.length,
            message: 'Network monitoring stopped'
        });
    }

    private async getNetworkData(session: any, args: NetworkMonitorArgs, context: NavigationToolContext): Promise<ToolResult> {
        const requests = networkStorage.get(args.sessionId) || [];

        // Filter requests if filterUrl is provided
        const filteredRequests = args.filterUrl
            ? requests.filter(req => req.url.includes(args.filterUrl!))
            : requests;

        // Analyze the requests
        const analysis = {
            totalRequests: filteredRequests.length,
            methods: this.analyzeByMethod(filteredRequests),
            statusCodes: this.analyzeByStatus(filteredRequests),
            domains: this.analyzeByDomain(filteredRequests),
            averageResponseTime: this.calculateAverageResponseTime(filteredRequests),
            failedRequests: filteredRequests.filter(req => req.status && req.status >= 400).length
        };

        return this.createResult({
            sessionId: session.id,
            url: session.url,
            timestamp: new Date().toISOString(),
            action: 'get',
            requests: filteredRequests,
            analysis,
            filterUrl: args.filterUrl
        });
    }

    private analyzeByMethod(requests: NetworkRequest[]): Record<string, number> {
        return requests.reduce((acc, req) => {
            acc[req.method] = (acc[req.method] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }

    private analyzeByStatus(requests: NetworkRequest[]): Record<string, number> {
        return requests.reduce((acc, req) => {
            if (req.status) {
                const statusRange = `${Math.floor(req.status / 100)}xx`;
                acc[statusRange] = (acc[statusRange] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);
    }

    private analyzeByDomain(requests: NetworkRequest[]): Record<string, number> {
        return requests.reduce((acc, req) => {
            try {
                const domain = new URL(req.url).hostname;
                acc[domain] = (acc[domain] || 0) + 1;
            } catch {
                acc['invalid-url'] = (acc['invalid-url'] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);
    }

    private calculateAverageResponseTime(requests: NetworkRequest[]): number {
        const requestsWithDuration = requests.filter(req => req.duration !== undefined);
        if (requestsWithDuration.length === 0) return 0;

        const totalDuration = requestsWithDuration.reduce((sum, req) => sum + (req.duration || 0), 0);
        return Math.round(totalDuration / requestsWithDuration.length);
    }
}