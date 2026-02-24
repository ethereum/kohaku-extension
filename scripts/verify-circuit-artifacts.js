#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get build output path from environment or default
const buildOutputPath = process.env.WEBPACK_BUILD_OUTPUT_PATH || 'webkit-dev';
const circuitsPath = path.join(__dirname, '..', 'build', buildOutputPath, 'assets', 'circuits');

console.log(`Checking for circuit artifacts in: ${circuitsPath}\n`);

if (!fs.existsSync(circuitsPath)) {
  console.error(`❌ Circuits directory not found at: ${circuitsPath}`);
  console.log('\n💡 Make sure you have built the extension first.');
  console.log('   Run: yarn web:webkit (or yarn build:web:webkit)');
  process.exit(1);
}

// Check for some expected circuit directories
const expectedCircuits = ['1x1', '2x1', '10x1'];
const expectedFiles = ['vkey.json', 'wasm.br', 'zkey.br'];

let allGood = true;

// List all circuit directories
const circuitDirs = fs.readdirSync(circuitsPath).filter(item => {
  const itemPath = path.join(circuitsPath, item);
  return fs.statSync(itemPath).isDirectory();
});

console.log(`Found ${circuitDirs.length} circuit directories:\n`);

// Check each circuit directory
for (const circuitDir of circuitDirs.slice(0, 5)) { // Check first 5
  const circuitPath = path.join(circuitsPath, circuitDir);
  console.log(`📁 ${circuitDir}/`);
  
  for (const file of expectedFiles) {
    const filePath = path.join(circuitPath, file);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      const sizeKB = (stats.size / 1024).toFixed(2);
      console.log(`   ✅ ${file} (${sizeKB} KB)`);
    } else {
      console.log(`   ❌ ${file} - MISSING`);
      allGood = false;
    }
  }
  console.log('');
}

if (circuitDirs.length > 5) {
  console.log(`... and ${circuitDirs.length - 5} more circuit directories\n`);
}

// Count total files
const totalFiles = fs.readdirSync(circuitsPath)
  .map(item => {
    const itemPath = path.join(circuitsPath, item);
    if (fs.statSync(itemPath).isDirectory()) {
      return fs.readdirSync(itemPath).length;
    }
    return 0;
  })
  .reduce((sum, count) => sum + count, 0);

console.log(`Total files: ${totalFiles}`);
console.log(`Total circuits: ${circuitDirs.length}`);

if (allGood && circuitDirs.length > 0) {
  console.log('\n✅ Circuit artifacts are correctly packed!');
  process.exit(0);
} else {
  console.log('\n❌ Some circuit artifacts are missing!');
  process.exit(1);
}

