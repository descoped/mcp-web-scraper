/**
 * Test URLs and fixtures for testing
 */

export const TEST_URLS = {
    // Safe test URLs for integration testing
    SIMPLE_PAGE: 'https://httpbin.org/html',
    JSON_API: 'https://httpbin.org/json',
    STATUS_200: 'https://httpbin.org/status/200',
    STATUS_404: 'https://httpbin.org/status/404',

    // Real news sites for cookie consent testing (use sparingly)
    BBC: 'https://www.bbc.com',
    GUARDIAN: 'https://www.theguardian.com',
    CNN: 'https://www.cnn.com',
    VG: 'https://www.vg.no',

    // Local test files (would need to be created)
    LOCAL_HTML: 'file://./tests/fixtures/test.html'
};

export const MOCK_ARTICLE_CONTENT = {
    title: 'Test Article Title',
    content: 'This is test article content with multiple paragraphs.',
    author: 'Test Author',
    date: '2025-06-10',
    summary: 'A test article for automated testing purposes.'
};

export const MOCK_CONSENT_PATTERNS = {
    textPatterns: [
        'Accept all cookies',
        'Godta alle',
        'Alle akzeptieren',
        'Accepter tout',
        'Aceptar todo',
        'Accetta tutto'
    ],
    attributes: [
        'data-consent',
        'data-cookie',
        'aria-label*=cookie',
        'title*=consent'
    ],
    frameworks: [
        '#onetrust-accept-btn-handler',
        '.qc-cmp2-accept-all',
        '#CybotCookiebotDialogBodyButtonAccept',
        '#truste-consent-button'
    ]
};

export const EXPECTED_TOOL_COUNT = 29;

export const MICROSOFT_PLAYWRIGHT_MCP_TOOLS = [
    'scrape_article_content',
    'get_page_screenshot',
    'handle_cookie_consent',
    'browser_navigate',
    'browser_click',
    'browser_type',
    'browser_hover',
    'browser_select_option',
    'browser_press_key',
    'browser_handle_dialog',
    'browser_file_upload',
    'browser_close',
    'browser_pdf_save',
    'browser_console_messages',
    'browser_resize',
    'browser_snapshot',
    'browser_install',
    'browser_generate_playwright_test',
    'manage_tabs',
    'monitor_network',
    'drag_drop',
    'navigate_history',
    'browser_find_text',
    'browser_find_element',
    'browser_describe_element',
    'browser_annotate_page',
    'browser_get_element_text',
    'browser_wait_for_page_state',
    'browser_execute_javascript'
] as const;