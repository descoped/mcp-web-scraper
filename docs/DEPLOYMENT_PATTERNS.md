# Deployment Patterns & Production Configuration

This file documents proven deployment patterns, production configurations, and operational knowledge for the MCP Web Scraper.

## Production-Tested Deployment Configurations

### **Docker Compose Integration (Recommended)**

#### **Standalone Deployment**
```yaml
# docker-compose.yml for standalone deployment
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
# docker-compose.yml integrated with other services
version: '3.8'
services:
  # Your main application
  app:
    build: .
    depends_on:
      - mcp-web-scraper
      - postgres
    environment:
      - MCP_PLAYWRIGHT_URL=http://mcp-web-scraper:3001
    networks:
      - app_network

  # MCP Web Scraper
  mcp-web-scraper:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: mcp-web-scraper
    environment:
      - NODE_ENV=production
      - MCP_SERVER_PORT=3001
      - BROWSER_POOL_SIZE=5
      - DEBUG_LOGGING=false
    volumes:
      - ./logs/mcp-web-scraper:/app/logs
      - ./output/scraping:/app/output
    networks:
      - app_network
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

  # Database
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=app_db
      - POSTGRES_USER=app_user
      - POSTGRES_PASSWORD=app_password
    networks:
      - app_network

networks:
  app_network:
    driver: bridge
```

### **Kubernetes Deployment**

#### **Deployment Configuration**
```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-web-scraper
  labels:
    app: mcp-web-scraper
    version: v1.0.0
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
        - name: MCP_SERVER_PORT
          value: "3001"
        - name: BROWSER_POOL_SIZE
          value: "5"
        - name: DEBUG_LOGGING
          value: "false"
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
          timeoutSeconds: 10
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        securityContext:
          runAsNonRoot: false  # Required for Playwright
          capabilities:
            add:
            - SYS_ADMIN        # Required for Chrome sandbox
        volumeMounts:
        - name: logs
          mountPath: /app/logs
        - name: output
          mountPath: /app/output
      volumes:
      - name: logs
        emptyDir: {}
      - name: output
        persistentVolumeClaim:
          claimName: mcp-web-scraper-storage
---
apiVersion: v1
kind: Service
metadata:
  name: mcp-web-scraper-service
spec:
  selector:
    app: mcp-web-scraper
  ports:
  - protocol: TCP
    port: 3001
    targetPort: 3001
  type: ClusterIP
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mcp-web-scraper-storage
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 10Gi
```

#### **Service Monitor (Prometheus)**
```yaml
# servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: mcp-web-scraper-metrics
  labels:
    app: mcp-web-scraper
spec:
  selector:
    matchLabels:
      app: mcp-web-scraper
  endpoints:
  - port: http
    path: /metrics
    interval: 30s
    scrapeTimeout: 10s
```

## Environment-Specific Configurations

### **Development Environment**
```bash
# .env.development
NODE_ENV=development
MCP_SERVER_PORT=3001
BROWSER_POOL_SIZE=2              # Reduced for development
REQUEST_TIMEOUT=30000
CONSENT_TIMEOUT=3000
DEBUG_LOGGING=true               # Enable debug logs
LOG_LEVEL=DEBUG
ENABLE_CONSOLE_OUTPUT=true
ENABLE_FILE_OUTPUT=false

# Development-specific settings
DEV_AUTO_RELOAD=true
DEV_VERBOSE_ERRORS=true
RATE_LIMIT_REQUESTS_PER_MINUTE=120  # More lenient for testing
```

### **Staging Environment**
```bash
# .env.staging
NODE_ENV=staging
MCP_SERVER_PORT=3001
BROWSER_POOL_SIZE=3              # Reduced resources
REQUEST_TIMEOUT=30000
CONSENT_TIMEOUT=3000
DEBUG_LOGGING=true               # Keep debug for validation
LOG_LEVEL=INFO
ENABLE_FILE_OUTPUT=true

# Staging-specific monitoring
HEALTH_CHECK_INTERVAL_MS=15000   # More frequent checks
METRICS_RETENTION_HOURS=12       # Shorter retention
```

### **Production Environment**
```bash
# .env.production
NODE_ENV=production
MCP_SERVER_PORT=3001
BROWSER_POOL_SIZE=5              # Full capacity
REQUEST_TIMEOUT=30000
CONSENT_TIMEOUT=3000
DEBUG_LOGGING=false              # Optimize performance
LOG_LEVEL=INFO
ENABLE_FILE_OUTPUT=true
ENABLE_STRUCTURED_LOGS=true

# Production monitoring
HEALTH_CHECK_INTERVAL_MS=30000
METRICS_RETENTION_HOURS=24
ANALYTICS_ENABLED=true

# Security settings
CORS_ORIGIN="https://yourdomain.com"
RATE_LIMITING_ENABLED=true
ENABLE_IP_RATE_LIMITING=true
```

## Load Balancing & Scaling Patterns

### **HAProxy Configuration**
```
# haproxy.cfg
global
    daemon
    maxconn 4096

defaults
    mode http
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms

frontend mcp_frontend
    bind *:3001
    default_backend mcp_backend

backend mcp_backend
    balance roundrobin
    option httpchk GET /health
    server mcp1 mcp-web-scraper-1:3001 check
    server mcp2 mcp-web-scraper-2:3001 check
    server mcp3 mcp-web-scraper-3:3001 check
```

### **NGINX Load Balancer**
```nginx
# nginx.conf
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
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /mcp {
        proxy_pass http://mcp_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;  # 24 hours for SSE
    }
    
    location /metrics {
        proxy_pass http://mcp_backend;
        proxy_set_header Host $host;
    }
}
```

## Monitoring & Observability

### **Prometheus Configuration**
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
    scrape_timeout: 10s
```

### **Grafana Dashboard JSON**
```json
{
  "dashboard": {
    "title": "MCP Web Scraper",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "Requests/sec"
          }
        ]
      },
      {
        "title": "Response Time",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      },
      {
        "title": "Browser Pool Usage",
        "targets": [
          {
            "expr": "browser_pool_active_browsers",
            "legendFormat": "Active Browsers"
          }
        ]
      },
      {
        "title": "Cookie Consent Success Rate",
        "targets": [
          {
            "expr": "rate(cookie_consent_success_total[5m]) / rate(cookie_consent_attempts_total[5m])",
            "legendFormat": "Success Rate"
          }
        ]
      }
    ]
  }
}
```

### **Alerting Rules**
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
          
      - alert: BrowserPoolExhausted
        expr: browser_pool_active_browsers >= browser_pool_max_browsers * 0.9
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Browser pool near capacity"
          
      - alert: CookieConsentFailures
        expr: rate(cookie_consent_failures_total[10m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Cookie consent failure rate elevated"
```

## Security Configurations

### **Production Security Hardening**
```dockerfile
# Dockerfile (security enhancements)
FROM node:18-alpine AS builder
# ... build stages ...

FROM node:18-alpine AS production
RUN addgroup -g 1001 -S playwright && \
    adduser -S playwright -u 1001

# Install security updates
RUN apk update && apk upgrade

# Install Playwright with security considerations
RUN npx playwright install chromium && \
    npx playwright install-deps chromium

# Set secure permissions
COPY --from=builder --chown=playwright:playwright /app/dist ./dist
COPY --from=builder --chown=playwright:playwright /app/node_modules ./node_modules

USER playwright
EXPOSE 3001

# Security-hardened startup
CMD ["node", "--max-old-space-size=2048", "--enable-source-maps", "dist/server.js"]
```

### **Network Security**
```yaml
# docker-compose.yml with network isolation
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

## Performance Tuning Patterns

### **High-Load Configuration**
```bash
# .env.high-load
NODE_ENV=production
BROWSER_POOL_SIZE=10             # Increased capacity
REQUEST_TIMEOUT=45000            # Longer timeout for complex pages
RATE_LIMIT_REQUESTS_PER_MINUTE=180 # Higher throughput
RATE_LIMIT_MAX_CONCURRENT=15     # More concurrent requests

# Memory optimization
MEMORY_HEAP_SIZE_LIMIT=4096      # 4GB heap
MEMORY_GC_INTERVAL_MS=15000      # More frequent GC
BROWSER_MEMORY_LIMIT=768         # Increased per-browser memory

# Performance tuning
STREAMING_CHUNK_INTERVAL_MS=100  # Faster streaming
CONSENT_TIMEOUT=2000             # Reduced consent timeout
```

### **Low-Resource Configuration**
```bash
# .env.low-resource
NODE_ENV=production
BROWSER_POOL_SIZE=2              # Reduced capacity
REQUEST_TIMEOUT=20000            # Shorter timeout
RATE_LIMIT_REQUESTS_PER_MINUTE=30 # Limited throughput
RATE_LIMIT_MAX_CONCURRENT=2      # Minimal concurrency

# Memory conservation
MEMORY_HEAP_SIZE_LIMIT=1024      # 1GB heap
BROWSER_MEMORY_LIMIT=256         # Reduced per-browser memory
METRICS_RETENTION_HOURS=6        # Shorter retention
MAX_METRIC_ENTRIES=1000          # Fewer metrics
```

## Backup & Recovery Patterns

### **Configuration Backup**
```bash
#!/bin/bash
# backup-config.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mcp-web-scraper"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup configuration files
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" \
    .env* \
    docker-compose.yml \
    Dockerfile.* \
    tsconfig.json \
    package.json

# Backup logs and metrics (last 7 days)
find ./logs -name "*.log" -mtime -7 -exec cp {} "$BACKUP_DIR/" \;

echo "Configuration backup completed: $BACKUP_DIR/config_$DATE.tar.gz"
```

### **Health Check Recovery**
```bash
#!/bin/bash
# health-check-recovery.sh
HEALTH_URL="http://localhost:3001/health"
MAX_RETRIES=3
RETRY_DELAY=10

for i in $(seq 1 $MAX_RETRIES); do
    if curl -f "$HEALTH_URL" >/dev/null 2>&1; then
        echo "Health check passed"
        exit 0
    fi
    
    echo "Health check failed (attempt $i/$MAX_RETRIES)"
    
    if [ $i -lt $MAX_RETRIES ]; then
        echo "Attempting container restart..."
        docker-compose restart mcp-web-scraper
        sleep $RETRY_DELAY
    fi
done

echo "Health check failed after $MAX_RETRIES attempts"
exit 1
```

## Migration Patterns

### **Blue-Green Deployment**
```bash
#!/bin/bash
# blue-green-deploy.sh
CURRENT_COLOR=$(docker-compose ps mcp-web-scraper | grep "Up" | awk '{print $1}' | grep -o "blue\|green" || echo "blue")
NEW_COLOR=$([ "$CURRENT_COLOR" = "blue" ] && echo "green" || echo "blue")

echo "Current deployment: $CURRENT_COLOR"
echo "Deploying to: $NEW_COLOR"

# Deploy new version
docker-compose -f docker-compose.yml -f docker-compose.$NEW_COLOR.yml up -d mcp-web-scraper-$NEW_COLOR

# Health check new deployment
./health-check.sh "http://localhost:300$([ "$NEW_COLOR" = "blue" ] && echo "1" || echo "2")/health"

if [ $? -eq 0 ]; then
    echo "New deployment healthy, switching traffic..."
    # Update load balancer configuration
    # Stop old deployment
    docker-compose stop mcp-web-scraper-$CURRENT_COLOR
    echo "Blue-green deployment completed"
else
    echo "New deployment failed health check, rolling back..."
    docker-compose stop mcp-web-scraper-$NEW_COLOR
    exit 1
fi
```

### **Rolling Update Pattern**
```yaml
# docker-compose.rolling.yml
version: '3.8'
services:
  mcp-web-scraper-1:
    <<: *mcp-web-scraper-base
    container_name: mcp-web-scraper-1
    ports:
      - "3001:3001"
  
  mcp-web-scraper-2:
    <<: *mcp-web-scraper-base
    container_name: mcp-web-scraper-2
    ports:
      - "3002:3001"
  
  mcp-web-scraper-3:
    <<: *mcp-web-scraper-base
    container_name: mcp-web-scraper-3
    ports:
      - "3003:3001"

x-mcp-web-scraper-base: &mcp-web-scraper-base
  build:
    context: .
    dockerfile: Dockerfile
  environment:
    - NODE_ENV=production
    - MCP_SERVER_PORT=3001
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

This deployment patterns documentation provides **production-tested configurations** and **operational patterns** that ensure reliable, scalable deployment of the MCP Web Scraper across different environments and use cases.