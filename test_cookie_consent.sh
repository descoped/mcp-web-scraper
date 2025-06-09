#!/bin/bash

# Comprehensive Cookie Consent Testing Script for News Sites
# Tests cookie dialog handling across Scandinavian, European, and American news sites

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
RESULTS_DIR="${PROJECT_ROOT}/output/scraping/result"
SCREENSHOT_DIR="${PROJECT_ROOT}/output/scraping/screenshot"
MCP_ENDPOINT="http://localhost:3001"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
VERBOSE=false
MOBILE_TEST=false
RETRY_COUNT=3
TIMEOUT=60
MAX_PARALLEL_JOBS=5
SKIP_ACCESSIBILITY_CHECK=true  # Skip broken accessibility check by default

# Create output directories
mkdir -p "$RESULTS_DIR"
mkdir -p "$SCREENSHOT_DIR"

# Define site collections
get_sites_for_region() {
    local region="$1"
    case "$region" in
        "QUICK")
            echo "www.vg.no www.nrk.no www.theguardian.com www.bbc.com www.cnn.com www.reuters.com"
            ;;
        "SCANDINAVIAN")
            echo "www.aftenposten.no www.vg.no www.nrk.no www.tv2.no www.dagens.no www.nettavisen.no www.document.no www.dn.se www.svt.se www.expressen.se www.aftonbladet.se www.thelocal.se swedenherald.com www.dr.dk www.politiken.dk www.bt.dk www.jyllands-posten.dk www.berlingske.dk www.hs.fi www.yle.fi www.iltalehti.fi www.ruv.is www.visir.is www.mbl.is www.icenews.is www.tnp.no"
            ;;
        "EUROPEAN")
            echo "www.bbc.com www.theguardian.com www.telegraph.co.uk www.independent.co.uk www.reuters.com www.euronews.com www.dw.com www.france24.com www.lemonde.fr www.lefigaro.fr www.liberation.fr www.rfi.fr www.spiegel.de www.zeit.de www.faz.net www.welt.de www.tagesschau.de www.ansa.it www.corriere.it www.repubblica.it www.lastampa.it www.elpais.com www.elmundo.es www.abc.es www.lavanguardia.com www.publico.es www.rte.ie www.irishtimes.com www.thejournal.ie www.politico.eu www.eureporter.co www.euractiv.com www.euobserver.com www.brusselstimes.com www.swissinfo.ch www.dutchnews.nl www.thelocal.com www.balkaninsight.com www.kyivindependent.com"
            ;;
        "AMERICAN")
            echo "www.cnn.com www.foxnews.com www.msnbc.com www.abcnews.go.com www.cbsnews.com www.nbcnews.com www.nytimes.com www.washingtonpost.com www.wsj.com www.usatoday.com www.latimes.com www.chicagotribune.com www.bostonglobe.com www.seattletimes.com www.miamiherald.com www.denverpost.com www.sfgate.com www.huffpost.com www.buzzfeednews.com www.vox.com www.axios.com www.politico.com www.thehill.com www.npr.org www.pbs.org www.apnews.com www.bloomberg.com www.yahoo.com www.msn.com www.newsmax.com www.breitbart.com"
            ;;
        *)
            echo ""
            ;;
    esac
}

# User agents
DESKTOP_UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
MOBILE_UA="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Global counters
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# Log files
MAIN_LOG="${RESULTS_DIR}/test_run_${TIMESTAMP}.log"
SUMMARY_REPORT="${RESULTS_DIR}/summary_${TIMESTAMP}.json"
CSV_REPORT="${RESULTS_DIR}/results_${TIMESTAMP}.csv"

# Functions
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    case "$level" in
        "INFO")  echo -e "${BLUE}[INFO]${NC} $message" ;;
        "WARN")  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} $message" ;;
        "SUCCESS") echo -e "${GREEN}[SUCCESS]${NC} $message" ;;
        "DEBUG") [[ "$VERBOSE" == "true" ]] && echo -e "${PURPLE}[DEBUG]${NC} $message" ;;
    esac
    
    echo "[$timestamp] [$level] $message" >> "$MAIN_LOG"
}

check_dependencies() {
    log "INFO" "Checking dependencies..."
    
    # Check if MCP server is running
    if ! curl -s "$MCP_ENDPOINT/health" > /dev/null 2>&1; then
        log "ERROR" "MCP Playwright server not accessible at $MCP_ENDPOINT"
        log "INFO" "Please start the server with: docker compose up -d mcp-playwright"
        exit 1
    fi
    
    # Check required tools
    local required_tools=("curl" "jq" "bc")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log "ERROR" "Required tool '$tool' is not installed"
            exit 1
        fi
    done
    
    log "SUCCESS" "All dependencies satisfied"
}

test_site_accessibility() {
    local url="$1"
    local protocol="${2:-https}"
    local full_url="${protocol}://${url}"
    
    log "DEBUG" "Testing accessibility for $full_url"
    
    local response
    response=$(curl -s -o /dev/null -w "%{http_code}:%{time_total}:%{time_namelookup}" \
                   --max-time "$TIMEOUT" \
                   --retry 2 \
                   --retry-delay 1 \
                   -H "User-Agent: $DESKTOP_UA" \
                   "$full_url" 2>/dev/null || echo "000:0:0")
    
    local http_code time_total time_dns
    IFS=':' read -r http_code time_total time_dns <<< "$response"
    
    if [[ "$http_code" -ge 200 && "$http_code" -lt 400 ]]; then
        log "DEBUG" "$url - HTTP $http_code, Total: ${time_total}s, DNS: ${time_dns}s"
        echo "accessible:$http_code:$time_total:$time_dns"
    else
        log "DEBUG" "$url - Failed with HTTP $http_code"
        echo "failed:$http_code:$time_total:$time_dns"
    fi
}

test_cookie_consent() {
    local url="$1"
    local user_agent="$2"
    local test_type="$3"  # desktop or mobile
    
    log "DEBUG" "Testing cookie consent for $url ($test_type)"
    
    local start_time=$(date +%s.%N)
    local screenshot_file="${SCREENSHOT_DIR}/${url//\//_}_${test_type}_${TIMESTAMP}.png"
    local test_url="https://$url"
    
    # Test with MCP Playwright server
    local response
    response=$(curl -s \
                   --max-time $((TIMEOUT * 2)) \
                   -H "Content-Type: application/json" \
                   -X POST \
                   "$MCP_ENDPOINT/scrape" \
                   -d "{\"url\": \"$test_url\", \"extractSelectors\": {\"title\": \"h1, .headline, .title\", \"content\": \"article, .content\"}}" \
                   2>/dev/null || echo '{"error": "request_failed"}')
    
    local end_time=$(date +%s.%N)
    local duration=$(echo "$end_time - $start_time" | bc 2>/dev/null || echo "0")
    
    # Also get screenshot
    local screenshot_response
    screenshot_response=$(curl -s -w "%{http_code}" \
                              --max-time "$TIMEOUT" \
                              "$MCP_ENDPOINT/view-screenshot?url=$test_url&fullPage=false" \
                              -o "$screenshot_file" 2>/dev/null || echo "000")
    
    # Check screenshot success
    if [[ "$screenshot_response" != "200" ]]; then
        rm -f "$screenshot_file"
        screenshot_file=""
    fi
    
    # Parse response
    local status="unknown"
    local cookie_handled="false"
    local content_loaded="false"
    local error_message=""
    
    if echo "$response" | jq -e . >/dev/null 2>&1; then
        # Valid JSON response
        if echo "$response" | jq -e '.error' >/dev/null 2>&1; then
            error_message=$(echo "$response" | jq -r '.error')
            status="error"
        else
            # Check if content was extracted
            local title=$(echo "$response" | jq -r '.extracted.title // empty')
            local content=$(echo "$response" | jq -r '.extracted.content // empty')
            
            # Check enhanced cookie consent data from MCP server
            local consent_data=$(echo "$response" | jq -r '.cookieConsent // empty')
            if [[ -n "$consent_data" && "$consent_data" != "null" ]]; then
                local consent_success=$(echo "$consent_data" | jq -r '.success // false')
                local consent_reason=$(echo "$consent_data" | jq -r '.reason // "unknown"')
                local consent_method=$(echo "$consent_data" | jq -r '.method // "none"')
                
                if [[ "$consent_success" == "true" ]]; then
                    cookie_handled="true"
                    status="success"
                    error_message="Consent handled: $consent_reason via $consent_method"
                else
                    cookie_handled="false"
                    status="consent_failed"
                    error_message="Consent failed: $consent_reason"
                fi
            elif [[ -n "$title" || -n "$content" ]]; then
                # Fallback to content-based detection if no consent data
                content_loaded="true"
                status="success"
                cookie_handled="true"
            else
                status="no_content"
            fi
        fi
    else
        status="invalid_response"
        error_message="Non-JSON response received"
    fi
    
    # Create result object
    local result=$(jq -n \
        --arg url "$url" \
        --arg test_type "$test_type" \
        --arg status "$status" \
        --arg cookie_handled "$cookie_handled" \
        --arg content_loaded "$content_loaded" \
        --arg duration "$duration" \
        --arg error "$error_message" \
        --arg screenshot_file "$screenshot_file" \
        '{
            url: $url,
            test_type: $test_type,
            status: $status,
            cookie_handled: ($cookie_handled == "true"),
            content_loaded: ($content_loaded == "true"),
            duration: ($duration | tonumber),
            error: $error,
            screenshot_file: $screenshot_file,
            timestamp: now
        }')
    
    echo "$result"
}

test_site() {
    local url="$1"
    local region="$2"
    
    log "INFO" "Testing $url ($region)"
    
    # Skip accessibility check if disabled (default: skip due to bug)
    if [[ "$SKIP_ACCESSIBILITY_CHECK" != "true" ]]; then
        # Test accessibility first
        local accessibility_result
        accessibility_result=$(test_site_accessibility "$url")
        
        local access_status time_total
        IFS=':' read -r access_status _ time_total _ <<< "$accessibility_result"
        
        if [[ "$access_status" != "accessible" ]]; then
            log "WARN" "$url - Site not accessible, skipping cookie tests"
            ((SKIPPED_TESTS++))
            return 1
        fi
    else
        log "DEBUG" "Skipping accessibility check (direct MCP testing enabled)"
    fi
    
    local results=()
    
    # Desktop test
    local desktop_result
    desktop_result=$(test_cookie_consent "$url" "$DESKTOP_UA" "desktop")
    results+=("$desktop_result")
    
    # Mobile test (if enabled)
    if [[ "$MOBILE_TEST" == "true" ]]; then
        local mobile_result
        mobile_result=$(test_cookie_consent "$url" "$MOBILE_UA" "mobile")
        results+=("$mobile_result")
    fi
    
    # Process results
    local all_passed=true
    for result in "${results[@]}"; do
        # Check if result is valid JSON
        if ! echo "$result" | jq -e . >/dev/null 2>&1; then
            log "ERROR" "$url - Invalid result JSON"
            ((FAILED_TESTS++))
            all_passed=false
            continue
        fi
        
        local status
        status=$(echo "$result" | jq -r '.status // "unknown"')
        local test_type
        test_type=$(echo "$result" | jq -r '.test_type // "desktop"')
        local cookie_handled
        cookie_handled=$(echo "$result" | jq -r '.cookie_handled // false')
        local duration
        duration=$(echo "$result" | jq -r '.duration // 0')
        local error_msg
        error_msg=$(echo "$result" | jq -r '.error // ""')
        
        ((TOTAL_TESTS++))
        
        if [[ "$status" == "success" && "$cookie_handled" == "true" ]]; then
            log "SUCCESS" "$url ($test_type) - Cookie consent handled successfully (${duration}s)"
            ((PASSED_TESTS++))
        else
            log "ERROR" "$url ($test_type) - Failed: $error_msg"
            ((FAILED_TESTS++))
            all_passed=false
        fi
        
        # Append to CSV report
        echo "$result" | jq -r '[.url, .test_type, .status, .cookie_handled, .content_loaded, .duration, .error] | @csv' >> "$CSV_REPORT"
    done
    
    return $([ "$all_passed" = true ] && echo 0 || echo 1)
}

test_region() {
    local region="$1"
    local sites
    sites=$(get_sites_for_region "$region")
    
    log "INFO" "Testing $region region sites..."
    
    local region_start_time=$(date +%s)
    
    # Process sites in parallel batches
    local site_list=($sites)
    local total_sites=${#site_list[@]}
    
    for ((i=0; i<total_sites; i+=MAX_PARALLEL_JOBS)); do
        local batch_pids=()
        
        for ((j=i; j<i+MAX_PARALLEL_JOBS && j<total_sites; j++)); do
            local site="${site_list[j]}"
            (
                test_site "$site" "$region"
            ) &
            batch_pids+=($!)
        done
        
        # Wait for batch to complete
        for pid in "${batch_pids[@]}"; do
            wait "$pid"
        done
    done
    
    local region_end_time=$(date +%s)
    local region_duration=$((region_end_time - region_start_time))
    
    log "INFO" "$region region completed in ${region_duration}s"
}

generate_reports() {
    log "INFO" "Generating comprehensive reports..."
    
    # Calculate counters from CSV file (since parallel execution doesn't update global counters)
    if [[ -f "$CSV_REPORT" ]]; then
        # Count total tests (excluding header)
        TOTAL_TESTS=$(tail -n +2 "$CSV_REPORT" | wc -l | tr -d ' ')
        
        # Count passed tests (status=success AND cookie_handled=true)
        PASSED_TESTS=$(tail -n +2 "$CSV_REPORT" | awk -F',' '$3=="\"success\"" && $4=="true" {count++} END {print count+0}')
        
        # Count failed tests (status!=success OR cookie_handled!=true)
        FAILED_TESTS=$(tail -n +2 "$CSV_REPORT" | awk -F',' '$3!="\"success\"" || $4!="true" {count++} END {print count+0}')
        
        # SKIPPED_TESTS remains as set during execution
    fi
    
    # Summary statistics
    local total_duration=$(($(date +%s) - START_TIME))
    local success_rate=0
    
    if [[ $TOTAL_TESTS -gt 0 ]]; then
        success_rate=$(echo "scale=2; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
    fi
    
    # JSON summary report
    jq -n \
        --arg timestamp "$(date -Iseconds)" \
        --arg total_tests "$TOTAL_TESTS" \
        --arg passed_tests "$PASSED_TESTS" \
        --arg failed_tests "$FAILED_TESTS" \
        --arg skipped_tests "$SKIPPED_TESTS" \
        --arg success_rate "$success_rate" \
        --arg total_duration "$total_duration" \
        --arg mobile_test "$MOBILE_TEST" \
        '{
            timestamp: $timestamp,
            summary: {
                total_tests: ($total_tests | tonumber),
                passed_tests: ($passed_tests | tonumber),
                failed_tests: ($failed_tests | tonumber),
                skipped_tests: ($skipped_tests | tonumber),
                success_rate: ($success_rate | tonumber),
                total_duration_seconds: ($total_duration | tonumber),
                mobile_testing_enabled: ($mobile_test == "true")
            },
            configuration: {
                mcp_endpoint: "'"$MCP_ENDPOINT"'",
                timeout: '"$TIMEOUT"',
                retry_count: '"$RETRY_COUNT"',
                max_parallel_jobs: '"$MAX_PARALLEL_JOBS"'
            }
        }' > "$SUMMARY_REPORT"
    
    # Console summary
    echo
    log "INFO" "=== TEST SUMMARY ==="
    log "INFO" "Total Tests: $TOTAL_TESTS"
    log "SUCCESS" "Passed: $PASSED_TESTS"
    log "ERROR" "Failed: $FAILED_TESTS"
    log "WARN" "Skipped: $SKIPPED_TESTS"
    log "INFO" "Success Rate: ${success_rate}%"
    log "INFO" "Total Duration: ${total_duration}s"
    echo
    log "INFO" "Reports generated:"
    log "INFO" "  - Summary: $SUMMARY_REPORT"
    log "INFO" "  - CSV: $CSV_REPORT" 
    log "INFO" "  - Main Log: $MAIN_LOG"
    log "INFO" "  - Screenshots: $SCREENSHOT_DIR"
}

show_help() {
    cat << EOF
Cookie Consent Testing Script for News Sites

Usage: $0 [OPTIONS] [REGIONS...]

OPTIONS:
    -v, --verbose           Enable verbose logging
    -m, --mobile           Also test with mobile user agent
    -t, --timeout SEC      Set timeout for requests (default: $TIMEOUT)
    -r, --retry COUNT      Set retry count (default: $RETRY_COUNT)
    -j, --jobs COUNT       Max parallel jobs (default: $MAX_PARALLEL_JOBS)
    -e, --endpoint URL     MCP server endpoint (default: $MCP_ENDPOINT)
    -a, --accessibility    Enable accessibility check (default: disabled)
    -h, --help             Show this help message

REGIONS:
    SCANDINAVIAN          Test Scandinavian news sites
    EUROPEAN              Test European news sites  
    AMERICAN              Test American news sites
    QUICK                 Test 6 representative sites only
    ALL                   Test all regions (default)

EXAMPLES:
    $0                              # Test all regions
    $0 QUICK                        # Quick test with 6 representative sites
    $0 SCANDINAVIAN                 # Test only Scandinavian sites
    $0 -v -m EUROPEAN AMERICAN      # Test European and American with verbose output and mobile
    $0 --timeout 60 --jobs 10 ALL   # Test all with custom timeout and job count

OUTPUT:
    Results are saved to: $RESULTS_DIR/
    - logs/test_run_TIMESTAMP.log           # Detailed execution log
    - reports/summary_TIMESTAMP.json        # JSON summary report
    - reports/results_TIMESTAMP.csv         # CSV results for analysis
    - screenshots/SITE_TYPE_TIMESTAMP.png   # Screenshots for verification

EOF
}

main() {
    local regions_to_test=("ALL")
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -m|--mobile)
                MOBILE_TEST=true
                shift
                ;;
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -r|--retry)
                RETRY_COUNT="$2"
                shift 2
                ;;
            -j|--jobs)
                MAX_PARALLEL_JOBS="$2"
                shift 2
                ;;
            -e|--endpoint)
                MCP_ENDPOINT="$2"
                shift 2
                ;;
            -a|--accessibility)
                SKIP_ACCESSIBILITY_CHECK=false
                log "INFO" "Accessibility check enabled (warning: may cause false negatives)"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            SCANDINAVIAN|EUROPEAN|AMERICAN|QUICK|ALL)
                if [[ "${regions_to_test[0]}" == "ALL" ]]; then
                    regions_to_test=("$1")
                else
                    regions_to_test+=("$1")
                fi
                shift
                ;;
            *)
                log "ERROR" "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
    
    # Initialize
    START_TIME=$(date +%s)
    
    log "INFO" "Starting Cookie Consent Testing Suite"
    log "INFO" "Timestamp: $(date -Iseconds)"
    log "INFO" "Results directory: $RESULTS_DIR"
    log "INFO" "Mobile testing: $MOBILE_TEST"
    log "INFO" "Verbose logging: $VERBOSE"
    
    # Check dependencies
    check_dependencies
    
    # Determine regions to test
    if [[ "${regions_to_test[0]}" == "ALL" ]]; then
        regions_to_test=("SCANDINAVIAN" "EUROPEAN" "AMERICAN")
    fi
    
    log "INFO" "Testing regions: ${regions_to_test[*]}"
    
    # Initialize CSV report with headers
    echo "url,test_type,status,cookie_handled,content_loaded,duration,error" > "$CSV_REPORT"
    
    # Run tests for each region
    for region in "${regions_to_test[@]}"; do
        local sites
        sites=$(get_sites_for_region "$region")
        if [[ -n "$sites" ]]; then
            test_region "$region"
        else
            log "ERROR" "Unknown region: $region"
        fi
    done
    
    # Generate reports
    generate_reports
    
    # Exit with appropriate code
    if [[ $FAILED_TESTS -eq 0 ]]; then
        log "SUCCESS" "All tests completed successfully!"
        exit 0
    else
        log "WARN" "Some tests failed. Check reports for details."
        exit 1
    fi
}

# Handle script interruption
trap 'log "WARN" "Script interrupted"; exit 130' INT TERM

# Run main function
main "$@"