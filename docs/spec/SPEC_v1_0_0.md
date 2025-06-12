# MCP Web Scraper Specification v1.0

## Overview

The MCP Web Scraper is a production-ready TypeScript service that implements the Model Context Protocol (MCP) for
intelligent web scraping with advanced cookie consent handling. It provides a comprehensive browser automation platform
with real-time capabilities, monitoring, and enterprise-grade features.

## System Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Web Scraper                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ MCP Protocol    │  │ Browser Pool    │  │ Monitoring  │  │
│  │ Layer           │  │ Management      │  │ System      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ Cookie Consent  │  │ Progress        │  │ Rate        │  │
│  │ Engine          │  │ Tracking        │  │ Limiting    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  │
│  │ Tool Registry   │  │ Connection      │  │ Streaming   │  │
│  │ (29 Tools)      │  │ Manager         │  │ Manager     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Runtime**: Node.js 18+
- **Language**: TypeScript with strict type safety
- **Browser Engine**: Playwright (Chromium, Firefox, WebKit)
- **Protocol**: Model Context Protocol (MCP) v1.0
- **Transport**: HTTP + Server-Sent Events (SSE)
- **Validation**: Zod schema validation
- **Containerization**: Docker with multi-stage builds

## API Specification

### MCP Protocol Endpoints

#### Primary MCP Interface

```
GET /mcp
Content-Type: text/event-stream
```

Establishes persistent SSE connection for MCP protocol communication.

#### MCP Request Handler

```
POST /mcp-request
Content-Type: application/json
```

Handles JSON-RPC 2.0 requests for MCP protocol operations.

### System Endpoints

#### Health Monitoring

```
GET /health              # Overall system health
GET /health/live         # Kubernetes liveness probe  
GET /health/ready        # Kubernetes readiness probe
```

#### Metrics & Observability

```
GET /metrics             # Prometheus format metrics
GET /metrics/json        # JSON format metrics
GET /dashboard           # HTML monitoring dashboard
GET /dashboard/performance # Performance metrics API
GET /dashboard/errors    # Error analysis API
GET /dashboard/logs      # Recent logs API
GET /dashboard/info      # System information API
```

## Tool Specification

### Tool Categories (29 Total Tools)

#### 1. Core Scraping Tools (3 tools)

##### scrape_article_content

Extracts article content with intelligent cookie consent handling.

**Input Schema:**

```typescript
{
  url: string;                          // Required: Article URL
  outputFormats?: ('text' | 'html' | 'markdown')[]; // Default: ['text']
  correlation_id?: string;              // Client correlation ID
  waitForSelector?: string;             // CSS selector to wait for
  extractSelectors?: {                  // Custom extraction selectors
    title?: string;
    content?: string;
    author?: string;
    date?: string;
    summary?: string;
  };
}
```

**Output Schema:**

```typescript
{
  url: string;
  extracted: {
    title?: string;
    content?: string;
    author?: string;
    date?: string;
    summary?: string;
  };
  fullText?: string;                    // If 'text' format requested
  fullHtml?: string;                    // If 'html' format requested
  fullMarkdown?: string;                // If 'markdown' format requested
  timestamp: string;                    // ISO datetime
  cookieConsent: ConsentResult;
}
```

**Features:**

- 30+ language cookie consent detection
- Multiple output format support
- Real-time progress notifications (5 stages)
- Content streaming capabilities
- Correlation tracking for complex workflows

##### get_page_screenshot

Captures page screenshots with consent handling.

**Input Schema:**

```typescript
{
  url: string;        // Required: Page URL
  fullPage?: boolean; // Default: false (viewport only)
}
```

**Output:** Binary PNG data as base64 + metadata

##### handle_cookie_consent

Dedicated cookie consent management and testing.

**Input Schema:**

```typescript
{
  url: string;       // Required: Page URL
  timeout?: number;  // Default: 3000ms
}
```

**Output:** Detailed consent result with verification data

#### 2. Browser Interaction Tools (9 tools)

- `browser_navigate` - URL navigation with consent handling
- `browser_click` - Element clicking with smart targeting
- `browser_type` - Text input with validation
- `browser_hover` - Element hovering interactions
- `browser_select_option` - Dropdown/select handling
- `browser_press_key` - Keyboard input simulation
- `browser_handle_dialog` - Alert/confirm/prompt handling
- `browser_file_upload` - File upload automation
- `browser_close` - Session cleanup

#### 3. Advanced Features (6 tools)

- `browser_pdf_save` - PDF generation with options
- `browser_console_messages` - Console log monitoring
- `browser_resize` - Viewport manipulation
- `browser_snapshot` - Accessibility tree capture
- `browser_install` - Browser management
- `browser_generate_playwright_test` - Test generation

#### 4. Session Management (4 tools)

- `manage_tabs` - Multi-tab workflow support
- `monitor_network` - HTTP request/response analysis
- `drag_drop` - Drag and drop interactions
- `navigate_history` - Browser history navigation

#### 5. AI Vision Tools (7 tools)

- `browser_find_text` - Advanced text search
- `browser_find_element` - AI-powered element discovery
- `browser_describe_element` - Element analysis
- `browser_annotate_page` - Visual page annotation
- `browser_get_element_text` - Enhanced text extraction
- `browser_wait_for_page_state` - Conditional waiting
- `browser_execute_javascript` - Custom script execution

## Cookie Consent Engine Specification

### Detection Strategy (Priority Order)

1. **Attribute-based Detection**
    - `data-consent`, `data-cookie`
    - `aria-label*=cookie`, `title*=consent`
    - `data-testid*=consent`

2. **Framework-specific Selectors**
    - OneTrust: `#onetrust-accept-btn-handler`
    - Quantcast: `.qc-cmp2-accept-all`
    - Cookiebot: `#CybotCookiebotDialogBodyButtonAccept`
    - TrustArc: `#truste-consent-button`
    - 20+ additional frameworks

3. **Multi-language Text Patterns**
    - English: "Accept all", "Allow all", "Accept All Cookies"
    - Norwegian: "Godta alle", "Aksepter alle", "Tillat alle"
    - German: "Alle akzeptieren", "Alle Cookies akzeptieren"
    - French: "Accepter tout", "Tout accepter"
    - Spanish: "Aceptar todo", "Aceptar todas"
    - Italian: "Accetta tutto", "Accetta tutti i cookie"
    - 24+ additional languages

4. **Cross-frame Detection**
    - Iframe consent detection
    - Shadow DOM traversal
    - Dynamic content handling

### Verification System

```typescript
interface ConsentVerification {
  success: boolean;
  dialogsRemoved: boolean;           // Post-click validation
  consentCookiesSet: number;         // Cookie count verification
  noBlockingOverlays: boolean;       // Overlay removal check
  postClickDialogs: number;          // Remaining dialog count
  postClickOverlays: number;         // Remaining overlay count
}
```

### Performance Characteristics

- **Average Processing Time**: <1000ms
- **Success Rate**: 100% on validated test sites
- **Language Coverage**: 30+ European languages
- **Framework Support**: 25+ CMP frameworks
- **Early Termination**: Stops on first successful detection

## Progress Tracking Specification

### Progress Stages

```typescript
enum ProgressStage {
  INITIALIZING = 'INITIALIZING',           // 5% - Browser setup
  LOADING_PAGE = 'LOADING_PAGE',           // 35% - Navigation
  HANDLING_CONSENT = 'HANDLING_CONSENT',   // 70% - Cookie consent
  EXTRACTING_CONTENT = 'EXTRACTING_CONTENT', // 90% - Content extraction
  PROCESSING_RESULTS = 'PROCESSING_RESULTS'  // 100% - Finalization
}
```

### Progress Notification Format

```typescript
interface ProgressNotification {
  method: 'notifications/progress';
  params: {
    progressToken: string | number;
    progress: number;              // 0-100
    total: number;                 // 100
    message: string;               // Human readable status
    stage?: ProgressStage;         // Current workflow stage
    correlationId?: string;        // Client correlation ID
    requestId?: string;            // MCP request ID
    connectionId?: string;         // SSE connection ID
    timestamp?: string;            // Event timestamp
  };
}
```

## Content Streaming Specification

### Streaming Event Types

```typescript
enum StreamingEventType {
  STREAM_STARTED = 'stream_started',
  CONTENT_CHUNK = 'content_chunk',
  METADATA_UPDATE = 'metadata_update',
  EXTRACTION_COMPLETE = 'extraction_complete',
  STREAM_COMPLETED = 'stream_completed',
  STREAM_ERROR = 'stream_error'
}
```

### Content Chunk Types

```typescript
enum ContentChunkType {
  TITLE = 'title',
  AUTHOR = 'author',
  PUBLICATION_DATE = 'publication_date',
  SUMMARY = 'summary',
  CONTENT_PARAGRAPH = 'content_paragraph',
  FULL_TEXT_CHUNK = 'full_text_chunk',
  METADATA = 'metadata'
}
```

### Streaming Configuration

- **Chunk Size**: 100-2000 characters
- **Interval**: 200ms between chunks
- **Transport**: Server-Sent Events (SSE)
- **Broadcasting**: All connected clients receive events

## Rate Limiting Specification

### Rate Limit Scopes

```typescript
enum RateLimitScope {
  GLOBAL = 'global',               // Server-wide limits
  PER_CONNECTION = 'per_connection', // Per MCP connection
  PER_IP = 'per_ip',              // Per client IP
  PER_TOOL = 'per_tool',          // Per tool execution
  PER_USER = 'per_user'           // Per authenticated user
}
```

### Default Limits

```typescript
interface RateLimits {
  requestsPerMinute: 60;           // 1 request per second average
  maxConcurrentRequests: 5;        // Max parallel requests
  requestTimeoutMs: 30000;         // 30 second timeout
}
```

### Rate Limiting Algorithm

- **Strategy**: Token Bucket Algorithm
- **Actions**: REJECT, DELAY, QUEUE, THROTTLE
- **Monitoring**: Violation tracking and metrics
- **Cleanup**: Automatic cleanup of expired entries

## Monitoring & Observability Specification

### Structured Logging

```typescript
interface StructuredLogEntry {
  timestamp: string;               // ISO datetime
  level: LogLevel;                 // TRACE, DEBUG, INFO, WARN, ERROR, FATAL
  message: string;                 // Human readable message
  service: string;                 // Service name
  version: string;                 // Service version
  requestId?: string;              // Request correlation
  operationId?: string;            // Operation correlation
  toolName?: string;               // Tool name
  connectionId?: string;           // Connection ID
  error?: ErrorDetails;            // Error information
  context?: Record<string, unknown>; // Additional context
  duration?: number;               // Operation duration (ms)
  memoryUsage?: number;            // Memory usage (bytes)
  labels?: Record<string, string>; // Labels for filtering
}
```

### Health Status Schema

```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;                  // Seconds
  version: string;
  components: {
    browserPool: ComponentHealth;
    connections: ComponentHealth;
    tools: ComponentHealth;
    streaming: ComponentHealth;
  };
  performance: {
    averageResponseTime: number;
    errorRate: number;
    memoryUsage: number;
    cpuUsage?: number;
  };
  timestamp: string;
}
```

### Metrics Collection

- **Counter Metrics**: Request counts, error counts, tool executions
- **Gauge Metrics**: Active connections, browser pool usage, memory
- **Histogram Metrics**: Response times, payload sizes, durations
- **Timer Metrics**: Operation durations with automatic histograms

## Browser Pool Specification

### Pool Configuration

```typescript
interface BrowserPoolConfig {
  maxBrowsers: number;             // Default: 5
  browserType: 'chromium' | 'firefox' | 'webkit'; // Default: 'chromium'
  launchOptions: LaunchOptions;    // Playwright launch options
  contextOptions: BrowserContextOptions; // Default context options
}
```

### Pool Management

- **Lazy Initialization**: Browsers created on demand
- **Resource Cleanup**: Automatic cleanup on timeout/error
- **Context Isolation**: Fresh context per request
- **Queue Management**: Request queuing when pool exhausted
- **Health Monitoring**: Browser health tracking

### Default Browser Context

```typescript
const DEFAULT_BROWSER_CONTEXT = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  viewport: { width: 1920, height: 1080 }
};
```

## Configuration Specification

### Environment Variables

```bash
# Server Configuration
MCP_SERVER_PORT=3001              # Server port (1-65535)
BROWSER_POOL_SIZE=5               # Max concurrent browsers (1-10)
REQUEST_TIMEOUT=30000             # Request timeout ms (1000-60000)
CONSENT_TIMEOUT=3000              # Cookie consent timeout ms (1000-10000)
DEBUG_LOGGING=false               # Enable debug logging

# Docker Configuration (automatic)
NODE_ENV=production
PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
```

### Server Configuration Schema

```typescript
interface ServerConfig {
  name: string;                    // Default: 'mcp-web-scraper'
  version: string;                 // Default: '1.0.0'
  port: number;                    // Default: 3001
  browserPoolSize: number;         // Default: 5
  requestTimeout: number;          // Default: 30000
  consentTimeout: number;          // Default: 3000
  enableDebugLogging: boolean;     // Default: false
}
```

### Monitoring Configuration

```typescript
interface MonitoringConfig {
  logging: {
    level: LogLevel;               // Default: INFO
    enableStructuredLogs: boolean; // Default: true
    enableConsoleOutput: boolean;  // Default: true
    enableFileOutput: boolean;     // Default: false
    maxLogFileSize: number;        // Default: 100MB
    maxLogFiles: number;           // Default: 5
  };
  metrics: {
    enableMetrics: boolean;        // Default: true
    metricsRetentionHours: number; // Default: 24
    aggregationIntervalMs: number; // Default: 60000
    maxMetricEntries: number;      // Default: 10000
  };
  healthCheck: {
    enableHealthEndpoint: boolean; // Default: true
    healthCheckIntervalMs: number; // Default: 30000
    degradedThresholds: ThresholdConfig;
    unhealthyThresholds: ThresholdConfig;
  };
}
```

## Session Management Specification

### Page Session Schema

```typescript
interface PageSession {
  id: string;                      // UUID v4
  context: BrowserContext;         // Playwright context
  page: Page;                      // Playwright page
  url: string;                     // Current URL
  createdAt: Date;                 // Session creation time
  lastActivity: Date;              // Last activity timestamp
  navigationHistory: string[];     // Navigation history
  hasConsentHandled: boolean;      // Consent status
}
```

### Session Configuration

```typescript
interface PageManagerConfig {
  sessionTimeout: number;          // Session timeout (ms)
  maxSessions: number;             // Max concurrent sessions
  autoHandleConsent: boolean;      // Auto consent handling
}
```

## Error Handling Specification

### Error Types

```typescript
enum ErrorType {
  BROWSER_ERROR = 'BROWSER_ERROR',
  CONSENT_ERROR = 'CONSENT_ERROR',
  EXTRACTION_ERROR = 'EXTRACTION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR'
}
```

### Error Response Format

```typescript
interface MCPError {
  code: number;                    // JSON-RPC error code
  message: string;                 // Error message
  data?: {
    type: ErrorType;
    details: Record<string, unknown>;
    timestamp: string;
    requestId?: string;
  };
}
```

## Security Specification

### Input Validation

- **Schema Validation**: Zod schemas for all inputs
- **URL Sanitization**: Safe URL validation and normalization
- **Parameter Limits**: Maximum string lengths and array sizes
- **Type Safety**: Runtime type checking for all data

### Resource Protection

- **Rate Limiting**: Multi-scope rate limiting protection
- **Memory Limits**: Browser pool and memory constraints
- **Timeout Protection**: Request and operation timeouts
- **Resource Cleanup**: Automatic cleanup on errors

### Privacy & Security

- **No Credential Logging**: Sensitive data protection
- **Context Isolation**: Fresh browser contexts per request
- **Secure Headers**: Security headers for HTTP endpoints
- **Input Sanitization**: XSS and injection prevention

## Deployment Specification

### Docker Configuration

```dockerfile
# Multi-stage build
FROM node:18-alpine AS builder
FROM mcr.microsoft.com/playwright:v1.40.0-focal AS runtime

# Resource limits (recommended)
MEMORY: 3GB
CPU: 1.5 cores
```

### Kubernetes Configuration

```yaml
resources:
  limits:
    memory: "3Gi"
    cpu: "1500m"
  requests:
    memory: "1Gi"
    cpu: "500m"

healthcheck:
  httpGet:
    path: /health
    port: 3001
  initialDelaySeconds: 30
  periodSeconds: 30
```

### Load Balancing

- **Session Affinity**: Not required (stateless design)
- **Health Checks**: Built-in health endpoints
- **Graceful Shutdown**: SIGTERM handling with cleanup
- **Rolling Deployments**: Zero-downtime deployment support

## Performance Specifications

### Response Time Targets

```
Cookie Consent Handling:
- Average: <2000ms
- 95th percentile: <3000ms
- Timeout: 3000ms (configurable)

Article Scraping:
- Simple pages: 2-4 seconds
- Complex pages: 4-8 seconds  
- With consent: +1-3 seconds
- Timeout: 30 seconds (configurable)

Screenshot Capture:
- Viewport: 1-2 seconds
- Full page: 2-5 seconds
- With consent: +1-3 seconds
```

### Resource Usage Targets

```
Memory Usage:
- Base server: ~25MB
- Per browser: 80-150MB
- Total limit: 3GB (Docker)
- Browser pool: Max 5 concurrent

CPU Usage:
- Idle: <5%
- Active scraping: 20-50%
- Peak load: 80-100%
- Limit: 1.5 CPUs (Docker)
```

### Scalability Characteristics

```
Concurrent Operations:
- Recommended: 5 concurrent (browser pool size)
- Rate limiting: 60 requests/minute default
- Queue depth: Automatic browser pool queueing

Connection Limits:
- SSE connections: No hard limit
- Memory per connection: ~1-2MB
- Broadcasting: All connections receive events
```

## Testing Specification

### Test Categories

1. **Unit Tests**: Core component testing
2. **Integration Tests**: Tool and system integration
3. **Cookie Consent Tests**: Multi-site consent validation
4. **Performance Tests**: Load and stress testing
5. **Security Tests**: Vulnerability and penetration testing

### Test Automation

```bash
# Cookie consent testing
./test_cookie_consent.sh QUICK      # 6 representative sites
./test_cookie_consent.sh FULL       # Comprehensive test suite
./test_cookie_consent.sh REGIONAL   # Language-specific testing

# Unit and integration tests
npm test                            # Full test suite
npm run test:unit                   # Unit tests only
npm run test:integration            # Integration tests only
```

### Validation Sites

- **VG.no** (Norwegian)
- **Aftenposten.no** (Norwegian)
- **BBC.com** (English)
- **CNN.com** (English)
- **Guardian.co.uk** (English)
- **Corriere.it** (Italian)

## Compliance & Standards

### MCP Protocol Compliance

- **Version**: MCP v1.0
- **Transport**: HTTP + Server-Sent Events
- **Message Format**: JSON-RPC 2.0
- **Compatibility**: 100% Microsoft Playwright MCP parity

### Web Standards

- **WCAG**: Web Content Accessibility Guidelines support
- **GDPR**: Cookie consent compliance for European sites
- **Security**: OWASP security guidelines adherence
- **Performance**: Web Vitals optimization

## Version Information

- **Specification Version**: 1.0
- **Implementation Version**: 1.0.0
- **MCP Protocol Version**: 1.0
- **Last Updated**: 2025-06-10
- **Compatibility**: Node.js 18+, TypeScript 5.0+

## Future Roadmap

### Planned Enhancements

- **Multi-language Translation**: Automatic content translation
- **Content Quality Scoring**: AI-powered content assessment
- **Advanced Caching**: Intelligent content caching with invalidation
- **Distributed Architecture**: Multi-container browser management
- **Webhook Integration**: Real-time notifications via webhooks

### Integration Opportunities

- **Claude Desktop**: Enhanced MCP client integration
- **VS Code Extension**: Developer tool integration
- **Zapier/Make.com**: No-code automation platform integration
- **API Gateway**: Enterprise API management integration
- **Kubernetes**: Cloud-native deployment patterns