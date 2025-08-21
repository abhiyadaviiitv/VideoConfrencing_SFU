import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distPath = path.join(__dirname, 'UI', 'frontend', 'dist');
const indexPath = path.join(distPath, 'index.html');
const assetPath = path.join(distPath, 'assets', 'index-BIDrfewu.css');

console.log('--- Verification Script ---');
console.log('__dirname:', __dirname);
console.log('distPath:', distPath);

if (fs.existsSync(distPath)) {
    console.log('✅ dist folder exists');
} else {
    console.error('❌ dist folder NOT found');
}

if (fs.existsSync(indexPath)) {
    console.log('✅ index.html exists');
} else {
    console.error('❌ index.html NOT found');
}

if (fs.existsSync(assetPath)) {
    console.log('✅ Asset exists:', path.basename(assetPath));
} else {
    console.error('❌ Asset NOT found:', path.basename(assetPath));
}

// Emulate simple URL path logic from app.js
function testPath(reqPath) {
    if (reqPath === '/' || !reqPath.includes('.')) {
        return indexPath;
    }
    return path.join(distPath, reqPath);
}

console.log('Testing routing logic emulation:');
console.log('Request / ->', testPath('/'));
console.log('Request /login ->', testPath('/login'));
console.log('Request /assets/index-BIDrfewu.css ->', testPath('/assets/index-BIDrfewu.css'));
