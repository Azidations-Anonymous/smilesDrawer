#!/usr/bin/env node

/**
 * @file Smoke test runner for SmilesDrawer
 * @module debug/smoke-test
 * @description
 * Generates SVG and JSON position data for SMILES strings without comparison.
 * Useful for quick sanity checks, debugging, and generating reference outputs.
 *
 * ## Features
 * - Generates SVG and JSON for current codebase
 * - Supports single SMILES string or multiple datasets (fastregression, chembl, etc.)
 * - Optional regex filter to target specific SMILES (-filter)
 * - Saves outputs to timestamped directories
 * - No baseline comparison (faster than regression tests)
 *
 * ## Output
 * - debug/output/smoke/[timestamp]/[N].html - HTML report with SVG rendering
 * - debug/output/smoke/[timestamp]/[N].json - JSON position data (requires -json)
 * - debug/output/smoke/[timestamp]/[N].png - PNG image of the molecule (requires -image)
 *
 * ## Usage
 * npm run test:smoke                        # Uses fastregression dataset
 * npm run test:smoke -- -dataset chembl    # Uses chembl dataset
 * npm run test:smoke -- -all                # All datasets
 * npm run test:smoke -- -json              # Save JSON position output
 * npm run test:smoke -- -image             # Save PNG snapshots
 * npm run test:smoke -- -filter "O=O"       # Only SMILES matching regex
 * npm run test:smoke "C1CCCCC1"             # Single SMILES string
 * npm run test:smoke "C" "[NH4+]" "O=O"     # Multiple SMILES strings
 *
 * @example
 * node debug/smoke-test.js
 * node debug/smoke-test.js -dataset chembl
 * node debug/smoke-test.js -all
 * node debug/smoke-test.js -json -image
 * node debug/smoke-test.js -filter "C=O"
 * node debug/smoke-test.js "C1=CC=CC=C1"
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { performance } = require('perf_hooks');
const { createCanvas, Image } = require('canvas');

const DATA_DIR = path.join(__dirname, '..', 'test', 'data');

/**
 * Get current timestamp in ISO8601 format (without milliseconds)
 * @returns {string} ISO8601 timestamp like "2025-11-05T14:30:22"
 */
function getTimestamp() {
    return new Date().toISOString().split('.')[0];
}

/**
 * Get the short commit hash for a git repository
 * @param {string} repoPath - Path to the git repository
 * @returns {string} Short commit hash or 'unknown' if error
 */
function getCommitHash(repoPath) {
    const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: repoPath,
        encoding: 'utf8'
    });

    if (result.error || result.status !== 0) {
        return 'unknown';
    }

    return result.stdout.trim();
}

/**
 * Check if there are uncommitted changes in the working directory
 * @param {string} repoPath - Path to the git repository
 * @returns {boolean} True if there are uncommitted changes
 */
function hasUncommittedChanges(repoPath) {
    const result = spawnSync('git', ['status', '--porcelain'], {
        cwd: repoPath,
        encoding: 'utf8'
    });

    if (result.error || result.status !== 0) {
        return false;
    }

    return result.stdout.trim().length > 0;
}

/**
 * Get the git diff for the src/ directory
 * @param {string} repoPath - Path to the git repository
 * @returns {string} Git diff output or empty string if error
 */
function getSrcDiff(repoPath) {
    const result = spawnSync('git', ['diff', 'HEAD', 'src/'], {
        cwd: repoPath,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large diffs
    });

    if (result.error || result.status !== 0) {
        return '';
    }

    return result.stdout;
}

/**
 * Convert SVG string to PNG buffer using canvas
 * @param {string} svgString - SVG content as string
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function svgToPng(svgString) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            const targetSize = 2000;
            const canvas = createCanvas(targetSize, targetSize);
            const ctx = canvas.getContext('2d');

            // Fill with white background
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, targetSize, targetSize);

            // Calculate scaling to fit image within canvas while maintaining aspect ratio
            const scale = Math.min(targetSize / img.width, targetSize / img.height);
            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;

            // Center the image
            const x = (targetSize - scaledWidth) / 2;
            const y = (targetSize - scaledHeight) / 2;

            ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
            resolve(canvas.toBuffer('image/png'));
        };

        img.onerror = (err) => {
            reject(new Error('Failed to load SVG: ' + err));
        };

        img.src = 'data:image/svg+xml;base64,' + Buffer.from(svgString).toString('base64');
    });
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Collapse long sections of unchanged lines in a diff
 * @param {string} diffText - Git diff text
 * @returns {string} Collapsed diff text
 */
function collapseDiff(diffText) {
    if (!diffText) return '';

    const lines = diffText.split('\n');
    const result = [];
    let unchangedChunk = [];
    const CONTEXT_LINES = 3;  // Lines to show before/after changes
    const MIN_COLLAPSE = 7;   // Minimum unchanged lines to collapse

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isChanged = line.startsWith('+') || line.startsWith('-') ||
                         line.startsWith('@@') || line.startsWith('diff ') ||
                         line.startsWith('index ') || line.startsWith('---') ||
                         line.startsWith('+++');

        if (isChanged) {
            // Flush unchanged chunk before this change
            if (unchangedChunk.length > MIN_COLLAPSE) {
                // Show first CONTEXT_LINES
                for (let j = 0; j < CONTEXT_LINES && j < unchangedChunk.length; j++) {
                    result.push(unchangedChunk[j]);
                }
                // Add collapse marker
                const collapsedCount = unchangedChunk.length - (2 * CONTEXT_LINES);
                if (collapsedCount > 0) {
                    result.push(`... (${collapsedCount} unchanged lines) ...`);
                }
                // Show last CONTEXT_LINES
                for (let j = Math.max(CONTEXT_LINES, unchangedChunk.length - CONTEXT_LINES); j < unchangedChunk.length; j++) {
                    result.push(unchangedChunk[j]);
                }
            } else {
                // Chunk too small, show all
                result.push(...unchangedChunk);
            }
            unchangedChunk = [];
            result.push(line);
        } else {
            unchangedChunk.push(line);
        }
    }

    // Flush remaining unchanged chunk
    if (unchangedChunk.length > MIN_COLLAPSE) {
        for (let j = 0; j < CONTEXT_LINES && j < unchangedChunk.length; j++) {
            result.push(unchangedChunk[j]);
        }
        const collapsedCount = unchangedChunk.length - CONTEXT_LINES;
        if (collapsedCount > 0) {
            result.push(`... (${collapsedCount} unchanged lines) ...`);
        }
    } else {
        result.push(...unchangedChunk);
    }

    return result.join('\n');
}

/**
 * Build a RegExp from CLI input, supporting /pattern/flags syntax.
 * @param {string} pattern - Raw pattern string from CLI.
 * @returns {RegExp} Compiled regular expression.
 */
function buildRegexFromInput(pattern) {
    if (pattern.startsWith('/') && pattern.lastIndexOf('/') > 0) {
        const lastSlash = pattern.lastIndexOf('/');
        const source = pattern.slice(1, lastSlash);
        const flags = pattern.slice(lastSlash + 1);
        return new RegExp(source, flags);
    }
    return new RegExp(pattern);
}

/**
 * Test a value against a regex while resetting lastIndex for global patterns.
 * @param {RegExp|null} regex - Compiled filter regex.
 * @param {string} value - SMILES string to test.
 * @returns {boolean} True if value matches or regex is null.
 */
function matchesFilter(regex, value) {
    if (!regex) return true;
    regex.lastIndex = 0;
    return regex.test(value);
}

function globToRegExp(pattern) {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp('^' + escaped + '$');
}

function collectJsonDatasets(pattern) {
    if (!pattern || !fs.existsSync(DATA_DIR)) {
        return [];
    }

    const regex = globToRegExp(pattern);
    const files = fs.readdirSync(DATA_DIR).filter((file) => file.endsWith('.json'));

    return files
        .map((file) => ({
            name: path.basename(file, '.json'),
            file: path.join('..', 'test', 'data', file),
            type: 'json'
        }))
        .filter((dataset) => regex.test(dataset.name));
}

/**
 * Check that a SMILES string contains only visible ASCII characters.
 * @param {unknown} smiles - Candidate SMILES string.
 * @returns {boolean} True if smiles is a non-empty string of printable chars.
 */
function isVisibleSmiles(smiles) {
    if (typeof smiles !== 'string') {
        return false;
    }
    for (let i = 0; i < smiles.length; i++) {
        const code = smiles.charCodeAt(i);
        if (code < 32 || code === 127) {
            return false;
        }
    }
    return smiles.length > 0;
}

/**
 * Load dataset entries from either inline array or file reference.
 * @param {{name: string, entries?: string[], file?: string}} dataset - Dataset descriptor.
 * @returns {string[]} Array of SMILES strings.
 */
function loadDatasetEntries(dataset) {
    if (Array.isArray(dataset.entries)) {
        return dataset.entries;
    }

    if (!dataset.file) {
        console.error('ERROR: Dataset "' + dataset.name + '" is missing entries or file path');
        process.exit(2);
    }

    const datasetPath = path.join(__dirname, dataset.file);

    if (!fs.existsSync(datasetPath)) {
        console.error('ERROR: Dataset file not found: ' + datasetPath);
        process.exit(2);
    }

    try {
        const ext = path.extname(datasetPath).toLowerCase();
        if (ext === '.json' || dataset.type === 'json') {
            const datasetContent = fs.readFileSync(datasetPath, 'utf8');
            const parsed = JSON.parse(datasetContent);
            if (!Array.isArray(parsed)) {
                throw new Error('JSON dataset is not an array');
            }

            if (parsed.length === 0) {
                return [];
            }

            if (typeof parsed[0] === 'string') {
                return parsed;
            }

            if (typeof parsed[0] === 'object' && parsed[0] !== null) {
                const candidateKeys = [];
                if (dataset.smilesField) {
                    candidateKeys.push(dataset.smilesField);
                }
                candidateKeys.push('smiles', 'SMILES', 'Smiles', 'original', 'Original');
                const key = candidateKeys.find((k) => Object.prototype.hasOwnProperty.call(parsed[0], k) && typeof parsed[0][k] === 'string');
                if (!key) {
                    throw new Error('JSON dataset does not contain a recognizable SMILES field (smiles/original)');
                }
                return parsed
                    .map((entry) => (entry && typeof entry[key] === 'string') ? entry[key] : null)
                    .filter((value) => typeof value === 'string');
            }

            throw new Error('JSON dataset entries must be strings or objects');
        }

        const datasetContent = fs.readFileSync(datasetPath, 'utf8');
        const extractor = new Function(datasetContent + '; return ' + dataset.name + ';');
        const result = extractor();
        if (!Array.isArray(result)) {
            throw new Error('Dataset variable "' + dataset.name + '" not found or not an array');
        }
        return result;
    } catch (err) {
        console.error('ERROR: Failed to load dataset: ' + dataset.file);
        console.error(err && err.message ? err.message : err);
        process.exit(2);
    }
}

const fastDatasets = [
    { name: 'fastregression', file: '../test/fastregression.js' }
];

const fullDatasets = [
    { name: 'chembl', file: '../test/chembl.js' },
    { name: 'drugbank', file: '../test/drugbank.js' },
    { name: 'fdb', file: '../test/fdb.js' },
    { name: 'force', file: '../test/force.js' },
    { name: 'gdb17', file: '../test/gdb17.js' },
    { name: 'schembl', file: '../test/schembl.js' }
];

const args = process.argv.slice(2);
const manualSmiles = [];
let allMode = false;
let datasetName = null;
let filterPattern = null;
let includeImages = false;
let includeJson = false;

for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-all') {
        allMode = true;
        continue;
    }

    if (arg === '-dataset') {
        if (i + 1 >= args.length) {
            console.error('ERROR: -dataset flag requires a dataset name');
            process.exit(2);
        }
        datasetName = args[++i];
        continue;
    }

    if (arg === '-filter') {
        if (i + 1 >= args.length) {
            console.error('ERROR: -filter flag requires a regex pattern');
            process.exit(2);
        }
        filterPattern = args[++i];
        continue;
    }

    if (arg === '-image') {
        includeImages = true;
        continue;
    }

    if (arg === '-json') {
        includeJson = true;
        continue;
    }

    if (arg.startsWith('-')) {
        console.error('ERROR: Unknown flag: ' + arg);
        process.exit(2);
    }

    manualSmiles.push(arg);
}

if (datasetName) {
    datasetName = datasetName.replace(/^['"]|['"]$/g, '');
}

let filterRegex = null;
if (filterPattern !== null) {
    try {
        filterRegex = buildRegexFromInput(filterPattern);
    } catch (err) {
        console.error('ERROR: Invalid filter regex: ' + err.message);
        process.exit(2);
    }
}

// Build the project first
console.log('Building project...');
const buildResult = spawnSync('npx', ['tsc'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
});

// TypeScript compilation may have errors during migration, continue anyway
const gulpResult = spawnSync('npx', ['gulp', 'build'], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8'
});

if (gulpResult.error || gulpResult.status !== 0) {
    console.error('ERROR: Build failed');
    console.error(gulpResult.stderr || gulpResult.error?.message || 'Unknown error');
    process.exit(2);
}

console.log('Build complete\n');

// Generate timestamp once at the beginning
const timestamp = getTimestamp();

const hasDatasetFlag = datasetName !== null;

// Determine dataset
let datasets;
if (!hasDatasetFlag && !allMode && manualSmiles.length > 0) {
    datasets = [{ name: 'manual', entries: manualSmiles }];
} else if (allMode) {
    datasets = fullDatasets;
} else if (hasDatasetFlag && datasetName) {
    const jsonDatasets = collectJsonDatasets(datasetName);
    if (jsonDatasets.length > 0) {
        datasets = jsonDatasets;
    } else {
        const combinedDatasets = [...fastDatasets, ...fullDatasets];
        const found = combinedDatasets.find(ds => ds.name === datasetName);
        if (!found) {
            const available = [
                ...combinedDatasets.map(ds => ds.name),
                ...(fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR).filter((file) => file.endsWith('.json')).map((file) => path.basename(file, '.json')) : [])
            ];
            console.error('ERROR: Unknown dataset: ' + datasetName);
            console.error('Available datasets:', available.join(', '));
            process.exit(2);
        }
        datasets = [found];
    }
} else {
    datasets = fastDatasets;
}

// Create output directory with timestamp
const outputDir = path.join(__dirname, 'output', 'smoke', timestamp);
fs.mkdirSync(outputDir, { recursive: true });

// Get git information for current codebase
const currentDir = path.join(__dirname, '..');
const commitHash = getCommitHash(currentDir);
const hasChanges = hasUncommittedChanges(currentDir);
const srcDiff = hasChanges ? getSrcDiff(currentDir) : '';

console.log('='.repeat(80));
console.log('SMILES DRAWER SMOKE TEST');
console.log('='.repeat(80));
const modeLabel = (!hasDatasetFlag && !allMode && manualSmiles.length > 0)
    ? `MANUAL (${manualSmiles.length} SMILES)`
    : (allMode ? 'FULL (all datasets)'
        : (hasDatasetFlag && datasets.length > 1 ? `${datasetName} (${datasets.length} datasets)` : datasets[0].name));
console.log('MODE: ' + modeLabel);
console.log('COMMIT: ' + commitHash + (hasChanges ? ' (+ uncommitted changes)' : ''));
console.log('OUTPUT DIRECTORY: ' + outputDir);
if (filterRegex) {
    console.log('FILTER: ' + filterPattern);
}
console.log('IMAGES: ' + (includeImages ? 'ENABLED (-image flag)' : 'disabled'));
console.log('JSON: ' + (includeJson ? 'ENABLED (-json flag)' : 'disabled'));
console.log('='.repeat(80));
console.log('');

let totalOutputs = 0;
let totalErrors = 0;

(async () => {
for (const dataset of datasets) {
    console.log('='.repeat(80));
    console.log('TESTING DATASET: ' + dataset.name);
    console.log('='.repeat(80));

    let smilesData = loadDatasetEntries(dataset);
    console.log('LOADED: ' + smilesData.length + ' SMILES strings');

    const visibleSmiles = smilesData.filter(isVisibleSmiles);
    const removedInvisible = smilesData.length - visibleSmiles.length;
    if (removedInvisible > 0) {
        console.log('SANITIZED: removed ' + removedInvisible + ' entries with non-visible characters');
    }
    smilesData = visibleSmiles;
    if (smilesData.length === 0) {
        console.log('');
        console.log('SKIP: Dataset contains no SMILES with visible characters, moving on...');
        continue;
    }

    if (filterRegex) {
        const beforeCount = smilesData.length;
        smilesData = smilesData.filter(smiles => matchesFilter(filterRegex, smiles));
        console.log('FILTERED: ' + smilesData.length + ' of ' + beforeCount + ' SMILES matched pattern');
        if (smilesData.length === 0) {
            console.log('');
            console.log('SKIP: Dataset contains no SMILES matching filter, moving on...');
            continue;
        }
    }
    console.log('');

    for (let i = 0; i < smilesData.length; i++) {
        const smiles = smilesData[i];
        const outputNum = totalOutputs + 1;

        // Truncate long SMILES for display
        const displaySmiles = smiles.length > 60 ? smiles.substring(0, 57) + '...' : smiles;
        console.log(`[${dataset.name} ${i + 1}/${smilesData.length}] Generating: ${displaySmiles}`);

        try {
            // Generate SVG to temporary file (avoids stdout buffer issues with large molecules)
            const tempSvgFile = path.join(outputDir, `temp-${outputNum}.svg`);

            const svgStartTime = performance.now();
            const svgResult = spawnSync('node', ['debug/generate-svg.js', smiles, tempSvgFile], {
                cwd: path.join(__dirname, '..'),
                encoding: 'utf8'
            });
            const svgEndTime = performance.now();
            const svgRenderTime = svgEndTime - svgStartTime;

            if (svgResult.error || svgResult.status !== 0) {
                console.error('  ERROR: Failed to generate SVG');
                console.error('  ' + (svgResult.stderr || svgResult.error?.message || 'Unknown error'));
                totalErrors++;
                continue;
            }

            // Read SVG from file
            let svg;
            try {
                svg = fs.readFileSync(tempSvgFile, 'utf8');
                fs.unlinkSync(tempSvgFile);
            } catch (err) {
                console.error('  ERROR: Could not read SVG file');
                console.error('  ' + err.message);
                totalErrors++;
                continue;
            }

            let pngGenerated = false;
            if (includeImages) {
                try {
                    const pngBuffer = await svgToPng(svg);
                    const pngPath = path.join(outputDir, outputNum + '.png');
                    fs.writeFileSync(pngPath, pngBuffer);
                    pngGenerated = true;
                } catch (err) {
                    console.error('  ERROR: Could not convert SVG to PNG');
                    console.error('  ' + err.message);
                    totalErrors++;
                    continue;
                }
            }

            let json = '';
            let jsonRenderTime = 0;
            let jsonGenerated = false;
            if (includeJson) {
                // Generate JSON to temporary file (avoids stdout buffer issues with large molecules)
                const tempJsonFile = path.join(outputDir, `temp-${outputNum}.json`);

                const jsonStartTime = performance.now();
                const jsonResult = spawnSync('node', ['debug/generate-json.js', smiles, tempJsonFile], {
                    cwd: path.join(__dirname, '..'),
                    encoding: 'utf8'
                });
                const jsonEndTime = performance.now();
                jsonRenderTime = jsonEndTime - jsonStartTime;

                if (jsonResult.error || jsonResult.status !== 0) {
                    console.error('  ERROR: Failed to generate JSON');
                    console.error('  ' + (jsonResult.stderr || jsonResult.error?.message || 'Unknown error'));
                    totalErrors++;
                    continue;
                }

                try {
                    json = fs.readFileSync(tempJsonFile, 'utf8');
                    fs.unlinkSync(tempJsonFile);
                    jsonGenerated = true;
                } catch (err) {
                    console.error('  ERROR: Could not read JSON file');
                    console.error('  ' + err.message);
                    totalErrors++;
                    continue;
                }
            }

            // Generate HTML wrapper
            const collapsedDiff = hasChanges && srcDiff ? collapseDiff(srcDiff) : '';
            const commitHashId = `commit-hash-${outputNum}`;
            const smilesFieldId = `smiles-${outputNum}`;
            const jsonFieldId = `json-${outputNum}`;
            const diffFieldId = `diff-${outputNum}`;
            const diffSection = hasChanges && collapsedDiff ? `
        <div class="diff-section">
            <div class="section-header">
                <h3>Uncommitted Changes in src/</h3>
                <button class="copy-btn" data-copy-target="${diffFieldId}">Copy to Clipboard</button>
            </div>
            <pre class="diff-content" id="${diffFieldId}"><code>${escapeHtml(collapsedDiff)}</code></pre>
        </div>` : '';

            const totalRenderTime = svgRenderTime + (includeJson ? jsonRenderTime : 0);
            const benchmarkDetail = includeJson
                ? `SVG: ${svgRenderTime.toFixed(2)} ms &nbsp;|&nbsp; JSON: ${jsonRenderTime.toFixed(2)} ms`
                : `SVG: ${svgRenderTime.toFixed(2)} ms &nbsp;|&nbsp; JSON: disabled (-json flag not provided)`;
            const jsonSection = includeJson
                ? `<div class="json-section">
            <div class="section-header">
                <h3>JSON Position Data</h3>
                <button class="copy-btn" data-copy-target="${jsonFieldId}">Copy to Clipboard</button>
            </div>
            <div class="json-container">
                <pre id="${jsonFieldId}">${escapeHtml(json)}</pre>
            </div>
        </div>`
                : `<div class="json-section disabled">
            <div class="section-header">
                <h3>JSON Position Data</h3>
            </div>
            <p>JSON generation disabled (-json flag not provided).</p>
        </div>`;

            const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Smoke Test #${outputNum}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
            margin: 0;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .commit-info {
            background: #ecf0f1;
            padding: 12px 15px;
            border-radius: 5px;
            margin-bottom: 15px;
            font-size: 0.9em;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
        }
        .commit-text {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .commit-info .commit-label {
            font-weight: 600;
            color: #2c3e50;
        }
        .commit-info .commit-hash {
            font-family: 'Courier New', monospace;
            color: #34495e;
        }
        .commit-info .uncommitted-badge {
            display: inline-block;
            background: #e74c3c;
            color: white;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 0.85em;
        }
        .copy-btn {
            background: #3498db;
            border: none;
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.85em;
            transition: background 0.2s ease;
        }
        .copy-btn:hover:not(:disabled) {
            background: #2980b9;
        }
        .copy-btn:disabled {
            opacity: 0.7;
            cursor: default;
        }
        .section-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }
        .benchmark-info {
            background: #e8f5e9;
            padding: 12px 15px;
            border-radius: 5px;
            margin-bottom: 15px;
            font-size: 0.9em;
        }
        .benchmark-info .benchmark-label {
            font-weight: 600;
            color: #2c3e50;
        }
        .benchmark-info .benchmark-value {
            font-family: 'Courier New', monospace;
            color: #27ae60;
            font-weight: 600;
        }
        .benchmark-detail {
            margin-left: 20px;
            font-size: 0.85em;
            color: #7f8c8d;
        }
        .smiles-display {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 12px 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            overflow-x: auto;
        }
        .smiles-display code {
            font-family: 'Courier New', monospace;
            font-size: 0.95em;
            display: block;
            word-break: break-word;
        }
        .svg-container {
            background: white;
            border: 1px solid #ecf0f1;
            border-radius: 3px;
            padding: 20px;
            text-align: center;
            margin-bottom: 20px;
        }
        .svg-container svg {
            max-width: 100%;
            height: auto;
        }
        .diff-section {
            margin-top: 30px;
            background: #fff9e6;
            border: 1px solid #f1c40f;
            border-radius: 5px;
            padding: 20px;
        }
        .diff-section h3 {
            color: #2c3e50;
            margin-bottom: 15px;
        }
        .diff-content {
            background: #f8f8f8;
            border: 1px solid #bdc3c7;
            border-radius: 5px;
            padding: 15px;
            overflow-x: auto;
            max-height: 400px;
            overflow-y: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.85em;
        }
        .json-section {
            margin-top: 30px;
        }
        .json-section.disabled {
            background: #f4f6f7;
            border: 1px dashed #bdc3c7;
            border-radius: 5px;
            padding: 20px;
            color: #7f8c8d;
        }
        .json-section.disabled p {
            margin: 0;
        }
        .json-section h3 {
            color: #2c3e50;
            margin-bottom: 15px;
        }
        .json-container {
            background: #f8f8f8;
            border: 1px solid #bdc3c7;
            border-radius: 5px;
            padding: 15px;
            overflow-x: auto;
            max-height: 400px;
            overflow-y: auto;
        }
        pre {
            margin: 0;
            font-family: 'Courier New', monospace;
            font-size: 0.85em;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Smoke Test #${outputNum}</h1>

        <div class="commit-info">
            <div class="commit-text">
                <span class="commit-label">Commit:</span>
                <span class="commit-hash" id="${commitHashId}">${escapeHtml(commitHash)}</span>${hasChanges ? '<span class="uncommitted-badge">+ uncommitted</span>' : ''}
            </div>
            <button class="copy-btn" data-copy-target="${commitHashId}">Copy to Clipboard</button>
        </div>

        <div class="benchmark-info">
            <span class="benchmark-label">Total Render Time:</span>
            <span class="benchmark-value">${totalRenderTime.toFixed(2)} ms</span>
            <div class="benchmark-detail">
                ${benchmarkDetail}
            </div>
        </div>

        <div class="smiles-display">
            <div class="section-header">
                <strong>SMILES</strong>
                <button class="copy-btn" data-copy-target="${smilesFieldId}">Copy to Clipboard</button>
            </div>
            <code id="${smilesFieldId}">${escapeHtml(smiles)}</code>
        </div>

        <div class="svg-container">
            ${svg}
        </div>

        ${jsonSection}

        ${diffSection}
    </div>
    <script>
        (function() {
            const buttons = document.querySelectorAll('.copy-btn');

            async function writeText(text) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                } else {
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    try {
                        document.execCommand('copy');
                    } finally {
                        document.body.removeChild(textarea);
                    }
                }
            }

            function setFeedback(button, message) {
                const original = button.dataset.originalText || button.textContent;
                if (!button.dataset.originalText) {
                    button.dataset.originalText = original;
                }
                button.textContent = message;
                button.disabled = true;
                setTimeout(() => {
                    button.textContent = button.dataset.originalText;
                    button.disabled = false;
                }, 1500);
            }

            buttons.forEach((button) => {
                button.addEventListener('click', async () => {
                    const targetId = button.getAttribute('data-copy-target');
                    const target = targetId ? document.getElementById(targetId) : null;
                    if (!target) {
                        setFeedback(button, 'Copy failed');
                        return;
                    }

                    const text = target.innerText || target.textContent || '';
                    if (!text) {
                        setFeedback(button, 'Copy failed');
                        return;
                    }

                    try {
                        await writeText(text);
                        setFeedback(button, 'Copied!');
                    } catch (err) {
                        setFeedback(button, 'Copy failed');
                    }
                });
            });
        })();
    </script>
</body>
</html>`;

            // Save outputs
            const htmlPath = path.join(outputDir, outputNum + '.html');
            fs.writeFileSync(htmlPath, html, 'utf8');
            if (jsonGenerated) {
                const jsonPath = path.join(outputDir, outputNum + '.json');
                fs.writeFileSync(jsonPath, json, 'utf8');
            }

            const savedFiles = [outputNum + '.html'];
            if (jsonGenerated) savedFiles.push(outputNum + '.json');
            if (pngGenerated) savedFiles.push(outputNum + '.png');
            console.log('  SUCCESS: Saved ' + savedFiles.join(', '));

            const timingDetail = includeJson
                ? 'SVG: ' + svgRenderTime.toFixed(2) + ' ms, JSON: ' + jsonRenderTime.toFixed(2) + ' ms'
                : 'SVG: ' + svgRenderTime.toFixed(2) + ' ms; JSON generation disabled';
            console.log('  TIMING: Total ' + totalRenderTime.toFixed(2) + ' ms (' + timingDetail + ')');
            totalOutputs++;

        } catch (error) {
            console.error('  ERROR: ' + error.message);
            totalErrors++;
        }
    }

    console.log('');
}

    console.log('='.repeat(80));
    console.log('SMOKE TEST COMPLETE');
    console.log('='.repeat(80));
    console.log('Total outputs generated: ' + totalOutputs);
    console.log('Total errors: ' + totalErrors);
    console.log('Output directory: ' + outputDir);
    console.log('='.repeat(80));

    if (totalErrors > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
})();
