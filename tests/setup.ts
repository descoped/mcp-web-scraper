/**
 * Global test setup
 */

import {vi} from 'vitest';

// Mock console methods to reduce noise during tests
global.console = {
    ...console,
    // Uncomment to disable console logs during tests
    // log: vi.fn(),
    // warn: vi.fn(),
    // error: vi.fn(),
    // info: vi.fn(),
    debug: vi.fn() // Disable debug logs
};

// Global test timeout
vi.setConfig({testTimeout: 30000});

// Clean up after each test
afterEach(() => {
    vi.clearAllMocks();
});