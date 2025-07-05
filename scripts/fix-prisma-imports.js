#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Get all TypeScript and JavaScript files that import from @prisma/client
const getFilesWithPrismaImports = () => {
  try {
    // Use find and grep to find files
    const result = execSync(
      `find . -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \\) -not -path "./node_modules/*" -not -path "./.next/*" -not -path "./packages/prisma/*" -exec grep -l "@prisma/client" {} \\;`,
      { encoding: 'utf8', cwd: process.cwd() }
    );
    return result.trim().split('\n').filter(Boolean);
  } catch (error) {
    console.error('Error finding files:', error.message);
    return [];
  }
};

// Update imports in a single file
const updateFileImports = (filePath) => {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let updated = false;

    // Skip if file is in packages/prisma directory
    if (filePath.includes('packages/prisma/')) {
      return false;
    }

    // Pattern to match imports from @prisma/client
    const importPatterns = [
      // import { ... } from "@calcom/prisma/client"
      /from\s+["']@prisma\/client["']/g,
      // import type { ... } from "@calcom/prisma/client"
      /from\s+["']@prisma\/client["']/g,
    ];

    importPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        content = content.replace(pattern, 'from "@calcom/prisma/client"');
        updated = true;
      }
    });

    if (updated) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`✅ Updated: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
    return false;
  }
};

// Main function
const main = () => {
  console.log('🔍 Finding files with @prisma/client imports...');
  
  const files = getFilesWithPrismaImports();
  console.log(`Found ${files.length} files to update`);

  let updatedCount = 0;
  
  files.forEach((file) => {
    if (updateFileImports(file)) {
      updatedCount++;
    }
  });

  console.log(`\n✨ Done! Updated ${updatedCount} files.`);
  
  if (updatedCount > 0) {
    console.log('\n📝 Next steps:');
    console.log('1. Run "yarn type-check" to verify the changes');
    console.log('2. Run "yarn build" to ensure everything builds correctly');
  }
};

// Run the script
if (require.main === module) {
  main();
}