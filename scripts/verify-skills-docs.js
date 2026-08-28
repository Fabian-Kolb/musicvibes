import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const REQUIRED_SKILL_FILES = [
    'skills/SKILL_OVERVIEW.md',
    'skills/website-behavior.md',
    'skills/audio-reactivity.md',
    'skills/component-architecture.md'
];

const SOURCE_FILES = {
    audioPhysics: 'src/utils/audioPhysics.js',
    visualizer: 'src/components/vibesync/Visualizer.jsx',
    ghostUI: 'src/components/vibesync/GhostUI.jsx'
};

const EXPORTED_SYMBOLS = {
    audioPhysics: ['mapSetting', 'getBinRange', 'processFrequencyBands', 'calculateAudioPhysics'],
    visualizer: ['Visualizer', 'initWebGL', 'spawnParticle', 'vsSourceGL2', 'fsSourceGL2'],
    ghostUI: ['GhostUI', 'PRESETS']
};

console.log('=== Starting Skill Documentation Verification ===\n');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const report = [];

function recordResult(category, name, passed, details) {
    totalChecks++;
    if (passed) {
        passedChecks++;
        console.log(`[PASS] ${category}: ${name}`);
    } else {
        failedChecks++;
        console.log(`[FAIL] ${category}: ${name} - ${details}`);
    }
    report.push({ category, name, passed, details });
}

// 1. Check File Existence and File Size (>1KB)
console.log('--- 1. File Existence & File Size Checks ---');
for (const relPath of REQUIRED_SKILL_FILES) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
        recordResult('File Existence', relPath, false, 'File does not exist.');
        continue;
    }

    recordResult('File Existence', relPath, true, 'File exists.');

    const stats = fs.statSync(fullPath);
    const sizeKB = stats.size / 1024;
    if (stats.size > 1024) {
        recordResult('File Size', relPath, true, `Size: ${stats.size} bytes (${sizeKB.toFixed(2)} KB) > 1KB.`);
    } else {
        recordResult('File Size', relPath, false, `Size: ${stats.size} bytes (${sizeKB.toFixed(2)} KB) <= 1KB.`);
    }
}

// 2. Check Markdown Structure
console.log('\n--- 2. Markdown Structure Checks ---');
for (const relPath of REQUIRED_SKILL_FILES) {
    const fullPath = path.join(rootDir, relPath);
    if (!fs.existsSync(fullPath)) {
        recordResult('Markdown Headers', relPath, false, 'Skipped (File missing).');
        recordResult('Markdown Code Snippets', relPath, false, 'Skipped (File missing).');
        recordResult('Markdown Tables', relPath, false, 'Skipped (File missing).');
        continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    // Check H1 header
    const hasH1 = lines.some(l => l.startsWith('# '));
    const hasH2 = lines.some(l => l.startsWith('## '));
    if (hasH1 && hasH2) {
        recordResult('Markdown Headers', relPath, true, 'Contains H1 (#) and H2 (##) headings.');
    } else {
        recordResult('Markdown Headers', relPath, false, `Missing headers. H1: ${hasH1}, H2: ${hasH2}`);
    }

    // Check code snippets
    const codeBlockMatches = content.match(/```[\s\S]*?```/g) || [];
    if (codeBlockMatches.length > 0) {
        recordResult('Markdown Code Snippets', relPath, true, `Found ${codeBlockMatches.length} code block(s).`);
    } else {
        recordResult('Markdown Code Snippets', relPath, false, 'No code blocks (```) found.');
    }

    // Check Markdown tables
    const hasTable = lines.some(l => l.includes('|') && l.includes('---'));
    if (hasTable) {
        recordResult('Markdown Tables', relPath, true, 'Contains Markdown table formatting.');
    } else {
        recordResult('Markdown Tables', relPath, false, 'No Markdown table formatting found.');
    }
}

// 3. Code Symbol Matching
console.log('\n--- 3. Source Code Symbol Matching ---');

// Verify exported symbols in source files first
for (const [key, sourceRelPath] of Object.entries(SOURCE_FILES)) {
    const sourceFullPath = path.join(rootDir, sourceRelPath);
    if (!fs.existsSync(sourceFullPath)) {
        recordResult('Source File Verification', sourceRelPath, false, 'Source file does not exist.');
        continue;
    }
    const sourceContent = fs.readFileSync(sourceFullPath, 'utf8');
    const expectedSymbols = EXPORTED_SYMBOLS[key];
    for (const sym of expectedSymbols) {
        const symbolExists = sourceContent.includes(sym);
        recordResult('Source Symbol Verification', `${sourceRelPath}::${sym}`, symbolExists, symbolExists ? 'Symbol present in source code.' : 'Symbol missing from source code.');
    }
}

// Read all combined documentation content
let combinedDocContent = '';
for (const relPath of REQUIRED_SKILL_FILES) {
    const fullPath = path.join(rootDir, relPath);
    if (fs.existsSync(fullPath)) {
        combinedDocContent += fs.readFileSync(fullPath, 'utf8') + '\n';
    }
}

// Cross-check expected symbols against documentation suite
for (const [key, symbols] of Object.entries(EXPORTED_SYMBOLS)) {
    for (const sym of symbols) {
        const documented = combinedDocContent.includes(sym);
        recordResult('Symbol Documented', `${key}::${sym}`, documented, documented ? 'Symbol mentioned in skill docs.' : 'Symbol missing from skill docs.');
    }
}

// Overall Verdict
console.log('\n========================================');
console.log(`SUMMARY: Total Checks: ${totalChecks} | Passed: ${passedChecks} | Failed: ${failedChecks}`);
const overallPassed = failedChecks === 0;
console.log(`OVERALL VERDICT: ${overallPassed ? 'PASS' : 'FAIL'}`);
console.log('========================================');

process.exit(overallPassed ? 0 : 1);
