# MCP Client Configuration Guide

This guide provides current, tested configurations for connecting MCP clients (Claude Desktop, VS Code, etc.) to the
mcp-web-scraper server.

## 🖥 **Claude Desktop Configuration**

### **Recommended: Local Development Setup**

**File location**: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)  
**File location**: `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

```json
{
  "mcpServers": {
    "mcp-web-scraper": {
      "command": "node",
      "args": ["/Users/yourusername/Code/descoped/mcp-web-scraper/dist/server.js"],
      "env": {
        "MCP_SERVER_PORT": "3001",
        "BROWSER_POOL_SIZE": "3",
        "DEBUG_LOGGING": "true",
        "CONSENT_TIMEOUT": "3000",
        "REQUEST_TIMEOUT": "30000"
      }
    }
  }
}
```

### **Alternative: Docker Setup**

```json
{
  "mcpServers": {
    "mcp-web-scraper": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-p", "3001:3001",
        "mcp-web-scraper:latest"
      ],
      "env": {
        "BROWSER_POOL_SIZE": "3",
        "DEBUG_LOGGING": "false"
      }
    }
  }
}
```

### **Alternative: npm Global Install** (Future)

```json
{
  "mcpServers": {
    "mcp-web-scraper": {
      "command": "npx",
      "args": ["@descoped/mcp-web-scraper"],
      "env": {
        "BROWSER_POOL_SIZE": "3",
        "DEBUG_LOGGING": "false"
      }
    }
  }
}
```

## 🧪 **Testing Your Configuration**

### **1. Start the Server Manually** (Recommended for Testing)

```bash
# Option A: Local development
cd /path/to/mcp-web-scraper
npm run build
npm start

# Option B: Docker
docker run -p 3001:3001 mcp-web-scraper:latest
```

### **2. Test Server Health**

```bash
# Basic health check
curl http://localhost:3001/health

# Expected response:
{
  "status": "healthy",
  "server": "mcp-web-scraper",
  "version": "1.0.0",
  "tools": {"totalTools": 3}
}
```

### **3. Test MCP Protocol**

```bash
# List available tools
curl -X POST http://localhost:3001/mcp-request \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'

# Expected response:
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {"name": "scrape_article_content", "description": "..."},
      {"name": "get_page_screenshot", "description": "..."},
      {"name": "handle_cookie_consent", "description": "..."}
    ]
  }
}
```

### **4. Test Tool Execution**

```bash
# Test cookie consent handling
curl -X POST http://localhost:3001/mcp-request \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "handle_cookie_consent",
      "arguments": {"url": "https://www.bbc.com"}
    }
  }'

# Test article scraping with correlation tracking
curl -X POST http://localhost:3001/mcp-request \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "scrape_article_content",
      "arguments": {
        "url": "https://www.reuters.com",
        "correlation_id": "task_085668b2-8f3d-418e",
        "outputFormats": ["text", "markdown"]
      }
    }
  }'

# Test with multiple output formats
curl -X POST http://localhost:3001/mcp-request \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "scrape_article_content",
      "arguments": {
        "url": "https://www.theguardian.com",
        "correlation_id": "batch_2025_001_item_042",
        "outputFormats": ["text", "html", "markdown"]
      }
    }
  }'
```

## 🔧 **Configuration Options**

### **Environment Variables**

| Variable            | Default | Description                  |
|---------------------|---------|------------------------------|
| `MCP_SERVER_PORT`   | 3001    | Server port number           |
| `BROWSER_POOL_SIZE` | 5       | Max concurrent browsers      |
| `REQUEST_TIMEOUT`   | 30000   | Request timeout in ms        |
| `CONSENT_TIMEOUT`   | 3000    | Cookie consent timeout in ms |
| `DEBUG_LOGGING`     | false   | Enable debug logging         |

### **Performance Tuning for Different Use Cases**

#### **Fast/Light Configuration**

```json
{
  "env": {
    "BROWSER_POOL_SIZE": "2",
    "CONSENT_TIMEOUT": "2000",
    "REQUEST_TIMEOUT": "20000",
    "DEBUG_LOGGING": "false"
  }
}
```

#### **Thorough/High-Quality Configuration**

```json
{
  "env": {
    "BROWSER_POOL_SIZE": "5",
    "CONSENT_TIMEOUT": "5000",
    "REQUEST_TIMEOUT": "45000",
    "DEBUG_LOGGING": "true"
  }
}
```

## 🎯 **Multiple Server Configurations**

You can configure multiple instances for different purposes:

```json
{
  "mcpServers": {
    "web-scraper-fast": {
      "command": "node",
      "args": ["/path/to/mcp-web-scraper/dist/server.js"],
      "env": {
        "MCP_SERVER_PORT": "3001",
        "BROWSER_POOL_SIZE": "2",
        "CONSENT_TIMEOUT": "2000"
      }
    },
    "web-scraper-thorough": {
      "command": "node", 
      "args": ["/path/to/mcp-web-scraper/dist/server.js"],
      "env": {
        "MCP_SERVER_PORT": "3002",
        "BROWSER_POOL_SIZE": "5",
        "CONSENT_TIMEOUT": "5000"
      }
    }
  }
}
```

## 🐛 **Troubleshooting**

### **Common Issues**

#### **Server Not Starting**

```bash
# Check if port is already in use
lsof -ti:3001

# Kill existing process if needed
kill $(lsof -ti:3001)

# Check server logs
npm start
# Look for error messages in output
```

#### **Claude Desktop Not Connecting**

1. **Verify config file location and syntax**:
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .
   ```

2. **Check absolute paths**:
   ```bash
   # Make sure path exists
   ls -la /path/to/your/dist/server.js
   ```

3. **Test manually first**:
   ```bash
   # Start server manually
   cd /path/to/mcp-web-scraper
   npm start
   # Then configure Claude Desktop to connect to running server
   ```

#### **Permission Issues**

```bash
# Make sure script is executable
chmod +x /path/to/mcp-web-scraper/dist/server.js

# Check node permissions
which node
node --version
```

#### **Docker Issues**

```bash
# Build local image if needed
docker build -t mcp-web-scraper .

# Check if image exists
docker images | grep mcp-web-scraper

# Test Docker run manually
docker run -p 3001:3001 mcp-web-scraper:latest
```

### **Debug Mode Configuration**

For troubleshooting, use this configuration:

```json
{
  "mcpServers": {
    "mcp-web-scraper-debug": {
      "command": "node",
      "args": ["/path/to/mcp-web-scraper/dist/server.js"],
      "env": {
        "DEBUG_LOGGING": "true",
        "BROWSER_POOL_SIZE": "1",
        "MCP_SERVER_PORT": "3001"
      }
    }
  }
}
```

## 🔍 **Verification Steps**

After configuring Claude Desktop:

1. **Restart Claude Desktop completely**
2. **Check Claude's MCP connection status** (usually shown in settings or debug info)
3. **Try using the tools in a conversation**:
   ```
   Can you test the cookie consent handling on https://www.bbc.com?
   ```

4. **Check server logs** for connection attempts and errors

## 🚀 **Production Configuration**

For production use with volume mounts:

```json
{
  "mcpServers": {
    "production-web-scraper": {
      "command": "docker",
      "args": [
        "run", "--rm",
        "-p", "3001:3001",
        "-v", "/local/output:/app/output",
        "-v", "/local/logs:/app/logs",
        "mcp-web-scraper:latest"
      ],
      "env": {
        "BROWSER_POOL_SIZE": "5",
        "DEBUG_LOGGING": "false",
        "REQUEST_TIMEOUT": "30000"
      }
    }
  }
}
```

## 📝 **Current Tool Inventory**

When testing, these tools are available:

1. **`scrape_article_content`** - Extract article content with cookie consent
    - **NEW**: `correlation_id` parameter for request tracking
    - **NEW**: `outputFormats` parameter: `["text", "html", "markdown"]`
    - **NEW**: Multiple output format support with Turndown markdown conversion

2. **`get_page_screenshot`** - Capture page screenshots
    - **NEW**: `correlation_id` parameter for request tracking

3. **`handle_cookie_consent`** - Test cookie consent handling
    - **NEW**: `correlation_id` parameter for request tracking

Example usage in Claude:

```
Please scrape this article: https://www.theguardian.com/technology/article
```

### **Correlation Tracking Usage**

All tools now support correlation tracking for batch processing and real-time monitoring:

```
Please scrape these articles and track them with correlation ID "async-task-worker_analysis_2025_001":
- https://www.reuters.com/business/article1
- https://www.bbc.com/news/article2

Use correlation_id: "async-task-worker_analysis_2025_001_batch" and get both text and markdown formats.
```

---

**Note**: This configuration is for mcp-web-scraper v1.0.0. Update the Docker image tag and paths as needed for your
specific setup.