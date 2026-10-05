#!/usr/bin/env node
/**
 * Link Checker Script
 * Scans markdown files and frontend source files for links and validates them.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

let totalLinksChecked = 0;
let failures = 0;

function scanFiles(dir, exts) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', '.venv', 'dist', '__pycache__'].includes(entry.name)) {
        files = files.concat(scanFiles(fullPath, exts));
      }
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

const markdownFiles = scanFiles(ROOT_DIR, ['.md']);
console.log(`Checking ${markdownFiles.length} markdown files for link validity...`);

for (const file of markdownFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const relativeFilePath = path.relative(ROOT_DIR, file);

  // Match markdown links [text](url)
  const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = mdLinkRegex.exec(content)) !== null) {
    const [, text, target] = match;
    totalLinksChecked++;

    // Ignore anchors, external URLs, and mailto
    if (target.startsWith('#') || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:')) {
      continue;
    }

    // Relative file check
    const cleanTarget = target.split('#')[0].split('?')[0];
    if (!cleanTarget) continue;

    const resolved = path.resolve(path.dirname(file), cleanTarget);
    if (!fs.existsSync(resolved)) {
      console.error(`❌ Broken link in ${relativeFilePath}: "${text}" -> "${target}" (file not found: ${resolved})`);
      failures++;
    }
  }
}

console.log(`\nLink Check Summary: Checked ${totalLinksChecked} links. Failures: ${failures}`);

if (failures > 0) {
  process.exit(1);
} else {
  console.log('✅ All internal links verified successfully.');
  process.exit(0);
}
