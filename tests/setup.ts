/**
 * Global test setup
 */

import {afterEach, beforeEach, vi} from 'vitest';

const isVerbose = process.env.VERBOSE === 'true' || process.argv.includes('--verbose');

// Enhanced console setup with verbose mode support
if (isVerbose) {
    // Verbose mode: Enhanced logging with test context
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    global.console = {
        ...console,
        log: (...args: any[]) => {
            const testContext = expect.getState()?.currentTestName || 'Unknown Test';
            originalLog(`[TEST: ${testContext}]`, ...args);
        },
        warn: (...args: any[]) => {
            const testContext = expect.getState()?.currentTestName || 'Unknown Test';
            originalWarn(`[TEST: ${testContext}] ⚠️`, ...args);
        },
        error: (...args: any[]) => {
            const testContext = expect.getState()?.currentTestName || 'Unknown Test';
            originalError(`[TEST: ${testContext}] ❌`, ...args);
        },
        debug: vi.fn() // Still disable debug logs
    };
} else {
    // Standard mode: Reduce noise during tests
    global.console = {
        ...console,
        // Uncomment to disable console logs during tests
        // log: vi.fn(),
        // warn: vi.fn(),
        // error: vi.fn(),
        // info: vi.fn(),
        debug: vi.fn() // Disable debug logs
    };
}

// Global test timeout
vi.setConfig({testTimeout: 30000});

// Enhanced test lifecycle logging
beforeEach((context) => {
    if (isVerbose) {
        console.log(`🧪 Starting test: ${context.task.name}`);
    }
});

afterEach((context) => {
    if (isVerbose) {
        const status = context.task.result?.state === 'pass' ? '✅ PASSED' : '❌ FAILED';
        const duration = context.task.result?.duration ? `(${context.task.result.duration}ms)` : '';
        console.log(`${status}: ${context.task.name} ${duration}`);
    }
    vi.clearAllMocks();
});