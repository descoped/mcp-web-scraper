# Navigation & Interaction Implementation Plan

This document outlines the plan to add Microsoft Playwright MCP's navigation capabilities to the MCP Web Scraper while maintaining the specialized cookie consent handling.

## 🎯 **Implementation Strategy**

### **Core Principles**
1. **Preserve Existing Value**: Keep all current cookie consent and scraping capabilities
2. **Add Navigation Tools**: Implement Microsoft's navigation patterns as additional tools
3. **Session Management**: Add persistent browser sessions for complex flows
4. **Mode Support**: Enable both Snapshot (accessibility) and Vision (visual) modes
5. **Maintain MCP Compliance**: Follow official MCP patterns and conventions

## 📦 **New Components Created**

### **1. Page Manager** (`src/core/pageManager.ts`)
- Manages persistent browser sessions across tool calls
- Tracks navigation history and consent state
- Handles session lifecycle and cleanup
- Provides snapshot capabilities for mode support

### **2. Base Navigation Tool** (`src/tools/baseNavigationTool.ts`)
- Base class for all navigation tools
- Session management helpers
- Common interaction patterns
- Screenshot with element highlighting

### **3. Core Navigation Tools**
- **navigate**: Navigate to URLs with automatic consent handling
- **click**: Click elements using various selectors
- **type**: Type text into input fields
- **get_page_state**: Get page snapshot (Snapshot/Vision mode)
- **login_flow**: Handle login workflows
- **scrape_with_session**: Extract content from current session

## 🔧 **Integration Steps**

### **Step 1: Update Type Definitions**
Add new types to `src/types/index.ts`:

```typescript
export interface PageSessionConfig {
  sessionTimeout: number;
  maxSessions: number;
  autoHandleConsent: boolean;
}

export interface NavigationToolContext extends ToolContext {
  pageManager: PageManager;
  consentHandler: ConsentHandler;
}
```

### **Step 2: Update Server Configuration**
Modify `src/server.ts` to:

1. Import new components:
```typescript
import { PageManager } from './core/pageManager.js';
import { NavigateTool } from './tools/navigateTool.js';
import { ClickTool } from './tools/clickTool.js';
import { TypeTool } from './tools/typeTool.js';
import { GetPageStateTool } from './tools/getPageStateTool.js';
import { LoginFlowTool } from './tools/loginFlowTool.js';
import { ScrapeWithSessionTool } from './tools/scrapeWithSessionTool.js';
```

2. Add PageManager initialization:
```typescript
private pageManager: PageManager;

// In constructor or init:
this.pageManager = new PageManager(
  {
    sessionTimeout: 300000, // 5 minutes
    maxSessions: 10,
    autoHandleConsent: true
  },
  this.logger,
  this.consentHandler
);
```

3. Register new tools:
```typescript
private setupTools(): void {
  // Existing tools
  this.toolRegistry.registerTool(new ScrapeArticleTool());
  this.toolRegistry.registerTool(new ScreenshotTool());
  this.toolRegistry.registerTool(new ConsentTool());
  
  // New navigation tools
  this.toolRegistry.registerTool(new NavigateTool());
  this.toolRegistry.registerTool(new ClickTool());
  this.toolRegistry.registerTool(new TypeTool());
  this.toolRegistry.registerTool(new GetPageStateTool());
  this.toolRegistry.registerTool(new LoginFlowTool());
  this.toolRegistry.registerTool(new ScrapeWithSessionTool());
}
```

4. Pass pageManager in tool context:
```typescript
const context: NavigationToolContext = {
  browserPool: this.browserPool,
  config: this.config,
  consentPatterns: this.consentHandler.patterns,
  pageManager: this.pageManager,
  consentHandler: this.consentHandler,
  logger: this.logger,
  progressToken: request.params.progressToken,
  streamingManager: this.streamingManager
};
```

### **Step 3: Update Package Dependencies**
Add to `package.json`:
```json
{
  "dependencies": {
    // ... existing dependencies
  }
}
```

## 🔄 **Usage Workflows**

### **1. Basic Navigation Flow**
```javascript
// Create session and navigate
const nav = await callTool('navigate', {
  url: 'https://example.com',
  handleConsent: true
});

// Click login button
await callTool('click', {
  sessionId: nav.sessionId,
  text: 'Login'
});

// Fill login form
await callTool('type', {
  sessionId: nav.sessionId,
  selector: '#username',
  text: 'user@example.com'
});
```

### **2. Login Before Scraping**
```javascript
// Handle login
const login = await callTool('login_flow', {
  loginUrl: 'https://site.com/login',
  username: 'user@example.com',
  password: 'password'
});

// Navigate to article
await callTool('navigate', {
  sessionId: login.sessionId,
  url: 'https://site.com/premium-article'
});

// Scrape content
const content = await callTool('scrape_with_session', {
  sessionId: login.sessionId
});
```

### **3. Snapshot Mode Usage**
```javascript
// Get page state for analysis
const state = await callTool('get_page_state', {
  sessionId: sessionId,
  mode: 'snapshot'
});

// Access interactive elements
state.interactiveElements.forEach(element => {
  console.log(`${element.type}: ${element.text} at ${element.selector}`);
});
```

### **4. Vision Mode Usage**
```javascript
// Get visual representation
const state = await callTool('get_page_state', {
  sessionId: sessionId,
  mode: 'vision',
  includeScreenshot: true
});

// Access visible elements with positions
state.visibleElements.forEach(element => {
  console.log(`Text: ${element.text} at (${element.boundingBox.x}, ${element.boundingBox.y})`);
});
```

## 🎯 **Benefits of This Approach**

### **1. Preserves Core Value**
- Cookie consent handling remains the key differentiator
- All existing tools continue to work unchanged
- Production monitoring and rate limiting preserved

### **2. Adds Flexibility**
- Support for complex navigation workflows
- Login and authentication handling
- Multi-step interactions before scraping
- Session persistence for stateful operations

### **3. Mode Support**
- **Snapshot Mode**: Reliable element identification via accessibility tree
- **Vision Mode**: Visual interaction when DOM is complex
- Both modes available through `get_page_state` tool

### **4. Gradual Adoption**
- New tools are opt-in
- Existing workflows continue unchanged
- Can mix session-based and standalone tools

## 📊 **Comparison with Microsoft Playwright MCP**

| Feature | Microsoft's | Ours (Enhanced) |
|---------|------------|-----------------|
| Navigation Tools | 20+ granular tools | 6 high-level tools |
| Cookie Consent | Not handled | Automatic (30+ languages) |
| Session Management | Per-connection | Explicit session IDs |
| Content Extraction | Basic | Advanced with quality scoring |
| Production Features | Development focus | Full monitoring/rate limiting |
| Use Case | General automation | Specialized scraping + navigation |

## 🚀 **Next Steps**

1. **Update Server Code**: Implement the integration steps above
2. **Test Navigation Tools**: Create test suite for new tools
3. **Update Documentation**: Add examples to README and CLAUDE.md
4. **Version Bump**: This would be v1.1.0 (minor version for new features)
5. **Migration Guide**: Document how to use new tools with existing ones

## 🔒 **Backward Compatibility**

- All existing tools remain unchanged
- New tools are additional, not replacements
- Cookie consent handling enhanced but not modified
- API remains 100% backward compatible

This implementation plan allows you to have the best of both worlds: Microsoft's flexible navigation capabilities AND your specialized cookie consent handling for production web scraping.