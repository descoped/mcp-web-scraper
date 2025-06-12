#!/usr/bin/env node

/**
 * Script to update relative imports in test files to use path mapping
 */

import {promises as fs} from 'fs';
import {glob} from 'glob';
import path from 'path';

async function updateTestImports() {
    console.log('🔧 Updating test imports to use path mapping...');

    // Find all TypeScript test files
    const testFiles = await glob('tests/**/*.ts', {
        ignore: ['node_modules/**', 'dist/**']
    });

    console.log(`📁 Found ${testFiles.length} test files to process`);

    let totalUpdates = 0;

    for (const filePath of testFiles) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            let updated = content;
            let fileUpdates = 0;

            // Update various relative import patterns
            const patterns = [
                // ../../../src/ -> @/
                {
                    regex: /from\s+['"]\.\.\/\.\.\/\.\.\/src\/([^'"]+)['"]/g,
                    replacement: "from '@/$1'"
                },
                // ../../src/ -> @/
                {
                    regex: /from\s+['"]\.\.\/\.\.\/src\/([^'"]+)['"]/g,
                    replacement: "from '@/$1'"
                },
                // ../src/ -> @/
                {
                    regex: /from\s+['"]\.\.\/src\/([^'"]+)['"]/g,
                    replacement: "from '@/$1'"
                },
                // import(...) expressions
                {
                    regex: /import\s*\(\s*['"]\.\.\/\.\.\/\.\.\/src\/([^'"]+)['"]\s*\)/g,
                    replacement: "import('@/$1')"
                },
                {
                    regex: /import\s*\(\s*['"]\.\.\/\.\.\/src\/([^'"]+)['"]\s*\)/g,
                    replacement: "import('@/$1')"
                }
            ];

            for (const pattern of patterns) {
                const matches = updated.match(pattern.regex);
                if (matches) {
                    updated = updated.replace(pattern.regex, pattern.replacement);
                    fileUpdates += matches.length;
                }
            }

            if (fileUpdates > 0) {
                await fs.writeFile(filePath, updated, 'utf8');
                console.log(`   ✅ ${path.relative('.', filePath)}: ${fileUpdates} imports updated`);
                totalUpdates += fileUpdates;
            }

        } catch (error) {
            console.error(`   ❌ ${filePath}: ${error.message}`);
        }
    }

    console.log(`\n🎉 Complete! Updated ${totalUpdates} imports across ${testFiles.length} files`);
    console.log('\n📝 Benefits achieved:');
    console.log('   - Cleaner, more readable imports');
    console.log('   - Easier refactoring and file moves');
    console.log('   - Consistent import style across tests');
    console.log('   - Better IDE autocomplete and navigation');
}

updateTestImports().catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
});