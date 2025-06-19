import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Removing quarantine attributes from built files...');

const distPath = path.join(__dirname, '..', 'dist');
const distElectronPath = path.join(__dirname, '..', 'dist-electron');

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
  // Remove quarantine from .app files
  const appFiles = findAppFiles(distPath);
  for (const appFile of appFiles) {
    console.log(`Removing quarantine from: ${appFile}`);
    execSync(`xattr -rd com.apple.quarantine "${appFile}"`, { stdio: 'inherit' });
  }

  // Remove quarantine from DMG files
  const dmgFiles = findDmgFiles(distPath);
  for (const dmgFile of dmgFiles) {
    console.log(`Removing quarantine from: ${dmgFile}`);
    execSync(`xattr -rd com.apple.quarantine "${dmgFile}"`, { stdio: 'inherit' });
  }

  console.log('✅ Quarantine attributes removed successfully!');
  console.log('\n📝 Instructions for users:');
  console.log('1. Right-click on the .app file and select "Open"');
  console.log('2. Click "Open" in the security dialog that appears');
  console.log('3. The app will now open normally on subsequent launches');
  
} catch (error) {
  console.error('❌ Error removing quarantine attributes:', error.message);
  console.log('\n📝 Alternative instructions for users:');
  console.log('1. Right-click on the .app file and select "Open"');
  console.log('2. Click "Open" in the security dialog that appears');
  console.log('3. Or run: xattr -rd com.apple.quarantine /path/to/ScreenBlink.app');
} 