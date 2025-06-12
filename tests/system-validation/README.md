# Phase 3.6 - System Validation Pipeline

**Domain**: Operational tooling for MCP-native collection and validation  
**Purpose**: End-to-end system validation using production MCP tools  
**Scope**: Completely separate from test suite - operational infrastructure

## 🎯 Overview

The System Validation Pipeline provides comprehensive data collection and production validation capabilities using the
complete MCP toolchain. This ensures realistic testing conditions and validates the actual tools that clients will use.

## 🏗️ Architecture

### Core Components

- **SystemValidationController**: Orchestrates collection → validation → reporting lifecycle
- **MCPCollectionValidator**: URL discovery using production MCP navigation and scraping tools
- **MCPExtractionValidator**: Production validation with consent handling and rate limiting
- **DatasetManager**: YAML dataset management and updates
- **ValidationReporter**: Comprehensive reporting and analysis

### MCP Integration

All components use production MCP tools:

- `scrapeArticleTool` for content extraction
- `navigateTool` for realistic navigation
- `consentTool` for cookie consent handling
- Full browser pool and rate limiting

## 🚀 Usage

### Quick Start

```bash
# Show dataset status
npx tsx tests/run-system-validation.ts --status

# Collect URLs for Scandinavian sites
npx tsx tests/run-system-validation.ts --collect-only --regions scandinavian

# Validate existing URLs
npx tsx tests/run-system-validation.ts --validate-only --regions scandinavian

# Full pipeline (collection + validation)
npx tsx tests/run-system-validation.ts --full-pipeline --regions scandinavian
```

### Advanced Usage

```bash
# Limited scope for testing
npx tsx tests/run-system-validation.ts --regions scandinavian --max-domains 3 --max-articles 2

# Performance testing with benchmarking
npx tsx tests/run-system-validation.ts --validate-only --regions all --disable-rate-limit

# High-quality collection only
npx tsx tests/run-system-validation.ts --collect-only --quality-threshold 0.7 --max-articles 10

# Production readiness assessment
npx tsx tests/run-system-validation.ts --full-pipeline --regions all --browser-pool 8
```

## 📋 Command Reference

### Operational Modes

- `--collect-only` - URL collection using MCP tools
- `--validate-only` - Validation using production MCP tools
- `--full-pipeline` - Complete collection + validation (default)

### Scope Configuration

- `--regions <list>` - Comma-separated regions (scandinavian,european,american)
- `--max-domains <num>` - Maximum domains per region
- `--max-articles <num>` - Maximum articles per domain (default: 5)

### MCP Configuration

- `--enable-consent` / `--disable-consent` - Cookie consent handling
- `--enable-rate-limit` / `--disable-rate-limit` - Rate limiting
- `--quality-threshold <num>` - Quality threshold 0-1 (default: 0.4)
- `--timeout <ms>` - Timeout per URL (default: 30000)
- `--browser-pool <num>` - Browser pool size (default: 4)

### File Configuration

- `--dataset-file <path>` - Dataset YAML file (default: ./config/article-test-urls.yaml)
- `--output-dir <path>` - Output directory (default: ./output/system-validation)

### Utility Options

- `--status` - Show dataset status and exit
- `--verbose` - Detailed logging and output

## 📊 Output Reports

### Generated Reports

- **Executive Summary** (`executive-summary-*.json`) - High-level metrics for stakeholders
- **Detailed Report** (`detailed-report-*.yaml`) - Comprehensive technical analysis
- **Validation CSV** (`validation-results-*.csv`) - Per-URL validation data
- **Production Readiness** (`production-readiness-*.md`) - Deployment assessment
- **Metrics Summary** (`metrics-summary-*.json`) - Monitoring data

### Report Contents

- Collection performance (URLs discovered, validated, added)
- Validation results (success rates, quality scores, extraction times)
- Consent handling effectiveness across languages
- Production readiness assessment
- Performance benchmarking and optimization recommendations

## 🔧 Configuration

### Default Configuration

See `config/validation-config.yaml` for default settings.

### Dataset Format

Uses the existing `config/article-test-urls.yaml` format with automatic updates.

### Environment Variables

- `SYSTEM_VALIDATION_OUTPUT_DIR` - Override output directory
- `SYSTEM_VALIDATION_BROWSER_POOL` - Override browser pool size
- `SYSTEM_VALIDATION_TIMEOUT` - Override default timeout

## 📈 Production Readiness Criteria

### Automated Assessment

- **Success Rate**: ≥70% extraction success
- **Dataset Completeness**: ≥80% of target URLs
- **Consent Coverage**: ≥80% consent handling rate
- **Performance**: ≤5000ms average extraction time

### Quality Metrics

- Field extraction rates (title, content, author, date)
- Content quality scoring
- Frontpage risk assessment
- Error categorization and analysis

## 🔄 Workflow Integration

### Development Lifecycle

1. **Collection Phase**: Discover and validate new article URLs
2. **Validation Phase**: Test extraction with production MCP tools
3. **Analysis Phase**: Generate comprehensive reports
4. **Dataset Update**: Automatically update YAML with new URLs

### CI/CD Integration

```bash
# Pre-deployment validation
npx tsx tests/run-system-validation.ts --validate-only --regions all

# Post-deployment verification  
npx tsx tests/run-system-validation.ts --full-pipeline --regions scandinavian --max-domains 2
```

## 🎯 Key Benefits

### vs Phase 3.5 (Bypassed APIs)

- ✅ **Realistic Conditions**: Uses production MCP tools with consent and rate limiting
- ✅ **Production Validation**: True dogfooding of client-facing tools
- ✅ **Consistent Architecture**: Same tools for collection and validation

### vs Phase 3.5.1 (Read-Only)

- ✅ **Dataset Growth**: Can collect and add new URLs
- ✅ **Comprehensive Coverage**: Both collection and validation in single pipeline
- ✅ **Operational Workflow**: Complete collection → validation → reporting lifecycle

### vs Test Suite

- ✅ **Operational Focus**: Data collection and production validation (not unit testing)
- ✅ **Real-World Scale**: Tests hundreds of URLs across multiple domains
- ✅ **Business Metrics**: Production readiness and deployment assessment

## ⚠️ Important Notes

### Separation from Test Suite

- **Completely separate** from `npm test` and regular test suite
- **Operational tooling** for data collection and production validation
- **Different domain** - system validation vs code correctness testing

### Resource Requirements

- Requires browser automation (Playwright)
- Network connectivity for real website testing
- Sufficient memory for browser pool operations
- Rate limiting may extend execution time

### Best Practices

- Run `--status` first to understand current dataset state
- Use `--max-domains` for testing to limit scope
- Enable `--verbose` for troubleshooting
- Monitor output directory for disk space usage

---

**Phase 3.6 System Validation Pipeline** - Production-ready operational tooling for MCP Web Scraper system validation
and dataset management.