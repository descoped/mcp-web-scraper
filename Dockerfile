# Dockerfile
# MCP-Compliant Playwright Server (TypeScript Implementation)

# Base stage with Playwright and Node.js
FROM mcr.microsoft.com/playwright:v1.52.0-jammy AS app-base

# Install Node.js, npm, and essential tools using meta-packages
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    ca-certificates \
    git \
    vim \
    net-tools \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* tsconfig.json ./

# Install ALL dependencies (including devDependencies for build)
RUN if [ -f package-lock.json ]; then \
        npm ci && npm cache clean --force; \
    else \
        npm install && npm cache clean --force; \
    fi

# Build stage
FROM app-base AS build

# Copy TypeScript source code
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# Production stage
FROM app-base AS production

# Install only production dependencies
RUN if [ -f package-lock.json ]; then \
        npm ci --omit=dev && npm cache clean --force; \
    else \
        npm install --omit=dev && npm cache clean --force; \
    fi

# Copy built JavaScript from build stage
COPY --from=build /app/dist ./dist/

# Copy package.json for runtime
COPY package.json ./

# Create logs and screenshots directories
RUN mkdir -p /app/logs /app/screenshots

# Set environment variables
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NODE_ENV=production
ENV MCP_SERVER_PORT=3001
ENV BROWSER_POOL_SIZE=5
ENV REQUEST_TIMEOUT=30000
ENV CONSENT_TIMEOUT=3000
ENV DEBUG_LOGGING=false

# Expose port for MCP communication
EXPOSE 3001

# Enhanced health check using MCP protocol
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Default command runs compiled TypeScript server
CMD ["node", "dist/server.js"]