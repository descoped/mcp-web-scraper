# Content Selector Specification for MCP Web Scraper

## Overview

This specification defines the comprehensive selector strategy for content extraction in the MCP Web Scraper. The
approach combines standards-compliant HTML detection with progressive fallback mechanisms to accurately identify and
extract article content across diverse web architectures.

## 1. Content Detection Strategy

### 1.1 Document Type Detection

Selector strategies are determined by document type analysis in the following priority order:

| Priority | Detection Method | Indicator                                                             | Determination               |
|----------|------------------|-----------------------------------------------------------------------|-----------------------------|
| 1        | DOCTYPE          | `<!DOCTYPE html>`                                                     | HTML5                       |
| 2        | DOCTYPE          | `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">`                  | HTML 4.01 Strict            |
| 3        | DOCTYPE          | `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">`     | HTML 4.01 Transitional      |
| 4        | DOCTYPE          | `<!DOCTYPE HTML PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN">`           | XHTML 1.0                   |
| 5        | Meta Tags        | `<meta charset="UTF-8">`                                              | HTML5 (secondary indicator) |
| 6        | Meta Tags        | `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">` | HTML4/XHTML indicator       |
| 7        | No DOCTYPE       | Missing or malformed                                                  | Quirks mode (assume HTML4)  |

### 1.2 Structured Data Detection

Structured data provides the highest confidence content identification:

| Schema Type          | Detection Method                                 | DOM Query                                                               |
|----------------------|--------------------------------------------------|-------------------------------------------------------------------------|
| Schema.org JSON-LD   | `<script type="application/ld+json">`            | `document.querySelector('script[type="application/ld+json"]')`          |
| Schema.org Microdata | `itemscope itemtype="http://schema.org/Article"` | `document.querySelector('[itemscope][itemtype*="Article"]')`            |
| OpenGraph            | `<meta property="og:type" content="article">`    | `document.querySelector('meta[property="og:type"][content="article"]')` |
| Twitter Cards        | `<meta name="twitter:card">`                     | `document.querySelector('meta[name="twitter:card"]')`                   |

## 2. Article Boundary Detection Matrix

### 2.1 Primary Container Selectors

Content containers are identified using a three-tier priority system:

| Priority                          | HTML5 Selector              | HTML4/Legacy Selector         | CSS Query                   | XPath Expression                                         |
|-----------------------------------|-----------------------------|-------------------------------|-----------------------------|----------------------------------------------------------|
| **Level 1: Semantic Elements**    |
| 1a                                | `<article>`                 | `<div class="article">`       | `article`                   | `//article`                                              |
| 1b                                | `<main>`                    | `<div id="main">`             | `main`                      | `//main`                                                 |
| 1c                                | `<article role="article">`  | `<div role="article">`        | `[role="article"]`          | `//*[@role="article"]`                                   |
| **Level 2: Content Body**         |
| 2a                                | `<article> > *`             | `<div class="article-body">`  | `article > *`               | `//article/*`                                            |
| 2b                                | `<section class="content">` | `<div class="content">`       | `section.content, .content` | `//section[@class="content"] \| //div[@class="content"]` |
| 2c                                | `[itemprop="articleBody"]`  | `<div class="entry-content">` | `[itemprop="articleBody"]`  | `//*[@itemprop="articleBody"]`                           |
| **Level 3: Class-based Patterns** |
| 3a                                | N/A                         | `.post-content`               | `.post-content`             | `//*[contains(@class,"post-content")]`                   |
| 3b                                | N/A                         | `.article-text`               | `.article-text`             | `//*[contains(@class,"article-text")]`                   |
| 3c                                | N/A                         | `.story-body`                 | `.story-body`               | `//*[contains(@class,"story-body")]`                     |

### 2.2 Article Header Detection

Article titles and headlines follow semantic priority patterns:

| Priority | HTML5 Selector                | HTML4/Legacy Selector          | CSS Query                  | XPath Expression             |
|----------|-------------------------------|--------------------------------|----------------------------|------------------------------|
| 1        | `<header>` within `<article>` | `<div class="article-header">` | `article header`           | `//article/header`           |
| 2        | `<h1 itemprop="headline">`    | `<h1 class="title">`           | `h1[itemprop="headline"]`  | `//h1[@itemprop="headline"]` |
| 3        | First `<h1>` in article       | First `<h1>` in content        | `article h1:first-of-type` | `//article//h1[1]`           |

### 2.3 Metadata Extraction

Article metadata extraction follows structured data preferences:

| Metadata   | HTML5 Selector               | HTML4/Legacy Selector    | CSS Query                    | XPath Expression                 |
|------------|------------------------------|--------------------------|------------------------------|----------------------------------|
| **Date**   |
| Primary    | `<time datetime="">`         | `<span class="date">`    | `time[datetime]`             | `//time[@datetime]`              |
| Secondary  | `[itemprop="datePublished"]` | `.published-date`        | `[itemprop="datePublished"]` | `//*[@itemprop="datePublished"]` |
| **Author** |
| Primary    | `<address rel="author">`     | `<span class="author">`  | `address[rel="author"]`      | `//address[@rel="author"]`       |
| Secondary  | `[itemprop="author"]`        | `.by-line, .author-name` | `[itemprop="author"]`        | `//*[@itemprop="author"]`        |

## 3. Content Exclusion Patterns

### 3.1 Elements to Exclude

Non-content elements must be systematically excluded to maintain extraction quality:

| Element Type     | Common Selectors                  | CSS Query                        | XPath Expression                                                  |
|------------------|-----------------------------------|----------------------------------|-------------------------------------------------------------------|
| Navigation       | `<nav>`, `.navigation`            | `nav, .navigation, .nav`         | `//nav \| //*[contains(@class,"nav")]`                            |
| Sidebar          | `<aside>`, `.sidebar`             | `aside, .sidebar`                | `//aside \| //*[contains(@class,"sidebar")]`                      |
| Comments         | `#comments`, `.comments`          | `#comments, .comments`           | `//*[@id="comments"] \| //*[contains(@class,"comments")]`         |
| Related Articles | `.related`, `.more-stories`       | `.related, .more-stories`        | `//*[contains(@class,"related")]`                                 |
| Advertisements   | `.ad`, `[data-ad]`                | `.ad, [data-ad], .advertisement` | `//*[contains(@class,"ad") or @data-ad]`                          |
| Social Sharing   | `.social-share`, `.share-buttons` | `.social-share, .share-buttons`  | `//*[contains(@class,"social") and contains(@class,"share")]`     |
| Newsletter       | `.newsletter`, `.signup`          | `.newsletter, .signup`           | `//*[contains(@class,"newsletter") or contains(@class,"signup")]` |

## 4. Progressive Fallback Strategy

### 4.1 Detection Priority Order

The system implements a four-tier progressive detection approach:

1. **Tier 1: Structured Data** (Highest confidence)
    - JSON-LD Schema.org Article markup
    - Microdata with Article schema
    - OpenGraph article metadata
    - Twitter Card structured data

2. **Tier 2: Semantic HTML5** (High confidence)
    - `<article>` elements with proper nesting
    - `<main>` content areas
    - ARIA role-based identification
    - Semantic time and address elements

3. **Tier 3: Class-based Patterns** (Medium confidence)
    - Common CSS class naming conventions
    - WordPress and CMS-specific patterns
    - News site standardized classes
    - Content management system defaults

4. **Tier 4: Content Density Analysis** (Low confidence)
    - Text-to-HTML ratio analysis
    - Paragraph density evaluation
    - Link density assessment
    - Structural content analysis

### 4.2 Selector Validation Chain

Each selector must pass validation requirements in sequence:

| Stage | Validation Check            | Minimum Requirement                   |
|-------|-----------------------------|---------------------------------------|
| 1     | Element exists              | `count() > 0`                         |
| 2     | Contains text content       | `textContent.length > 100`            |
| 3     | Has paragraph elements      | `querySelectorAll('p').length > 2`    |
| 4     | No excessive link density   | `links/text ratio < 0.3`              |
| 5     | Contains article indicators | Presence of date, author, or headline |

## 5. DOM Query Implementation Standards

### 5.1 Query Method Priority

Query methods are prioritized by performance and reliability:

| Query Type     | Performance Impact | Recommendation          |
|----------------|--------------------|-------------------------|
| ID Selector    | Fastest            | Use when available      |
| Class Selector | Fast               | Primary method          |
| Tag Selector   | Moderate           | Combine with classes    |
| Complex CSS    | Slow               | Avoid deep nesting      |
| XPath          | Slowest            | Use only when necessary |

### 5.2 Accessibility Tree Integration

Content extraction leverages accessibility information when available:

- **Semantic Role Detection**: Identify content roles through ARIA attributes
- **Hierarchical Structure**: Use accessibility tree for content organization
- **Text Alternative Extraction**: Extract meaningful text representations
- **Navigation Skip**: Utilize skip links and landmarks for content boundaries

## 6. Content Quality Validation

### 6.1 Quality Metrics

Content quality is assessed through multiple validation criteria:

| Metric                | Validation Rule          | Threshold      |
|-----------------------|--------------------------|----------------|
| Content Length        | Word count               | > 100 words    |
| Paragraph Count       | Number of `<p>` elements | > 2 paragraphs |
| Text Density          | Text/HTML ratio          | > 0.25         |
| Link Density          | Links/Text ratio         | < 0.3          |
| Metadata Completeness | Title + (Author OR Date) | Required       |

### 6.2 Content Cleaning Requirements

Extracted content must undergo systematic cleaning:

1. **Element Removal**: Exclude navigation, advertisements, and non-content elements
2. **Attribute Cleaning**: Remove style, script, and tracking attributes
3. **Whitespace Normalization**: Standardize spacing and line breaks
4. **Empty Element Removal**: Remove elements without meaningful content
5. **Content Validation**: Verify minimum content requirements are met

## 7. Site-Specific Rule Framework

### 7.1 Rule Structure Specification

Site-specific rules follow a standardized structure:

- **Domain Matching**: Precise domain-based rule application
- **Selector Hierarchy**: Primary, secondary, and fallback selector definitions
- **Exclusion Patterns**: Site-specific content exclusion rules
- **Processing Rules**: Content cleaning and normalization instructions
- **Quality Thresholds**: Site-specific quality validation criteria

### 7.2 Rule Validation Requirements

All site-specific rules must meet validation standards:

- **Selector Effectiveness**: Minimum 85% extraction success rate
- **Content Quality**: Extracted content meets quality thresholds
- **Performance Impact**: Processing time within acceptable limits
- **Backward Compatibility**: Graceful fallback to universal patterns
- **Maintenance Burden**: Rules must be maintainable and documentable

## 8. Performance and Caching Specifications

### 8.1 Selector Performance Requirements

- **Query Timeout**: Maximum 5 seconds per selector evaluation
- **Memory Usage**: Efficient DOM traversal without memory leaks
- **Concurrent Execution**: Thread-safe selector evaluation
- **Error Handling**: Graceful degradation on selector failures

### 8.2 Caching Strategy

- **Successful Selectors**: Cache selectors with >80% success rate
- **Domain-based Caching**: Cache selectors per domain for efficiency
- **Time-based Invalidation**: Refresh cached selectors periodically
- **Performance Monitoring**: Track selector effectiveness over time

## 9. Testing and Validation Framework

### 9.1 Test Coverage Requirements

| Site Category    | Expected Success Rate | Validation Criteria                     |
|------------------|-----------------------|-----------------------------------------|
| Major News Sites | >95%                  | Title, content, author, date extraction |
| Regional News    | >90%                  | Title, content extraction minimum       |
| Blog Platforms   | >90%                  | Title, content extraction minimum       |
| Aggregator Sites | >80%                  | Title, content extraction minimum       |

### 9.2 Validation Test Cases

- **HTML5 Semantic Validation**: Test semantic element detection
- **Legacy HTML4 Compatibility**: Validate class-based pattern detection
- **Structured Data Extraction**: Verify metadata extraction accuracy
- **Content Quality Assessment**: Validate quality metric calculations
- **Performance Benchmarking**: Measure extraction time and resource usage

## 10. Standards Compliance

### 10.1 Web Standards Adherence

- **HTML5 Specification**: Full compliance with HTML5 semantic elements
- **Microdata Standards**: Support for Schema.org microdata specification
- **OpenGraph Protocol**: Complete OpenGraph metadata extraction
- **ARIA Accessibility**: Integration with ARIA roles and properties
- **CSS Selectors Level 3**: Full CSS3 selector specification support

### 10.2 Browser Compatibility

- **Playwright Integration**: Leverage Playwright's cross-browser DOM access
- **Modern Browser Support**: Target current browser versions
- **Graceful Degradation**: Handle older browser rendering differences
- **Cross-platform Consistency**: Ensure consistent behavior across platforms

## Conclusion

This content selector specification provides a comprehensive framework for accurate, efficient, and maintainable content
extraction. The progressive fallback strategy ensures broad compatibility while maintaining high extraction quality, and
the standardized rule framework enables site-specific optimization without compromising system integrity.