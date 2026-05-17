import fs from 'node:fs';
import path from 'node:path';

const srcDir = 'src/ui/renderer';
const destDir = 'dist/ui/renderer';

fs.mkdirSync(destDir, { recursive: true });

fs.copyFileSync(path.join(srcDir, 'index.html'), path.join(destDir, 'index.html'));
fs.copyFileSync(path.join(srcDir, 'styles.css'), path.join(destDir, 'styles.css'));
fs.copyFileSync(path.join('assets', 'Synkromium_logo.svg'), path.join(destDir, 'Synkromium_logo.svg'));

console.log('Assets copied successfully.');
