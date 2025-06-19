import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if we should also clean DMG files (default: false for pre-DMG builds)
const cleanDmg = process.argv.includes('--clean-dmg');

console.log('Removing quarantine attributes from built files...');

const distPath = path.join(__dirname, '..', 'dist');

// Find all .app files in the dist directory
function findAppFiles(dir) {
  const files = [];
  if (fs.existsSync(dir)) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory() && item.endsWith('.app')) {
        files.push(fullPath);
      } else if (stat.isDirectory()) {
        files.push(...findAppFiles(fullPath));
      }
    }
  }
  return files;
}

// Find all DMG files in the dist directory
function findDmgFiles(dir) {
  const files = [];
  if (fs.existsSync(dir)) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && item.endsWith('.dmg')) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

try {
  // Always remove quarantine from .app files (before DMG creation)
  const appFiles = findAppFiles(distPath);
  for (const appFile of appFiles) {
    console.log(`Removing quarantine from: ${appFile}`);
    execSync(`xattr -rd com.apple.quarantine "${appFile}"`, { stdio: 'inherit' });
  }

  // Only remove quarantine from DMG files if explicitly requested
  if (cleanDmg) {
    const dmgFiles = findDmgFiles(distPath);
    for (const dmgFile of dmgFiles) {
      console.log(`Removing quarantine from: ${dmgFile}`);
      execSync(`xattr -rd com.apple.quarantine "${dmgFile}"`, { stdio: 'inherit' });
    }
  }

  console.log('✅ Quarantine attributes removed successfully!');
  
  if (!cleanDmg) {
    console.log('\n📝 Next step: Run electron-builder --mac to create DMG');
  } else {
    console.log('\n📝 Instructions for users:');
    console.log('1. Right-click on the .app file and select "Open"');
    console.log('2. Click "Open" in the security dialog that appears');
    console.log('3. The app will now open normally on subsequent launches');
  }
  
} catch (error) {
  console.error('❌ Error removing quarantine attributes:', error.message);
  console.log('\n📝 Alternative instructions for users:');
  console.log('1. Right-click on the .app file and select "Open"');
  console.log('2. Click "Open" in the security dialog that appears');
  console.log('3. Or run: xattr -rd com.apple.quarantine /path/to/ScreenBlink.app');
} 