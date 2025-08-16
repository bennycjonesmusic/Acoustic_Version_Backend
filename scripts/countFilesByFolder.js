import fs from 'fs';
import path from 'path';

const root = process.argv[2] || '.';
const counts = {};

function walk(dir, topLevel = null) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, topLevel || entry.name);
    } else {
      const folder = topLevel || path.basename(dir);
      counts[folder] = (counts[folder] || 0) + 1;
    }
  });
}

walk(root);

Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([folder, count]) => {
    console.log(`${count}\t${folder}`);
  });
