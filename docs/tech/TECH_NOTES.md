# Technical Notes - MCP Web Scraper

This document consolidates technical reference information, API documentation, and deployment patterns for the MCP Web
Scraper.

## 📡 Correlation Tracking API

The MCP Web Scraper supports **correlation tracking** to enable clients to correlate MCP scraping progress events with
specific analysis tasks.

### 🎯 Key Features

- **Client-provided correlation IDs** flow through all progress events
- **Real-time SSE notifications** include correlation metadata
- **Perfect for batch processing** and distributed tracing scenarios
- **Zero breaking changes** - fully backward compatible
- **Multiple correlation formats** supported (UUIDs, task IDs, custom strings)

### 📋 Tool Parameters

All core scraping tools accept an optional `correlation_id` parameter:

#### `scrape_article_content`

```typescript
{
  url: string;                                    // Required
  correlation_id?: string;                        // NEW: Client correlation ID
  outputFormats?: ('text' | 'html' | 'markdown')[]; // Output formats
  waitForSelector?: string;                       // CSS selector to wait for
  extractSelectors?: {                            // Custom selectors
    title?: string;
    content?: string;
    author?: string;
    date?: string;
    summary?: string;
  };
}
```

#### Other Tools

- `get_page_screenshot` - Adds `correlation_id?: string`
- `handle_cookie_consent` - Adds `correlation_id?: string`

### 📊 SSE Event Structure

Progress events include comprehensive correlation metadata:

```typescript
interface ProgressNotification {
  method: 'notifications/progress';
  params: {
    // Standard MCP fields
    progressToken: string | number;
    progress: number;           // 0-100
    total: number;              // 100
    message: string;            // Human readable status
    
    // Correlation metadata
    correlationId?: string;     // Client-provided correlation ID
    requestId?: string;         // MCP request ID
    connectionId?: string;      // SSE connection ID
    timestamp?: string;         // Event timestamp
    
    // Additional context
    stage?: string;             // Current workflow stage
    toolName?: string;          // Tool that generated the event
  };
}
```

### 🚀 Usage Examples

#### Basic Correlation

```javascript
const result = await mcpClient.callTool('scrape_article_content', {
  url: 'https://example.com/article',
  correlation_id: 'task_085668b2-8f3d-418e',
  outputFormats: ['text', 'markdown']
});
```

#### Batch Processing

```javascript
const batchId = 'kyc_analysis_2025_001';
const articles = [
  { url: 'https://example.com/article1', id: 'item_001' },
  { url: 'https://example.com/article2', id: 'item_002' }
];

const promises = articles.map(article => 
  mcpClient.callTool('scrape_article_content', {
    url: article.url,
    correlation_id: `${batchId}_${article.id}`,
    outputFormats: ['text']
  })
);
```

#### Real-time Progress Monitoring

```javascript
const eventSource = new EventSource('http://localhost:3001/mcp');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  const correlationId = data.params?.correlationId;
  
  if (correlationId?.startsWith('kyc_analysis_2025_001')) {
    updateTaskProgress(correlationId, {
      progress: data.params.progress,
      message: data.params.message,
      stage: data.params.stage
    });
  }
};
```

### 🔒 Security Considerations

- **Correlation ID Validation**: Max 256 chars, safe characters only (`[a-zA-Z0-9_:-]+`)
- **PII Protection**: Avoid sensitive data in correlation IDs
- **Length Limits**: Keep IDs short as they're included in every event

### 📈 Performance Best Practices

1. **Keep IDs short** - Included in every progress event
2. **Use structured formats** - Enable pattern-based filtering
3. **Include hierarchy** - Support nested correlation (batch → task → subtask)
4. **Use consistent formats** - Simplify client-side processing

## 🚀 Production Deployment

This section covers proven deployment patterns and production configurations.

### **Docker Compose Integration (Recommended)**

#### **Standalone Deployment**

```yaml
# docker-compose.yml
version: '3.8'
services:
  mcp-web-scraper:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: mcp-web-scraper
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - MCP_SERVER_PORT=3001
      - BROWSER_POOL_SIZE=5
      - REQUEST_TIMEOUT=30000
      - CONSENT_TIMEOUT=3000
      - DEBUG_LOGGING=false
    volumes:
      - ./logs:/app/logs
      - ./output:/app/output
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    resources:
      limits:
        memory: 3G
        cpus: '1.5'
      reservations:
        memory: 1G
        cpus: '0.5'
    security_opt:
      - seccomp:unconfined  # Required for Playwright
    cap_add:
      - SYS_ADMIN         # Required for Chrome sandbox
```

#### **Integrated with Backend Services**

```yaml
version: '3.8'
services:
  app:
    build: .
    depends_on:
      - mcp-web-scraper
    environment:
      - MCP_PLAYWRIGHT_URL=http://mcp-web-scraper:3001
    networks:
      - app_network

  mcp-web-scraper:
    build: .
    environment:
      - NODE_ENV=production
      - BROWSER_POOL_SIZE=5
    volumes:
      - ./logs/mcp-web-scraper:/app/logs
    networks:
      - app_network
    restart: unless-stopped

networks:
  app_network:
    driver: bridge
```

### **Kubernetes Deployment**

```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-web-scraper
spec:
  replicas: 3
  selector:
    matchLabels:
      app: mcp-web-scraper
  template:
    metadata:
      labels:
        app: mcp-web-scraper
    spec:
      containers:
      - name: mcp-web-scraper
        image: mcp-web-scraper:1.0.0
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: "production"
        - name: BROWSER_POOL_SIZE
          value: "5"
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "3Gi"
            cpu: "1500m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3001
          initialDelaySeconds: 60
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        securityContext:
          runAsNonRoot: false  # Required for Playwright
          capabilities:
            add:
            - SYS_ADMIN
---
apiVersion: v1
kind: Service
metadata:
  name: mcp-web-scraper-service
spec:
  selector:
    app: mcp-web-scraper
  ports:
  - port: 3001
    targetPort: 3001
  type: ClusterIP
```

### **Environment-Specific Configurations**

#### **Development Environment**

```bash
# .env.development
NODE_ENV=development
BROWSER_POOL_SIZE=2              # Reduced for development
DEBUG_LOGGING=true               # Enable debug logs
RATE_LIMIT_REQUESTS_PER_MINUTE=120  # More lenient for testing
```

#### **Production Environment**

```bash
# .env.production
NODE_ENV=production
BROWSER_POOL_SIZE=5              # Full capacity
DEBUG_LOGGING=false              # Optimize performance
RATE_LIMITING_ENABLED=true
CORS_ORIGIN="https://yourdomain.com"
```

### **Load Balancing Patterns**

#### **NGINX Configuration**

```nginx
upstream mcp_backend {
    least_conn;
    server mcp-web-scraper-1:3001 max_fails=3 fail_timeout=30s;
    server mcp-web-scraper-2:3001 max_fails=3 fail_timeout=30s;
    server mcp-web-scraper-3:3001 max_fails=3 fail_timeout=30s;
}

server {
    listen 3001;
    
    location /health {
        proxy_pass http://mcp_backend;
    }
    
    location /mcp {
        proxy_pass http://mcp_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;  # 24 hours for SSE
    }
}
```

### **Monitoring & Observability**

#### **Prometheus Configuration**

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'mcp-web-scraper'
    static_configs:
      - targets: ['mcp-web-scraper:3001']
    metrics_path: /metrics
    scrape_interval: 30s
```

#### **Alerting Rules**

```yaml
# alerts.yml
groups:
  - name: mcp-web-scraper
    rules:
      - alert: MCPServerDown
        expr: up{job="mcp-web-scraper"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "MCP Web Scraper is down"
          
      - alert: HighErrorRate
        expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"
```

### **Security Configurations**

#### **Production Security Hardening**

```dockerfile
# Dockerfile security enhancements
FROM node:18-alpine AS production
RUN addgroup -g 1001 -S playwright && \
    adduser -S playwright -u 1001

# Install security updates
RUN apk update && apk upgrade

# Set secure permissions
COPY --from=builder --chown=playwright:playwright /app/dist ./dist
USER playwright
EXPOSE 3001

# Security-hardened startup
CMD ["node", "--max-old-space-size=2048", "dist/server.js"]
```

#### **Network Security**

```yaml
# Network isolation
networks:
  mcp_internal:
    driver: bridge
    internal: true
  mcp_external:
    driver: bridge

services:
  mcp-web-scraper:
    networks:
      - mcp_internal
      - mcp_external
    ports:
      - "127.0.0.1:3001:3001"  # Bind to localhost only
```

### **Performance Tuning**

#### **High-Load Configuration**

```bash
# .env.high-load
BROWSER_POOL_SIZE=10             # Increased capacity
RATE_LIMIT_REQUESTS_PER_MINUTE=180 # Higher throughput
MEMORY_HEAP_SIZE_LIMIT=4096      # 4GB heap
STREAMING_CHUNK_INTERVAL_MS=100  # Faster streaming
```

#### **Low-Resource Configuration**

```bash
# .env.low-resource
BROWSER_POOL_SIZE=2              # Reduced capacity
RATE_LIMIT_REQUESTS_PER_MINUTE=30 # Limited throughput
MEMORY_HEAP_SIZE_LIMIT=1024      # 1GB heap
BROWSER_MEMORY_LIMIT=256         # Reduced per-browser memory
```

### **Backup & Recovery**

#### **Configuration Backup Script**

```bash
#!/bin/bash
# backup-config.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mcp-web-scraper"

mkdir -p "$BACKUP_DIR"

tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" \
    .env* \
    docker-compose.yml \
    Dockerfile \
    package.json

find ./logs -name "*.log" -mtime -7 -exec cp {} "$BACKUP_DIR/" \;
```

#### **Health Check Recovery**

```bash
#!/bin/bash
# health-check-recovery.sh
HEALTH_URL="http://localhost:3001/health"
MAX_RETRIES=3

for i in $(seq 1 $MAX_RETRIES); do
    if curl -f "$HEALTH_URL" >/dev/null 2>&1; then
        echo "Health check passed"
        exit 0
    fi
    
    echo "Health check failed (attempt $i/$MAX_RETRIES)"
    
    if [ $i -lt $MAX_RETRIES ]; then
        docker-compose restart mcp-web-scraper
        sleep 10
    fi
done

echo "Health check failed after $MAX_RETRIES attempts"
exit 1
```

## 🎯 Project Overview & Features

### **Value Proposition**

**MCP Web Scraper: Production-Ready Browser Automation with Intelligent Cookie Consent**

- 30+ language cookie consent detection
- 100% success rate on major European news sites
- <1000ms average consent processing time
- 29 comprehensive browser automation tools

### **Core Innovation**

- **Intelligent Consent Detection**: Automatic handling across languages and frameworks
- **MCP Protocol Compliance**: Perfect integration with Claude Desktop and AI tools
- **Production Monitoring**: Real-time metrics, health checks, and structured logging
- **100% Playwright MCP Parity**: All 29 tools from Microsoft's implementation + specializations

### **Architecture Overview**

```
MCP Web Scraper Architecture
├── MCP Protocol Layer
│   ├── Tool Registry (29 tools)
│   ├── Connection Manager
│   └── Progress Notifications
├── Browser Automation
│   ├── Browser Pool (Playwright)
│   ├── Session Management
│   └── Page Manager
├── Cookie Consent Engine
│   ├── Multi-language Detection
│   ├── Framework Recognition
│   └── Verification System
└── Production Features
    ├── Monitoring & Metrics
    ├── Rate Limiting
    └── Structured Logging
```

### **Cookie Consent Innovation**

#### **Detection Strategies** (in order):

1. **Attribute-based**: `data-consent`, `aria-label*=cookie`
2. **Framework-specific**: OneTrust, Quantcast, Cookiebot selectors
3. **Text-based**: "Accept all", "Godta alle", "Alle akzeptieren"
4. **Iframe-based**: Cross-frame consent detection

#### **Language Coverage**:

- **Scandinavian**: Norwegian, Swedish, Danish
- **Germanic**: German, Dutch, English
- **Romance**: French, Spanish, Italian, Portuguese
- **Slavic**: Polish, Czech, Hungarian
- **18+ more European languages**

### **Complete Tool Coverage**

#### **29 Tools - 100% Microsoft Playwright MCP Parity**:

**Core Scraping (3 tools)**:

- `scrape_article_content` - Article extraction with consent
- `get_page_screenshot` - Visual capture with consent
- `handle_cookie_consent` - Dedicated consent management

**Browser Interactions (9 tools)**:

- Navigation, clicking, typing, form handling
- Dialog management, file uploads
- Element targeting via CSS/XPath

**Advanced Features (6 tools)**:

- PDF generation, console monitoring
- Accessibility snapshots, test generation
- Viewport resizing, browser management

**Session Management (4 tools)**:

- Multi-tab workflows, network monitoring
- Drag-drop interactions, history navigation

**AI Vision Tools (7 tools)**:

- Element finding, page annotation
- Content analysis, JavaScript execution

### **Production Features**

#### **Real-time Capabilities**:

- **Progress Notifications**: 5-stage workflow tracking
- **Content Streaming**: Live content delivery during extraction
- **Correlation Tracking**: Client-provided IDs for request correlation

#### **Monitoring & Observability**:

- **Health Endpoints**: `/health`, `/metrics`, `/dashboard`
- **Structured Logging**: JSON output with correlation
- **Performance Metrics**: Response times, error rates, memory usage

#### **Reliability Features**:

- **Rate Limiting**: Token bucket with multiple scopes
- **Graceful Shutdown**: Clean resource cleanup
- **Error Recovery**: Automatic browser restart
- **Resource Management**: Memory limits and pool constraints

### **Performance Benchmarks**

#### **Cookie Consent Performance**:

- **Average Processing**: <2s (QUICK test suite)
- **Success Rate**: 100% on 6 major news sites
- **Language Coverage**: 30+ European languages
- **Framework Support**: 25+ CMP frameworks

#### **System Performance**:

- **Memory Usage**: ~25MB base + 80-150MB per browser
- **Response Times**: 2-4s simple pages, 4-8s complex pages
- **Concurrent Requests**: 5 simultaneous (browser pool size)
- **Rate Limiting**: 60 requests/minute default

### **Competitive Advantage**

#### **vs. Traditional Web Scrapers**:

- ✅ **Cookie Consent**: Advanced vs basic/manual
- ✅ **Language Support**: 30+ vs English-only
- ✅ **Framework Support**: 25+ vs limited
- ✅ **Monitoring**: Production-grade vs basic
- ✅ **AI Integration**: MCP native vs none

#### **vs. Microsoft Playwright MCP**:

- ✅ **Feature Parity**: 100% compatibility (29/29 tools)
- ✅ **Cookie Consent**: Advanced vs none
- ✅ **Production Features**: Monitoring, streaming, correlation
- ✅ **Session Management**: Persistent contexts vs single-use

### **Use Cases & Applications**

#### **Content Intelligence**:

- News article extraction and analysis
- E-commerce product information gathering
- Academic research data collection
- Market intelligence and competitor analysis

#### **AI-Powered Workflows**:

- Claude Desktop automated research
- Content summarization pipelines
- Multi-language content processing
- Real-time market monitoring

#### **Enterprise Applications**:

- Compliance monitoring across regions
- Brand mention tracking
- Price comparison services
- Content localization workflows

### **Getting Started**

#### **Quick Setup**:

1. **Install**: `npm install && npm run build`
2. **Configure**: Update `mcp.json` for Claude Desktop
3. **Deploy**: Docker Compose for production
4. **Test**: `./test_cookie_consent.sh QUICK`

#### **Integration Patterns**

**Claude Desktop Integration**:

```json
{
  "mcpServers": {
    "mcp-web-scraper": {
      "command": "node",
      "args": ["/path/to/dist/server.js"],
      "env": {
        "BROWSER_POOL_SIZE": "3",
        "DEBUG_LOGGING": "true"
      }
    }
  }
}
```

**Docker Deployment**:

- Multi-stage builds for optimization
- Resource limits (3GB memory, 1.5 CPU)
- Health check integration
- Volume mounting for logs and output

### **System Requirements**

- Node.js 18+
- 3GB RAM (recommended)
- 1.5 CPU cores
- Docker support (optional)

### **Why Choose MCP Web Scraper**

- **Production-Ready**: Months of testing and optimization
- **Industry-Leading**: 30+ language consent handling
- **Future-Proof**: 100% MCP compatibility with ongoing development
- **Open Source**: Full transparency and customization

---

This technical reference consolidates essential API documentation, deployment patterns, and project overview information
for the MCP Web Scraper.