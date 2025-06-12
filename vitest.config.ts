import {defineConfig} from 'vitest/config';
import * as path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        // Enable verbose output when VERBOSE env var is set
        reporters: process.env.VERBOSE === 'true' ? 'verbose' : 'default',
        outputFile: process.env.VERBOSE === 'true' ? './output/test-results.txt' : undefined,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'dist/',
                'tests/',
                '**/*.d.ts',
                '**/*.test.ts',
                '**/*.spec.ts'
            ],
            thresholds: {
                global: {
                    branches: 70,
                    functions: 70,
                    lines: 70,
                    statements: 70
                }
            }
        },
        testTimeout: 30000,
        hookTimeout: 30000,
        setupFiles: ['./tests/setup.ts']
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@tests': path.resolve(__dirname, './tests')
        }
    }
});