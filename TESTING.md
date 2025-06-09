# Cookie Consent Testing Framework

This directory contains comprehensive testing scripts for validating cookie consent dialog handling across international news sites using the MCP Playwright server.

## Scripts Overview

### `test_cookie_consent.sh`
**Purpose**: Comprehensive cookie consent testing across international news sites
- Tests 90+ news sites across Scandinavian, European, and American regions  
- QUICK mode for fast validation (6 representative sites)
- Desktop and mobile user agent testing (mobile optional)
- Parallel execution with configurable job limits
- Comprehensive reporting (JSON, CSV, logs, screenshots)
- Enhanced cookie consent detection using MCP server response data

**Usage**:
```bash
# Quick test (6 representative sites) - recommended for validation
./test_cookie_consent.sh QUICK

# Test specific regions
./test_cookie_consent.sh SCANDINAVIAN
./test_cookie_consent.sh EUROPEAN AMERICAN

# Test all regions (90+ sites)
./test_cookie_consent.sh ALL

# Test with mobile user agents and verbose output
./test_cookie_consent.sh -v -m QUICK

# Custom configuration
./test_cookie_consent.sh --timeout 60 --jobs 10 --verbose SCANDINAVIAN

# Enable accessibility check (disabled by default due to false negatives)
./test_cookie_consent.sh -a QUICK
```

## Site Coverage

### QUICK (6 sites)
Representative sites for fast validation: VG, NRK, Guardian, BBC, CNN, Reuters

### SCANDINAVIAN (23 sites)
Norway, Sweden, Denmark, Finland, Iceland news sites including major outlets like VG, Aftenposten, SVT, DR, YLE, Visir.

### EUROPEAN (35 sites) 
UK, Germany, France, Italy, Spain, Ireland, EU-wide news sites including BBC, Guardian, Reuters, Spiegel, Le Monde, Corriere.

### AMERICAN (32 sites)
US news sites including CNN, Fox News, NYT, Washington Post, regional papers, and digital-first outlets.

## Prerequisites

1. **MCP Playwright Server Running**:
   ```bash
   docker compose up -d mcp-web-scraper
   ```

2. **Required Tools**:
   - `curl` - HTTP requests
   - `jq` - JSON processing  
   - `bc` - Mathematical calculations

3. **Verify Server Health**:
   ```bash
   curl http://localhost:3001/health
   ```

## Test Methodology

### Cookie Consent Detection (Enhanced)
The script leverages the MCP server's enhanced cookie consent detection:

1. **Enhanced CMP Detection**: Detects OneTrust, Quantcast, TrustArc, Cookiebot, and other platforms
2. **Multi-method Handling**: Text matching, CSS selectors, iframe detection
3. **Detailed Response Analysis**: 
   - `success`: Whether consent was handled
   - `method`: How consent was handled (text, selector, iframe)
   - `reason`: Detailed explanation (e.g., "accepted_main_frame", "no_dialogs_found")
4. **Fallback Content Detection**: Content extraction validation when consent data unavailable

### Validation Criteria
- ✅ **Accessibility Check**: Disabled by default (use `-a` to enable)
- ✅ **Cookie Dialog Handling**: Enhanced detection via MCP server
- ✅ **Content Extraction**: Title and article content validation
- ✅ **Screenshot Capture**: Visual verification saved to `/output/scraping/screenshot/`
- ✅ **Response Time Measurement**: Performance tracking

### User Agents
- **Desktop**: Chrome 120 on Windows 10 (default)
- **Mobile**: Safari on iPhone (enabled with `-m` flag)

## Output Structure

```
output/scraping/
├── result/
│   ├── test_run_TIMESTAMP.log           # Detailed execution log
│   ├── summary_TIMESTAMP.json           # JSON summary with statistics  
│   └── results_TIMESTAMP.csv            # CSV data for analysis
└── screenshot/
    └── SITE_TYPE_TIMESTAMP.png          # Visual verification screenshots
```

## Report Analysis

### JSON Summary Report
```json
{
  "timestamp": "2025-06-07T11:26:32+02:00",
  "summary": {
    "total_tests": 6,
    "passed_tests": 6,
    "failed_tests": 0,
    "skipped_tests": 0,
    "success_rate": 100.00,
    "total_duration_seconds": 52,
    "mobile_testing_enabled": false
  },
  "configuration": {
    "mcp_endpoint": "http://localhost:3001",
    "timeout": 60,
    "retry_count": 3,
    "max_parallel_jobs": 5
  }
}
```

### CSV Results
Columns: `url`, `test_type`, `status`, `cookie_handled`, `content_loaded`, `duration`, `error`

Example entries:
```csv
"www.bbc.com","desktop","success",true,false,42.108074000,"Consent handled: accepted_iframe via .sp_choice_type_11"
"www.nrk.no","desktop","success",true,false,12.494209000,"Consent handled: accepted_main_frame via text:OK"
```

### Status Values
- `success`: Cookie consent handled successfully
- `consent_failed`: Consent detection failed
- `error`: Request failed or server error
- `no_content`: Site loaded but no content extracted
- `invalid_response`: Non-JSON response from MCP server

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `--timeout` | 60 | Request timeout in seconds |
| `--retry` | 3 | Number of retry attempts |
| `--jobs` | 5 | Maximum parallel jobs |
| `--verbose` | false | Enable debug logging |
| `--mobile` | false | Test mobile user agents |
| `--endpoint` | localhost:3001 | MCP server endpoint |
| `--accessibility` | false | Enable accessibility check (disabled due to false negatives) |

## Performance Features

### Parallel Execution
- **Default**: 5 concurrent jobs for optimal performance
- **Scalable**: Increase `--jobs` for faster execution
- **Batched Processing**: Sites processed in batches to avoid server overload
- **Fixed Counter Logic**: Accurate test statistics regardless of parallel execution

### Enhanced Timeouts
- **Individual requests**: 60 seconds default (doubled for MCP operations)
- **Screenshot capture**: Included in request timeout
- **Graceful failures**: Proper error handling and retries

### Smart Network Handling
- **Automatic retries**: Failed requests retried up to 3 times
- **Accessibility bypass**: Skips broken accessibility check by default
- **DNS tracking**: Resolution timing measurement

## Troubleshooting

### Common Issues

1. **MCP Server Not Running**
   ```bash
   docker compose up -d mcp-web-scraper
   curl http://localhost:3001/health
   ```

2. **High Failure Rate**
   - Check network connectivity
   - Verify MCP server logs: `docker logs mcp-web-scraper`
   - Try quick test first: `./test_cookie_consent.sh QUICK`

3. **Zero Test Counters**
   - ✅ **Fixed**: Counters now calculated from CSV results after parallel execution
   - Previous issue with subshell counter updates resolved

4. **Accessibility False Negatives**
   - ✅ **Fixed**: Accessibility check disabled by default
   - Use `-a` flag only if needed (may cause false negatives)

5. **Missing Dependencies**
   ```bash
   # macOS
   brew install jq bc curl
   
   # Ubuntu/Debian
   apt-get install jq bc curl
   ```

### Debug Mode
```bash
./test_cookie_consent.sh --verbose QUICK
```

### MCP Server Logs
```bash
# Recent logs
docker logs mcp-web-scraper --tail 50

# Follow logs during test
docker logs mcp-web-scraper -f
```

## Integration Examples

### Quick Validation Pipeline
```bash
# Start server and run quick test
docker compose up -d mcp-web-scraper
./test_cookie_consent.sh QUICK
```

### CI/CD Integration
```yaml
- name: Cookie Consent Validation
  run: |
    docker compose up -d mcp-web-scraper
    ./test_cookie_consent.sh QUICK --timeout 45
  artifacts:
    paths:
      - output/scraping/
```

### Regional Testing
```bash
# Test European sites with mobile
./test_cookie_consent.sh -m EUROPEAN

# Test Scandinavian sites with verbose output  
./test_cookie_consent.sh -v SCANDINAVIAN
```

## Recent Improvements (June 2025)

### ✅ Fixed Counter Accumulation
- **Problem**: Test counters showed 0 despite successful tests
- **Solution**: Calculate counters from CSV results after parallel execution
- **Result**: Accurate statistics (e.g., "6/6 passed, 100% success rate")

### ✅ Enhanced Cookie Consent Detection
- **Improved MCP Integration**: Leverages detailed `cookieConsent` object from server
- **Rich Error Messages**: Detailed consent handling explanations
- **Multiple Detection Methods**: Text, selectors, iframe handling

### ✅ Simplified Architecture
- **Single Script**: Removed redundant `test_scandinavian_direct.sh`
- **Consistent Structure**: All tests follow same pattern and output format
- **Reliable Parallel Processing**: Fixed subshell variable scope issues

### ✅ Accessibility Check Fix
- **Default Disabled**: Prevents false negatives from broken accessibility logic
- **Optional Enable**: Use `-a` flag when needed
- **Direct MCP Testing**: Bypasses accessibility for faster, more reliable results

## Help and Usage
```bash
./test_cookie_consent.sh --help
```

This testing framework provides comprehensive and reliable validation of cookie consent handling across international news sites, with enhanced detection capabilities and accurate reporting.