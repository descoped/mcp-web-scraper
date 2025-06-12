# Scripts Directory

This directory contains utility scripts used during development and testing.

## Files

- **simple-test.js** - Simple compiled test script for HybridDetector with Norwegian MSN URL
- **test_cookie_consent.sh** - Shell script for testing cookie consent functionality
- **update-test-imports.js** - Script to update import statements in test files

## Usage

Scripts can be run from the project root:

```bash
# Run simple hybrid detector test
node scripts/simple-test.js

# Test cookie consent handling
bash scripts/test_cookie_consent.sh

# Update test imports (development utility)
node scripts/update-test-imports.js
```

## Notes

These scripts were moved from the project root to maintain a clean directory structure.
All scripts reference paths relative to the project root and should be executed from there.