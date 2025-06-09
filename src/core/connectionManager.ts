/**
 * Connection manager for handling MCP client connections
 * Provides lifecycle management and cleanup
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { IMCPConnection, IConnectionManager } from '../types/index.js';

export class MCPConnection implements IMCPConnection {
  public readonly id: string;
  public readonly createdAt: Date;
  public clientVersion: string | null = null;
  
  private readonly transport: Transport;
  private readonly server: Server;

  constructor(transport: Transport, server: Server) {
    this.transport = transport;
    this.server = server;
    this.id = this.generateConnectionId();
    this.createdAt = new Date();
    
    this.setupTransportHandlers();
  }

  private generateConnectionId(): string {
    return Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  }

  private setupTransportHandlers(): void {
    if (this.transport.onclose) {
      const originalOnClose = this.transport.onclose;
      this.transport.onclose = () => {
        console.log(`MCP connection ${this.id} closed`);
        this.cleanup();
        if (originalOnClose) {
          originalOnClose();
        }
      };
    } else {
      this.transport.onclose = () => {
        console.log(`MCP connection ${this.id} closed`);
        this.cleanup();
      };
    }

    if (this.transport.onerror) {
      const originalOnError = this.transport.onerror;
      this.transport.onerror = (error: Error) => {
        console.error(`MCP connection ${this.id} error:`, error);
        this.cleanup();
        if (originalOnError) {
          originalOnError(error);
        }
      };
    } else {
      this.transport.onerror = (error: Error) => {
        console.error(`MCP connection ${this.id} error:`, error);
        this.cleanup();
      };
    }
  }

  setClientVersion(version: string): void {
    this.clientVersion = version;
    console.log(`MCP connection ${this.id} client version: ${version}`);
  }

  cleanup(): void {
    console.log(`Cleaning up MCP connection ${this.id}`);
    // Any connection-specific cleanup can be added here
  }

  close(): void {
    if (this.transport && typeof this.transport.close === 'function') {
      this.transport.close();
    }
  }

  /**
   * Send a notification to this connection
   */
  async sendNotification(notification: { method: string; params: any }): Promise<void> {
    try {
      await this.server.notification(notification);
      console.log(`Notification sent to connection ${this.id}: ${notification.method}`);
    } catch (error) {
      console.error(`Failed to send notification to connection ${this.id}:`, error);
    }
  }

  /**
   * Get the transport for this connection
   */
  getTransport(): Transport {
    return this.transport;
  }

  /**
   * Get connection information for monitoring
   */
  getInfo(): {
    id: string;
    createdAt: Date;
    clientVersion: string | null;
    uptime: number;
  } {
    return {
      id: this.id,
      createdAt: this.createdAt,
      clientVersion: this.clientVersion,
      uptime: Date.now() - this.createdAt.getTime(),
    };
  }
}

export class ConnectionManager implements IConnectionManager {
  private readonly connections = new Map<string, IMCPConnection>();

  createConnection(transport: Transport, server: Server): IMCPConnection {
    const connection = new MCPConnection(transport, server);
    this.connections.set(connection.id, connection);
    
    console.log(`MCP connection created: ${connection.id} (total: ${this.connections.size})`);
    
    return connection;
  }

  getConnection(id: string): IMCPConnection | undefined {
    return this.connections.get(id);
  }

  getAllConnections(): IMCPConnection[] {
    return Array.from(this.connections.values());
  }

  removeConnection(id: string): void {
    const connection = this.connections.get(id);
    if (connection) {
      connection.cleanup();
      this.connections.delete(id);
      console.log(`MCP connection removed: ${id} (remaining: ${this.connections.size})`);
    }
  }

  cleanup(): void {
    console.log(`Cleaning up all MCP connections (${this.connections.size})`);
    
    for (const [id, connection] of this.connections) {
      try {
        connection.close();
        connection.cleanup();
      } catch (error) {
        console.error(`Error cleaning up connection ${id}:`, error);
      }
    }
    
    this.connections.clear();
    console.log('Connection manager cleanup completed');
  }

  /**
   * Broadcast a notification to all active connections
   */
  async broadcastNotification(notification: { method: string; params: any }): Promise<void> {
    const connections = Array.from(this.connections.values());
    
    if (connections.length === 0) {
      console.log(`No active connections to broadcast ${notification.method}`);
      return;
    }

    console.log(`Broadcasting ${notification.method} to ${connections.length} connections`);
    
    const promises = connections.map(async (connection) => {
      try {
        await connection.sendNotification(notification);
      } catch (error) {
        console.error(`Failed to broadcast to connection ${connection.id}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Get connection statistics for monitoring
   */
  getStats(): {
    totalConnections: number;
    connectionIds: string[];
    oldestConnection: Date | null;
    newestConnection: Date | null;
  } {
    const connections = Array.from(this.connections.values());
    
    return {
      totalConnections: connections.length,
      connectionIds: connections.map(c => c.id),
      oldestConnection: connections.length > 0 ? 
        new Date(Math.min(...connections.map(c => c.createdAt.getTime()))) : null,
      newestConnection: connections.length > 0 ? 
        new Date(Math.max(...connections.map(c => c.createdAt.getTime()))) : null,
    };
  }
}