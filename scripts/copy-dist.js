/**
 * Copy dist from packages/vscode to root dist folder
 * This is needed for VS Code extension publishing
 */

const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'packages', 'vscode', 'dist');
const destDir = path.join(__dirname, '..', 'dist');

function copyDir(src, dest) {
    // Create destination directory
    fs.mkdirSync(dest, { recursive: true });

    // Read source directory
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// Check if source exists
if (!fs.existsSync(sourceDir)) {
    console.error('Error: packages/vscode/dist does not exist. Run "pnpm build:vscode" first.');
    process.exit(1);
}

// Copy the dist folder
console.log('Copying packages/vscode/dist to dist...');
copyDir(sourceDir, destDir);
console.log('Done!');
