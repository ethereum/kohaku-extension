#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '..', 'node_modules', '@railgun-community', 'circuit-artifacts');
const buildDirs = [
  path.join(__dirname, '..', 'build', 'webkit-dev', 'assets', 'circuits'),
  path.join(__dirname, '..', 'build', 'webkit-prod', 'assets', 'circuits'),
  // path.join(__dirname, '..', 'build', 'gecko-dev', 'assets', 'circuits'),
  // path.join(__dirname, '..', 'build', 'gecko-prod', 'assets', 'circuits'),
];

function copyRecursive(src, dest) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    // Skip node_modules, package.json, README.md, etc.
    if (entry.name === 'node_modules' || 
        entry.name === 'package.json' || 
        entry.name === 'README.md' ||
        entry.name === '.DS_Store') {
      continue;
    }

    if (entry.isDirectory()) {
      // Recursively copy directories
      copyRecursive(srcPath, destPath);
    } else {
      // Copy files
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyCircuitArtifacts() {
  console.log('🔧 Copying circuit artifacts to build directories...\n');

  // Check if source exists
  if (!fs.existsSync(sourcePath)) {
    console.error(`❌ Source directory not found: ${sourcePath}`);
    console.log('\n💡 Make sure @railgun-community/circuit-artifacts is installed:');
    console.log('   Run: yarn install (or npm install)');
    process.exit(1);
  }

  let copiedCount = 0;
  let skippedCount = 0;

  // Copy to each build directory
  for (const destPath of buildDirs) {
    const buildDir = path.dirname(path.dirname(path.dirname(destPath))); // Go up 3 levels to build dir
    const buildName = path.basename(buildDir);

    // Check if build directory exists
    if (!fs.existsSync(buildDir)) {
      console.log(`⏭️  Skipping ${buildName} (build directory doesn't exist)`);
      skippedCount++;
      continue;
    }

    console.log(`📦 Copying to ${buildName}/assets/circuits/...`);

    try {
      // Remove existing circuits directory if it exists
      if (fs.existsSync(destPath)) {
        fs.rmSync(destPath, { recursive: true, force: true });
      }

      // Copy the circuit artifacts
      copyRecursive(sourcePath, destPath);

      // Count files copied
      const countFiles = (dir) => {
        let count = 0;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            count += countFiles(fullPath);
          } else {
            count++;
          }
        }
        return count;
      };

      const fileCount = countFiles(destPath);
      console.log(`   ✅ Copied ${fileCount} files`);
      copiedCount++;
    } catch (error) {
      console.error(`   ❌ Error copying to ${buildName}:`, error.message);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Successfully copied to ${copiedCount} build directory(ies)`);
  if (skippedCount > 0) {
    console.log(`   ⏭️  Skipped ${skippedCount} build directory(ies) (not found)`);
  }

  if (copiedCount > 0) {
    console.log('\n✨ Circuit artifacts injection complete!');
    process.exit(0);
  } else {
    console.log('\n⚠️  No build directories found. Make sure you have built the extension first.');
    process.exit(1);
  }
}

// Run the script
copyCircuitArtifacts();

