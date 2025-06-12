import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
    {
        files: ['src/**/*.ts', 'tests/**/*.ts'],
        languageOptions: {
            parser: typescriptParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module'
            }
        },
        plugins: {
            '@typescript-eslint': typescriptEslint
        },
        rules: {
            ...typescriptEslint.configs.recommended.rules,
            'indent': ['error', 4],
            'semi': ['error', 'always'],
            'quotes': ['error', 'single'],
            '@typescript-eslint/no-unused-vars': ['error', {'argsIgnorePattern': '^_'}]
        }
    },
    {
        ignores: [
            'dist/',
            'node_modules/',
            'coverage/',
            '*.js',
            '!eslint.config.js'
        ]
    }
];