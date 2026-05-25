import fs from 'node:fs';
import path from 'node:path';

const srcDir = 'src/ui/renderer';
const destDir = 'dist/ui/renderer';
const fontsDestDir = path.join(destDir, 'fonts');

fs.mkdirSync(destDir, { recursive: true });
fs.mkdirSync(fontsDestDir, { recursive: true });

fs.copyFileSync(path.join(srcDir, 'index.html'), path.join(destDir, 'index.html'));
fs.copyFileSync(path.join(srcDir, 'styles.css'), path.join(destDir, 'styles.css'));
fs.copyFileSync(path.join('assets', 'Synkromium_logo.svg'), path.join(destDir, 'Synkromium_logo.svg'));

// Copy bundled Inter font files
const fontsSrcDir = path.join('assets', 'fonts');
for (const file of fs.readdirSync(fontsSrcDir)) {
  if (file.endsWith('.woff2')) {
    fs.copyFileSync(path.join(fontsSrcDir, file), path.join(fontsDestDir, file));
  }
}

console.log('Assets copied successfully.');
