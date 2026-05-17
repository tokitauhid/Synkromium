import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Read the new version from package.json (which npm has already updated at this point)
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const newVersion = packageJson.version;

console.log(`Bumping version strings to ${newVersion}...`);

// 1. Update README.md
const readmePath = path.join(rootDir, 'README.md');
if (fs.existsSync(readmePath)) {
  let content = fs.readFileSync(readmePath, 'utf8');
  // Match the version shield: version-0.1.0-blue
  content = content.replace(
    /badge\/version-[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?-blue/g,
    `badge/version-${newVersion}-blue`
  );
  fs.writeFileSync(readmePath, content, 'utf8');
  console.log(`Updated README.md`);
}

// 2. Update src/ui/renderer/index.html
const htmlPath = path.join(rootDir, 'src/ui/renderer/index.html');
if (fs.existsSync(htmlPath)) {
  let content = fs.readFileSync(htmlPath, 'utf8');
  // Match: <p class="about-version">Version 0.1.0</p>
  content = content.replace(
    /<p class="about-version">Version [0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?<\/p>/g,
    `<p class="about-version">Version ${newVersion}</p>`
  );
  fs.writeFileSync(htmlPath, content, 'utf8');
  console.log(`Updated src/ui/renderer/index.html`);
}

// 3. Update src/config/constants.ts
const constantsPath = path.join(rootDir, 'src/config/constants.ts');
if (fs.existsSync(constantsPath)) {
  let content = fs.readFileSync(constantsPath, 'utf8');
  // Match: export const APP_VERSION = "0.1.0";
  content = content.replace(
    /export const APP_VERSION = "[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?";/g,
    `export const APP_VERSION = "${newVersion}";`
  );
  fs.writeFileSync(constantsPath, content, 'utf8');
  console.log(`Updated src/config/constants.ts`);
}

console.log('Version strings updated successfully! The modified files will now be committed.');
