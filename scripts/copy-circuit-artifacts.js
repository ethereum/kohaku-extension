#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, '..', 'node_modules', '@railgun-community', 'circuit-artifacts');
const destinationPath = path.join(__dirname, '..', 'src', 'web', 'assets', 'circuits');

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

  console.log(`📦 Copying to src/web/assets/circuits/...`);

  try {
    // Remove existing circuits directory if it exists
    if (fs.existsSync(destinationPath)) {
      fs.rmSync(destinationPath, { recursive: true, force: true });
    }

    // Copy the circuit artifacts
    copyRecursive(sourcePath, destinationPath);

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

    const fileCount = countFiles(destinationPath);
    console.log(`   ✅ Copied ${fileCount} files`);
  } catch (error) {
    console.error(`   ❌ Error copying circuit artifacts:`, error.message);
    process.exit(1);
  }

  console.log('\n✨ Circuit artifacts injection complete!');
}

// Run the script
copyCircuitArtifacts();

