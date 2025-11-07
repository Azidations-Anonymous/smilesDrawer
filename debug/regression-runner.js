#!/usr/bin/env node

/**
 * @file Regression test runner for SmilesDrawer
 * @module debug/regression-runner
 * @description
 * Compares molecular structure renderings between two versions of SmilesDrawer.
 * By default, continues testing even when differences are found and generates
 * HTML reports with side-by-side SVG comparisons and JSON output files.
 *
 * ## Features
 * - Tests all SMILES (with optional fail-early mode)
 * - Generates SVG for both old and new versions (optional with -novisual)
 * - Creates interactive HTML reports showing differences
 * - Saves JSON output to timestamped directories (optional with -json)
 * - Allows manual visual inspection of changes
 * - Supports regex filtering to limit tested SMILES (-filter)
 * - Optional PNG snapshots for changed molecules (-image)
 *
 * ## Output
 * - debug/output/regression/[timestamp]/[N].html - Side-by-side SVG comparison (unless -novisual)
 * - debug/output/regression/[timestamp]/[N].json - JSON with {old, new} fields for data comparison (requires -json)
 * - debug/output/regression/[timestamp]/[N]-old.png / [N]-new.png - PNG snapshots (requires -image)
 *
 * ## Usage
 * node debug/regression-runner.js <old-code-path> <new-code-path> [-all] [-failearly] [-novisual] [-filter <regex>] [-json] [-image]
 *
 * @example
 * node debug/regression-runner.js /tmp/baseline /Users/ch/Develop/smilesDrawer
 * node debug/regression-runner.js /tmp/baseline /Users/ch/Develop/smilesDrawer -all
 * node debug/regression-runner.js /tmp/baseline /Users/ch/Develop/smilesDrawer -failearly -novisual
 * node debug/regression-runner.js /tmp/baseline /Users/ch/Develop/smilesDrawer -json -image
 * node debug/regression-runner.js /tmp/baseline /Users/ch/Develop/smilesDrawer -filter "O=O"
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const jsondiffpatch = require('jsondiffpatch');
const htmlFormatter = require('jsondiffpatch/formatters/html');
const { performance } = require('perf_hooks');
const { createCanvas, Image } = require('canvas');

const DATA_DIR = path.join(__dirname, '..', 'test', 'data');
const NOISE_DECIMAL_PLACES = 6;
const NOISE_EPSILON = 1e-6;

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
 * Get the path to a generation script, checking both debug/ and test/ locations
 * Provides backward compatibility for old commits that have scripts in test/
 * @param {string} repoPath - Path to the git repository
 * @param {string} scriptName - Name of the script file (e.g., 'generate-svg.js')
 * @returns {string} Relative path to the script from the repo root
 */
function getScriptPath(repoPath, scriptName) {
    const debugPath = path.join(repoPath, 'debug', scriptName);
    const testPath = path.join(repoPath, 'test', scriptName);

    if (fs.existsSync(debugPath)) {
        return 'debug/' + scriptName;
    } else if (fs.existsSync(testPath)) {
        return 'test/' + scriptName;
    } else {
        return 'debug/' + scriptName;
    }
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
            throw new Error('Dataset variable "' + dataset.name + '" not found in file');
        }
        return result;
    } catch (err) {
        console.error('ERROR: Failed to load dataset: ' + dataset.file);
        console.error(err && err.message ? err.message : err);
        process.exit(2);
    }
}

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
 * Convert SVG string to PNG buffer using canvas.
 * @param {string} svgString - SVG content.
 * @returns {Promise<Buffer>} PNG buffer.
 */
async function svgToPng(svgString) {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            const targetSize = 2000;
            const canvas = createCanvas(targetSize, targetSize);
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, targetSize, targetSize);

            const scale = Math.min(targetSize / img.width, targetSize / img.height);
            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;

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
let allMode = false;
let failEarly = false;
let noVisual = false;
let bisectMode = false;
let bisectSmiles = '';
let filterPattern = null;
let datasetName = null;
let generateImages = false;
let generateJsonReports = false;
const positionalArgs = [];

for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-all') {
        allMode = true;
        continue;
    }

    if (arg === '-failearly') {
        failEarly = true;
        continue;
    }

    if (arg === '-novisual') {
        noVisual = true;
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
        generateImages = true;
        continue;
    }

    if (arg === '-json') {
        generateJsonReports = true;
        continue;
    }

    if (arg === '-bisect') {
        if (i + 1 >= args.length) {
            console.error('ERROR: -bisect flag requires a SMILES string argument');
            process.exit(2);
        }
        bisectMode = true;
        bisectSmiles = args[++i];
        continue;
    }

    if (arg.startsWith('-')) {
        console.error('ERROR: Unknown flag: ' + arg);
        process.exit(2);
    }

    positionalArgs.push(arg);
}

const oldCodePath = positionalArgs[0];
const newCodePath = positionalArgs[1];
const extraArg = positionalArgs[2];

if (!oldCodePath || !newCodePath) {
    console.error('ERROR: Missing arguments');
    console.error('Usage: node regression-runner.js <old-code-path> <new-code-path> [-all] [-failearly] [-novisual] [-filter "<regex>"] [-json] [-image] [-bisect "<smiles>"]');
    console.error('  -all         Test all datasets (default: fastregression only)');
    console.error('  -failearly   Stop at first difference (default: continue)');
    console.error('  -novisual    Skip SVG generation (default: generate visual comparisons)');
    console.error('  -filter      Only test SMILES matching the given regex (JavaScript syntax)');
    console.error('  -json        Save JSON diff reports (default: skip writing JSON files)');
    console.error('  -image       Save PNG snapshots for changed molecules (default: skip PNG files)');
    console.error('  -bisect      Test single SMILES and generate comparison report (returns 0=match, 1=difference)');
    console.error('');
    console.error('Example: node regression-runner.js /tmp/smiles-old /Users/ch/Develop/smilesDrawer');
    console.error('Example: node regression-runner.js /tmp/smiles-old /Users/ch/Develop/smilesDrawer -all -failearly');
    console.error('Example: node regression-runner.js /tmp/smiles-old /Users/ch/Develop/smilesDrawer -bisect "C1CCCCC1"');
    process.exit(2);
}

if (extraArg) {
    console.error('ERROR: Unexpected argument: ' + extraArg);
    process.exit(2);
}

if (bisectMode && filterPattern !== null) {
    console.warn('WARNING: -filter flag is ignored in -bisect mode');
}

if (noVisual && generateImages && !bisectMode) {
    console.warn('WARNING: -image flag is ignored when -novisual is set');
    generateImages = false;
}

if (datasetName) {
    datasetName = datasetName.replace(/^['"]|['"]$/g, '');
}

let filterRegex = null;
if (filterPattern !== null && !bisectMode) {
    try {
        filterRegex = buildRegexFromInput(filterPattern);
    } catch (err) {
        console.error('ERROR: Invalid filter regex: ' + err.message);
        process.exit(2);
    }
}

// Generate timestamp once at the beginning
const timestamp = getTimestamp();

// Bisect mode: test single SMILES, generate comparison report, and exit with 0=match, 1=difference
if (bisectMode) {
    (async () => {
        const smiles = sanitizeSmiles(bisectSmiles);

        // Create output directory with timestamp
        const debugDir = path.join(__dirname, 'output', 'regression', timestamp);
        fs.mkdirSync(debugDir, { recursive: true });

        // Use this as output directory
        const outputDir = debugDir;

        // Get git information
        const oldCommitHash = getCommitHash(oldCodePath);
        const newCommitHash = getCommitHash(newCodePath);
        const newHasChanges = hasUncommittedChanges(newCodePath);
        const newSrcDiff = newHasChanges ? getSrcDiff(newCodePath) : '';

        // Generate SVG files with timing
        const oldSvgFile = path.join(os.tmpdir(), 'smiles-drawer-bisect-old.svg');
        const newSvgFile = path.join(os.tmpdir(), 'smiles-drawer-bisect-new.svg');

        const oldSvgStartTime = performance.now();
        const oldSvgResult = spawnSync('node', [getScriptPath(oldCodePath, 'generate-svg.js'), smiles, oldSvgFile], {
            cwd: oldCodePath,
            encoding: 'utf8'
        });
        const oldSvgRenderTime = performance.now() - oldSvgStartTime;

        const newSvgStartTime = performance.now();
        const newSvgResult = spawnSync('node', [getScriptPath(newCodePath, 'generate-svg.js'), smiles, newSvgFile], {
            cwd: newCodePath,
            encoding: 'utf8'
        });
        const newSvgRenderTime = performance.now() - newSvgStartTime;

        if (oldSvgResult.error || oldSvgResult.status !== 0 || newSvgResult.error || newSvgResult.status !== 0) {
            console.error('ERROR: Failed to generate SVG files');
            process.exit(1);
        }

        // Generate JSON files with timing
        const oldJsonFile = path.join(os.tmpdir(), 'smiles-drawer-bisect-old.json');
        const newJsonFile = path.join(os.tmpdir(), 'smiles-drawer-bisect-new.json');

        const oldJsonStartTime = performance.now();
        const oldJsonResult = spawnSync('node', [getScriptPath(oldCodePath, 'generate-json.js'), smiles, oldJsonFile], {
            cwd: oldCodePath,
            encoding: 'utf8'
        });
        const oldJsonRenderTime = performance.now() - oldJsonStartTime;

        const newJsonStartTime = performance.now();
        const newJsonResult = spawnSync('node', [getScriptPath(newCodePath, 'generate-json.js'), smiles, newJsonFile], {
            cwd: newCodePath,
            encoding: 'utf8'
        });
        const newJsonRenderTime = performance.now() - newJsonStartTime;

        if (oldJsonResult.error || oldJsonResult.status !== 0 || newJsonResult.error || newJsonResult.status !== 0) {
            console.error('ERROR: Failed to generate JSON files');
            process.exit(1);
        }

        // Read generated files
        let oldSvg, newSvg, oldJson, newJson;
        try {
            oldSvg = fs.readFileSync(oldSvgFile, 'utf8');
            newSvg = fs.readFileSync(newSvgFile, 'utf8');
            oldJson = fs.readFileSync(oldJsonFile, 'utf8');
            newJson = fs.readFileSync(newJsonFile, 'utf8');

            // Clean up temp files
            fs.unlinkSync(oldSvgFile);
            fs.unlinkSync(newSvgFile);
            fs.unlinkSync(oldJsonFile);
            fs.unlinkSync(newJsonFile);
        } catch (err) {
            console.error('ERROR: Failed to read generated files');
            process.exit(1);
        }

        // Parse JSON and generate diff (reusing existing code pattern)
        const oldJsonObj = JSON.parse(oldJson);
        const newJsonObj = JSON.parse(newJson);
        const sanitizedOldJson = sanitizeJsonForDiff(oldJsonObj);
        const sanitizedNewJson = sanitizeJsonForDiff(newJsonObj);

        if (areJsonStructurallyEqual(sanitizedOldJson, sanitizedNewJson)) {
            console.log('Bisection mode: differences were below noise tolerance.');
            process.exit(0);
        }

        const diffBase = cloneJson(sanitizedOldJson);
        const delta = jsondiffpatch.diff(diffBase, sanitizedNewJson);
        const rawJsonDiffHtml = htmlFormatter.format(delta, diffBase);
        const jsonDiffHtml = collapseJsonDiff(rawJsonDiffHtml);

        // Save JSON diff file (optional)
        if (generateJsonReports) {
            const jsonFilePath = path.join(outputDir, 'bisect.json');
            const jsonOutput = {
                old: sanitizedOldJson,
                new: sanitizedNewJson,
                delta: delta
            };
            fs.writeFileSync(jsonFilePath, JSON.stringify(jsonOutput, null, 2), 'utf8');
        }

        // Generate HTML report (reusing existing function)
        const htmlFilePath = path.join(outputDir, 'bisect.html');
        const html = generateIndividualHTMLReport({
            dataset: 'bisect',
            index: 1,
            total: 1,
            smiles: smiles,
            oldSvg: oldSvg,
            newSvg: newSvg,
            oldJsonLength: oldJson.length,
            newJsonLength: newJson.length,
            jsonDiffHtml: jsonDiffHtml,
            diffNumber: 'bisect',
            oldCommitHash: oldCommitHash,
            newCommitHash: newCommitHash,
            newHasChanges: newHasChanges,
            newSrcDiff: newSrcDiff,
            oldSvgRenderTime: oldSvgRenderTime,
            newSvgRenderTime: newSvgRenderTime,
            oldJsonRenderTime: oldJsonRenderTime,
            newJsonRenderTime: newJsonRenderTime
        });

        fs.writeFileSync(htmlFilePath, html, 'utf8');

        if (generateImages) {
            try {
                const oldPngBuffer = await svgToPng(oldSvg);
                const newPngBuffer = await svgToPng(newSvg);
                fs.writeFileSync(path.join(outputDir, 'bisect-old.png'), oldPngBuffer);
                fs.writeFileSync(path.join(outputDir, 'bisect-new.png'), newPngBuffer);
            } catch (err) {
                console.warn('WARNING: Failed to generate PNG snapshots in bisect mode: ' + err.message);
            }
        }

        // Print output directory for shell script to capture
        console.log(outputDir);

        // Exit 0 if match, 1 if difference
        if (areJsonStructurallyEqual(sanitizedOldJson, sanitizedNewJson)) {
            console.log('Bisection mode: differences were below noise tolerance.');
            process.exit(0);
        } else if (oldJson === newJson) {
            process.exit(0);
        } else {
            process.exit(1);
        }
    })();
    return;
}

// Regular regression test mode
let datasets;
if (allMode) {
    datasets = fullDatasets;
} else if (datasetName) {
    const jsonDatasets = collectJsonDatasets(datasetName);
    if (jsonDatasets.length > 0) {
        datasets = jsonDatasets;
    } else {
        const combinedDatasets = [...fastDatasets, ...fullDatasets];
        const found = combinedDatasets.find((ds) => ds.name === datasetName);
        if (!found) {
            const available = [
                ...combinedDatasets.map((ds) => ds.name),
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
const outputDir = path.join(__dirname, 'output', 'regression', timestamp);
fs.mkdirSync(outputDir, { recursive: true });

// Get git information for both codebases
const oldCommitHash = getCommitHash(oldCodePath);
const newCommitHash = getCommitHash(newCodePath);
const newHasChanges = hasUncommittedChanges(newCodePath);
const newSrcDiff = newHasChanges ? getSrcDiff(newCodePath) : '';

if (filterRegex) {
    console.log('\x1b[93mFILTER PATTERN:\x1b[0m ' + filterPattern);
}

async function runRegression() {
let totalTested = 0;
let totalDatasets = 0;
let totalSkipped = 0;
let totalDifferences = 0;

for (const dataset of datasets) {
    console.log('\n\x1b[1;36m' + '='.repeat(80) + '\x1b[0m');
    console.log('\x1b[93mTESTING DATASET:\x1b[0m ' + dataset.name);
    console.log('\x1b[1;36m' + '='.repeat(80) + '\x1b[0m');

    let smilesList;
    try {
        smilesList = loadDatasetEntries(dataset);
    } catch (err) {
        console.error('ERROR: Failed to load dataset: ' + dataset.file);
        console.error(err && err.message ? err.message : err);
        process.exit(2);
    }

    console.log('\x1b[93mLOADED:\x1b[0m ' + smilesList.length + ' SMILES strings');

    const visibleSmiles = smilesList.filter(isVisibleSmiles);
    const removedInvisible = smilesList.length - visibleSmiles.length;
    if (removedInvisible > 0) {
        console.log('\x1b[93mSANITIZED:\x1b[0m removed ' + removedInvisible + ' entries with non-visible characters');
    }
    smilesList = visibleSmiles;
    if (smilesList.length === 0) {
        console.log('');
        console.log('\x1b[93mSKIP:\x1b[0m Dataset contains no SMILES with visible characters, skipping.');
        continue;
    }

    if (filterRegex) {
        const beforeCount = smilesList.length;
        smilesList = smilesList.filter((smiles) => matchesFilter(filterRegex, smiles));
        console.log('\x1b[93mFILTERED:\x1b[0m ' + smilesList.length + ' of ' + beforeCount + ' SMILES matched pattern');
        if (smilesList.length === 0) {
            console.log('');
            console.log('\x1b[93mSKIP:\x1b[0m Dataset has no SMILES matching filter, skipping.');
            continue;
        }
    }

    // Warmup phase: run a simple molecule through both old and new code to eliminate cold-start overhead
    console.log('\n\x1b[93mWARMUP:\x1b[0m Running simple molecule to load modules and JIT compile...');
    const warmupSmiles = 'C';
    const warmupOldJsonFile = path.join(os.tmpdir(), 'smiles-drawer-warmup-old.json');
    const warmupNewJsonFile = path.join(os.tmpdir(), 'smiles-drawer-warmup-new.json');

    spawnSync('node', [getScriptPath(oldCodePath, 'generate-json.js'), warmupSmiles, warmupOldJsonFile], {
        cwd: oldCodePath,
        encoding: 'utf8'
    });
    spawnSync('node', [getScriptPath(newCodePath, 'generate-json.js'), warmupSmiles, warmupNewJsonFile], {
        cwd: newCodePath,
        encoding: 'utf8'
    });

    if (!noVisual) {
        const warmupOldSvgFile = path.join(os.tmpdir(), 'smiles-drawer-warmup-old.svg');
        const warmupNewSvgFile = path.join(os.tmpdir(), 'smiles-drawer-warmup-new.svg');

        spawnSync('node', [getScriptPath(oldCodePath, 'generate-svg.js'), warmupSmiles, warmupOldSvgFile], {
            cwd: oldCodePath,
            encoding: 'utf8'
        });
        spawnSync('node', [getScriptPath(newCodePath, 'generate-svg.js'), warmupSmiles, warmupNewSvgFile], {
            cwd: newCodePath,
            encoding: 'utf8'
        });

        // Clean up warmup files
        try {
            fs.unlinkSync(warmupOldSvgFile);
            fs.unlinkSync(warmupNewSvgFile);
        } catch (err) {
            // Ignore cleanup errors
        }
    }

    // Clean up warmup files
    try {
        fs.unlinkSync(warmupOldJsonFile);
        fs.unlinkSync(warmupNewJsonFile);
    } catch (err) {
        // Ignore cleanup errors
    }

    console.log('\x1b[1;32m✓\x1b[0m Warmup complete');

    for (let i = 0; i < smilesList.length; i++) {
        const rawSmiles = smilesList[i];
        const smiles = sanitizeSmiles(rawSmiles);
        const index = i + 1;

        console.log('\n[' + dataset.name + ' ' + index + '/' + smilesList.length + '] Testing: ' + smiles.substring(0, 60) + (smiles.length > 60 ? '...' : ''));

        // Generate JSON for comparison
        const oldJsonFile = path.join(os.tmpdir(), 'smiles-drawer-old-json-' + Date.now() + '-' + Math.random().toString(36).substring(7) + '.json');
        const newJsonFile = path.join(os.tmpdir(), 'smiles-drawer-new-json-' + Date.now() + '-' + Math.random().toString(36).substring(7) + '.json');

        const oldJsonStartTime = performance.now();
        const oldJsonResult = spawnSync('node', [getScriptPath(oldCodePath, 'generate-json.js'), smiles, oldJsonFile], {
            cwd: oldCodePath,
            encoding: 'utf8'
        });
        const oldJsonEndTime = performance.now();
        const oldJsonRenderTime = oldJsonEndTime - oldJsonStartTime;

        if (oldJsonResult.error || oldJsonResult.status !== 0) {
            if (oldJsonResult.stderr && oldJsonResult.stderr.includes('PARSE_ERROR')) {
                console.log('  SKIP: Invalid SMILES (parse error in old code)');
                totalSkipped++;
                continue;
            }
            console.error('  WARNING: Old code failed to generate data');
            totalSkipped++;
            continue;
        }

        const newJsonStartTime = performance.now();
        const newJsonResult = spawnSync('node', [getScriptPath(newCodePath, 'generate-json.js'), smiles, newJsonFile], {
            cwd: newCodePath,
            encoding: 'utf8'
        });
        const newJsonEndTime = performance.now();
        const newJsonRenderTime = newJsonEndTime - newJsonStartTime;

        if (newJsonResult.error || newJsonResult.status !== 0) {
            if (newJsonResult.stderr && newJsonResult.stderr.includes('PARSE_ERROR')) {
                console.log('  SKIP: Invalid SMILES (parse error in new code)');
                totalSkipped++;
                continue;
            }
            console.error('  WARNING: New code failed to generate data');
            totalSkipped++;
            continue;
        }

        let oldJson, newJson;
        try {
            oldJson = fs.readFileSync(oldJsonFile, 'utf8');
            newJson = fs.readFileSync(newJsonFile, 'utf8');
            fs.unlinkSync(oldJsonFile);
            fs.unlinkSync(newJsonFile);
        } catch (err) {
            console.error('  WARNING: Failed to read JSON files');
            totalSkipped++;
            continue;
        }

        // Check if there's a difference
        if (oldJson !== newJson) {
            const oldJsonObj = JSON.parse(oldJson);
            const newJsonObj = JSON.parse(newJson);
            const sanitizedOldJson = sanitizeJsonForDiff(oldJsonObj);
            const sanitizedNewJson = sanitizeJsonForDiff(newJsonObj);

            if (areJsonStructurallyEqual(sanitizedOldJson, sanitizedNewJson)) {
                console.log('  MATCH: Differences within noise tolerance ✓');
                continue;
            }

            totalDifferences++;

            console.log('  DIFFERENCE DETECTED' + (noVisual ? '' : ' - Generating SVG comparison'));

            let reportFiles = [];
            if (!noVisual) {
                // Generate SVG for both versions
                const oldSvgFile = path.join(os.tmpdir(), 'smiles-drawer-old-svg-' + Date.now() + '-' + Math.random().toString(36).substring(7) + '.svg');
                const newSvgFile = path.join(os.tmpdir(), 'smiles-drawer-new-svg-' + Date.now() + '-' + Math.random().toString(36).substring(7) + '.svg');

                const oldSvgStartTime = performance.now();
                spawnSync('node', [getScriptPath(oldCodePath, 'generate-svg.js'), smiles, oldSvgFile], {
                    cwd: oldCodePath,
                    encoding: 'utf8'
                });
                const oldSvgEndTime = performance.now();
                const oldSvgRenderTime = oldSvgEndTime - oldSvgStartTime;

                const newSvgStartTime = performance.now();
                spawnSync('node', [getScriptPath(newCodePath, 'generate-svg.js'), smiles, newSvgFile], {
                    cwd: newCodePath,
                    encoding: 'utf8'
                });
                const newSvgEndTime = performance.now();
                const newSvgRenderTime = newSvgEndTime - newSvgStartTime;

                let oldSvg = '';
                let newSvg = '';
                try {
                    oldSvg = fs.readFileSync(oldSvgFile, 'utf8');
                    newSvg = fs.readFileSync(newSvgFile, 'utf8');
                    fs.unlinkSync(oldSvgFile);
                    fs.unlinkSync(newSvgFile);
                } catch (err) {
                    console.error('  WARNING: Failed to read SVG files');
                }

                // Parse JSON and generate diff
                const diffBase = cloneJson(sanitizedOldJson);
                const delta = jsondiffpatch.diff(diffBase, sanitizedNewJson);
                const rawJsonDiffHtml = htmlFormatter.format(delta, diffBase);
                const jsonDiffHtml = collapseJsonDiff(rawJsonDiffHtml);

                // Generate and save individual HTML report immediately
                const htmlFilePath = path.join(outputDir, totalDifferences + '.html');
                const html = generateIndividualHTMLReport({
                    dataset: dataset.name,
                    index: index,
                    total: smilesList.length,
                    smiles: smiles,
                    oldSvg: oldSvg,
                    newSvg: newSvg,
                    oldJsonLength: oldJson.length,
                    newJsonLength: newJson.length,
                    jsonDiffHtml: jsonDiffHtml,
                    diffNumber: totalDifferences,
                    oldCommitHash: oldCommitHash,
                    newCommitHash: newCommitHash,
                    newHasChanges: newHasChanges,
                    newSrcDiff: newSrcDiff,
                    oldSvgRenderTime: oldSvgRenderTime,
                    newSvgRenderTime: newSvgRenderTime,
                    oldJsonRenderTime: oldJsonRenderTime,
                    newJsonRenderTime: newJsonRenderTime
                });

                fs.writeFileSync(htmlFilePath, html, 'utf8');
                reportFiles.push(totalDifferences + '.html');

                if (generateJsonReports) {
                    const jsonFilePath = path.join(outputDir, totalDifferences + '.json');
                    const jsonOutput = {
                        old: sanitizedOldJson,
                        new: sanitizedNewJson,
                        delta: delta
                    };
                    fs.writeFileSync(jsonFilePath, JSON.stringify(jsonOutput, null, 2), 'utf8');
                    reportFiles.push(totalDifferences + '.json');
                }

                if (generateImages) {
                    try {
                        const oldPngBuffer = await svgToPng(oldSvg);
                        const newPngBuffer = await svgToPng(newSvg);
                        const oldPngPath = path.join(outputDir, totalDifferences + '-old.png');
                        const newPngPath = path.join(outputDir, totalDifferences + '-new.png');
                        fs.writeFileSync(oldPngPath, oldPngBuffer);
                        fs.writeFileSync(newPngPath, newPngBuffer);
                        reportFiles.push(totalDifferences + '-old.png', totalDifferences + '-new.png');
                    } catch (err) {
                        console.warn('  WARNING: Failed to generate PNG snapshots: ' + err.message);
                    }
                }

                console.log('  Reports saved: ' + reportFiles.join(', '));
            } else {
                // Save JSON even when -novisual is used
                if (generateJsonReports) {
                    const jsonFilePath = path.join(outputDir, totalDifferences + '.json');
                    const jsonOutput = {
                        old: sanitizedOldJson,
                        new: sanitizedNewJson
                    };
                    fs.writeFileSync(jsonFilePath, JSON.stringify(jsonOutput, null, 2), 'utf8');
                    reportFiles.push(totalDifferences + '.json');
                    console.log('  JSON saved: ' + totalDifferences + '.json');
                } else {
                    console.log('  JSON generation disabled - skipping file save');
                }
            }

            // Exit early if -failearly flag is set
            if (failEarly) {
                console.error('\n' + '!'.repeat(80));
                console.error('DIFFERENCE DETECTED - STOPPING (fail-early mode)');
                console.error('!'.repeat(80));
                console.error('Dataset: ' + dataset.name);
                console.error('Index: ' + index + '/' + smilesList.length);
                console.error('SMILES: ' + smiles);
                console.error('\nReports saved to: ' + outputDir);
                console.error('Files: ' + (reportFiles.length ? reportFiles.join(', ') : '(none)'));
                console.error('!'.repeat(80));
                process.exit(1);
            }
        } else {
            console.log('  MATCH: Identical output ✓');
        }

        totalTested++;
    }

    totalDatasets++;
    console.log('\n' + dataset.name + ' COMPLETE: ' + smilesList.length + ' SMILES tested');
}

// Final summary
console.log('\n\x1b[1;36m' + '='.repeat(80) + '\x1b[0m');
if (totalDifferences > 0) {
    if (noVisual) {
        console.log('DIFFERENCES FOUND - JSON REPORTS GENERATED');
    } else {
        console.log('DIFFERENCES FOUND - REPORTS GENERATED');
    }
    console.log('\x1b[1;36m' + '='.repeat(80) + '\x1b[0m');
    console.log('\x1b[93mTotal tested:\x1b[0m ' + totalTested);
    console.log('\x1b[93mTotal skipped:\x1b[0m ' + totalSkipped);
    console.log('\x1b[93mDifferences found:\x1b[0m ' + totalDifferences);
    const fileSummary = [];
    if (!noVisual) {
        fileSummary.push('HTML reports');
    }
    if (generateJsonReports) {
        fileSummary.push('JSON reports');
    }
    if (generateImages && !noVisual) {
        fileSummary.push('PNG snapshots');
    }
    if (fileSummary.length > 0) {
        console.log('\n\x1b[93mReports saved to:\x1b[0m ' + outputDir);
        console.log('\x1b[93mArtifacts:\x1b[0m ' + fileSummary.join(', '));
    } else {
        console.log('\n\x1b[93mArtifacts:\x1b[0m (none generated)');
    }
    console.log('\x1b[1;36m' + '='.repeat(80) + '\x1b[0m');
    process.exit(1);
} else {
    console.log('ALL TESTS PASSED - NO DIFFERENCES FOUND');
    console.log('\x1b[1;36m' + '='.repeat(80) + '\x1b[0m');
    console.log('\x1b[93mTotal tested:\x1b[0m ' + totalTested);
    console.log('\x1b[93mTotal skipped:\x1b[0m ' + totalSkipped);
    console.log('\x1b[1;36m' + '='.repeat(80) + '\x1b[0m');
    process.exit(0);
}

}

runRegression().catch(err => {
    console.error('\x1b[1;31mERROR:\x1b[0m Regression runner failed');
    console.error(err && err.stack ? err.stack : err);
    process.exit(2);
});

function sanitizeSmiles(smiles) {
    let cleaned = '';
    for (let i = 0; i < smiles.length; i++) {
        const charCode = smiles.charCodeAt(i);
        if (charCode >= 32 && charCode <= 126) {
            cleaned += smiles[i];
        }
    }
    return cleaned;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function sanitizeJsonForDiff(value) {
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeJsonForDiff(item));
    }

    if (value && typeof value === 'object') {
        const result = {};
        for (const key of Object.keys(value)) {
            result[key] = sanitizeJsonForDiff(value[key]);
        }
        return result;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const rounded = Number(value.toFixed(NOISE_DECIMAL_PLACES));
        if (Math.abs(rounded) < NOISE_EPSILON) {
            return 0;
        }
        return rounded;
    }

    return value;
}

function areJsonStructurallyEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

/**
 * Collapse unchanged fields in jsondiffpatch HTML output
 * @param {string} html - jsondiffpatch HTML output
 * @returns {string} HTML with collapsed unchanged sections
 */
function collapseJsonDiff(html) {
    if (!html) return '';

    const MIN_COLLAPSE = 2;  // Minimum unchanged fields to collapse (collapse everything)

    // Match <li> elements with their full content including nested <ul>
    const liPattern = /<li class="jsondiffpatch-(unchanged|added|deleted|modified|node)"[^>]*>.*?<\/li>/gs;
    const matches = [...html.matchAll(liPattern)];

    if (matches.length === 0) return html;

    let result = html.substring(0, matches[0].index);
    let unchangedChunk = [];
    let lastEnd = matches[0].index;

    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const isUnchanged = match[1] === 'unchanged';

        if (isUnchanged) {
            unchangedChunk.push({
                content: match[0],
                start: match.index,
                end: match.index + match[0].length
            });
        } else {
            // Process accumulated unchanged chunk
            if (unchangedChunk.length >= MIN_COLLAPSE) {
                // Add text before first unchanged item
                result += html.substring(lastEnd, unchangedChunk[0].start);

                // Add collapse marker for ALL unchanged fields
                const collapsedCount = unchangedChunk.length;
                result += `<li class="jsondiffpatch-unchanged jsondiffpatch-collapsed"><div class="jsondiffpatch-property-name">...</div><div class="jsondiffpatch-value"><pre>(${collapsedCount} unchanged field${collapsedCount > 1 ? 's' : ''})</pre></div></li>`;

                lastEnd = unchangedChunk[unchangedChunk.length - 1].end;
            } else {
                // Chunk too small, include everything
                if (unchangedChunk.length > 0) {
                    result += html.substring(lastEnd, unchangedChunk[unchangedChunk.length - 1].end);
                    lastEnd = unchangedChunk[unchangedChunk.length - 1].end;
                }
            }
            unchangedChunk = [];

            // Add the changed item
            result += html.substring(lastEnd, match.index + match[0].length);
            lastEnd = match.index + match[0].length;
        }
    }

    // Handle remaining unchanged chunk at end
    if (unchangedChunk.length >= MIN_COLLAPSE) {
        result += html.substring(lastEnd, unchangedChunk[0].start);

        const collapsedCount = unchangedChunk.length;
        result += `<li class="jsondiffpatch-unchanged jsondiffpatch-collapsed"><div class="jsondiffpatch-property-name">...</div><div class="jsondiffpatch-value"><pre>(${collapsedCount} unchanged field${collapsedCount > 1 ? 's' : ''})</pre></div></li>`;

        lastEnd = unchangedChunk[unchangedChunk.length - 1].end;
    } else if (unchangedChunk.length > 0) {
        result += html.substring(lastEnd, unchangedChunk[unchangedChunk.length - 1].end);
        lastEnd = unchangedChunk[unchangedChunk.length - 1].end;
    }

    // Add remaining HTML
    result += html.substring(lastEnd);

    return result;
}

/**
 * Collapse unchanged lines in a git diff output
 * @param {string} diffText - Raw git diff output
 * @returns {string} Collapsed diff with "..." for large unchanged chunks
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

function generateIndividualHTMLReport(diff) {
    const collapsedDiff = diff.newHasChanges && diff.newSrcDiff ? collapseDiff(diff.newSrcDiff) : '';
    const oldCommitId = 'old-commit-' + diff.diffNumber;
    const newCommitId = 'new-commit-' + diff.diffNumber;
    const smilesFieldId = 'smiles-' + diff.diffNumber;
    const jsonDiffId = 'json-diff-' + diff.diffNumber;
    const diffFieldId = 'diff-' + diff.diffNumber;
    const diffSection = diff.newHasChanges && collapsedDiff ? `
        <div class="diff-section">
            <div class="section-header">
                <h3>Uncommitted Changes in src/</h3>
                <button class="copy-btn" data-copy-target="${diffFieldId}">Copy to Clipboard</button>
            </div>
            <pre class="diff-content" id="${diffFieldId}"><code>${escapeHtml(collapsedDiff)}</code></pre>
        </div>` : '';

    const PERFORMANCE_EPSILON = 50; // milliseconds
    const oldTotalTime = diff.oldSvgRenderTime + diff.oldJsonRenderTime;
    const newTotalTime = diff.newSvgRenderTime + diff.newJsonRenderTime;
    const rawTimeDiff = newTotalTime - oldTotalTime;
    const isNoise = Math.abs(rawTimeDiff) < PERFORMANCE_EPSILON;
    const percentChange = oldTotalTime > 0 ? ((rawTimeDiff / oldTotalTime) * 100) : 0;
    const percentChangeAbs = Math.abs(percentChange);
    const isFaster = rawTimeDiff <= -PERFORMANCE_EPSILON;
    const displayTimeDiff = rawTimeDiff;
    const performanceClass = isNoise ? 'performance-neutral' : (isFaster ? 'performance-improvement' : 'performance-regression');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Difference #${diff.diffNumber} - SMILES Drawer</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsondiffpatch@0.7.3/lib/formatters/styles/html.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsondiffpatch@0.7.3/lib/formatters/styles/annotated.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #f5f5f5;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
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
            margin-bottom: 20px;
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 15px;
            font-size: 0.9em;
        }

        .commit-entry {
            background: rgba(255, 255, 255, 0.6);
            border-radius: 4px;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .commit-label-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
        }

        .commit-info .commit-label {
            font-weight: 600;
            color: #2c3e50;
        }

        .commit-hash-wrapper {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
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

        .smiles-display {
            margin: 20px 0;
            padding: 12px 15px;
            background: #eaf2fb;
            border-radius: 5px;
            font-family: 'Courier New', monospace;
            font-size: 0.95em;
            color: #2c3e50;
            border: 1px solid #d0e1f9;
        }

        .smiles-display code {
            display: block;
            word-break: break-all;
        }

        .comparison-container {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }

        .comparison-side {
            border: 1px solid #bdc3c7;
            border-radius: 5px;
            padding: 15px;
        }

        .comparison-side h4 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 1.1em;
        }

        .svg-container {
            background: white;
            border: 1px solid #ecf0f1;
            border-radius: 3px;
            padding: 10px;
            min-height: 200px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 10px;
        }

        .svg-container svg {
            max-width: 100%;
            height: auto;
        }

        .meta {
            color: #7f8c8d;
            font-size: 0.9em;
        }

        .json-diff-section {
            margin-top: 30px;
            border-top: 2px solid #ecf0f1;
            padding-top: 20px;
        }

        .json-diff-section h3 {
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 1.2em;
        }

        .json-diff-container {
            background: #f8f8f8;
            border: 1px solid #bdc3c7;
            border-radius: 5px;
            padding: 15px;
            overflow-x: auto;
            max-height: 600px;
            overflow-y: auto;
        }

        .jsondiffpatch-collapsed {
            opacity: 0.5;
            font-style: italic;
        }

        .jsondiffpatch-collapsed .jsondiffpatch-property-name,
        .jsondiffpatch-collapsed .jsondiffpatch-value {
            color: #999 !important;
        }

        .diff-section {
            margin-top: 30px;
            border-top: 2px solid #ecf0f1;
            padding-top: 20px;
        }

        .diff-section h3 {
            color: #2c3e50;
            margin-bottom: 15px;
            font-size: 1.2em;
        }

        .diff-content {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            font-family: 'Courier New', monospace;
            font-size: 0.85em;
            line-height: 1.4;
            max-height: 600px;
            overflow-y: auto;
        }

        .benchmark-info {
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            font-size: 0.9em;
        }

        .performance-improvement {
            background: #d4edda;
            border: 1px solid #c3e6cb;
        }

        .performance-regression {
            background: #f8d7da;
            border: 1px solid #f5c6cb;
        }

        .performance-neutral {
            background: #f1f1f1;
            border: 1px solid #dcdcdc;
        }

        .benchmark-info h3 {
            color: #2c3e50;
            margin-bottom: 12px;
            font-size: 1.1em;
        }

        .benchmark-comparison {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 15px;
            margin-bottom: 10px;
        }

        .benchmark-column {
            padding: 10px;
            background: white;
            border-radius: 3px;
        }

        .benchmark-label {
            font-weight: 600;
            color: #2c3e50;
            display: block;
            margin-bottom: 5px;
        }

        .benchmark-value {
            font-family: 'Courier New', monospace;
            font-size: 1.1em;
            display: block;
        }

        .benchmark-old {
            color: #e74c3c;
        }

        .benchmark-new {
            color: #27ae60;
        }

        .benchmark-delta {
            color: #2c3e50;
            font-weight: 600;
        }

        .benchmark-detail {
            font-size: 0.85em;
            color: #7f8c8d;
            margin-top: 5px;
        }

        .performance-summary {
            padding: 10px;
            background: white;
            border-radius: 3px;
            text-align: center;
            font-weight: 600;
            font-size: 1.05em;
        }

        .performance-summary.faster {
            color: #27ae60;
        }

        .performance-summary.slower {
            color: #e74c3c;
        }

        .performance-summary.neutral {
            color: #7f8c8d;
        }

        @media (max-width: 768px) {
            .comparison-container {
                grid-template-columns: 1fr;
            }

            .commit-info {
                grid-template-columns: 1fr;
            }

            .benchmark-comparison {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">

        <div class="comparison-container">
            <div class="comparison-side">
                <h4>Baseline (Old)</h4>
                <div class="svg-container">
                    ${diff.oldSvg}
                </div>
                <div class="meta">JSON: ${diff.oldJsonLength} bytes</div>
            </div>
            <div class="comparison-side">
                <h4>Current (New)</h4>
                <div class="svg-container">
                    ${diff.newSvg}
                </div>
                <div class="meta">JSON: ${diff.newJsonLength} bytes</div>
            </div>
        </div>

        <div class="smiles-display">
            <div class="section-header">
                <strong>SMILES</strong>
                <button class="copy-btn" data-copy-target="${smilesFieldId}">Copy to Clipboard</button>
            </div>
            <code id="${smilesFieldId}">${escapeHtml(diff.smiles)}</code>
        </div>

        <div class="commit-info">
            <div class="commit-entry">
                <div class="commit-label-row">
                    <span class="commit-label">Baseline Commit</span>
                    <button class="copy-btn" data-copy-target="${oldCommitId}">Copy to Clipboard</button>
                </div>
                <div class="commit-hash-wrapper">
                    <span class="commit-hash" id="${oldCommitId}">${escapeHtml(diff.oldCommitHash)}</span>
                </div>
            </div>
            <div class="commit-entry">
                <div class="commit-label-row">
                    <span class="commit-label">Current Commit</span>
                    <button class="copy-btn" data-copy-target="${newCommitId}">Copy to Clipboard</button>
                </div>
                <div class="commit-hash-wrapper">
                    <span class="commit-hash" id="${newCommitId}">${escapeHtml(diff.newCommitHash)}</span>${diff.newHasChanges ? '<span class="uncommitted-badge">+ uncommitted</span>' : ''}
                </div>
            </div>
        </div>

        <div class="benchmark-info ${performanceClass}">
            <h3>Performance Comparison</h3>
            <div class="benchmark-comparison">
                <div class="benchmark-column">
                    <span class="benchmark-label">Baseline (Old)</span>
                    <span class="benchmark-value benchmark-old">${oldTotalTime.toFixed(2)} ms</span>
                    <div class="benchmark-detail">
                        SVG: ${diff.oldSvgRenderTime.toFixed(2)} ms<br>
                        JSON: ${diff.oldJsonRenderTime.toFixed(2)} ms
                    </div>
                </div>
                <div class="benchmark-column">
                    <span class="benchmark-label">Current (New)</span>
                    <span class="benchmark-value benchmark-new">${newTotalTime.toFixed(2)} ms</span>
                    <div class="benchmark-detail">
                        SVG: ${diff.newSvgRenderTime.toFixed(2)} ms<br>
                        JSON: ${diff.newJsonRenderTime.toFixed(2)} ms
                    </div>
                </div>
                <div class="benchmark-column">
                    <span class="benchmark-label">Change</span>
                    <span class="benchmark-value benchmark-delta">${displayTimeDiff >= 0 ? '+' : ''}${displayTimeDiff.toFixed(2)} ms</span>
                    <div class="benchmark-detail">
                        ${isNoise
                            ? `|Δ| < ${PERFORMANCE_EPSILON} ms (ignored)`
                            : `${percentChangeAbs.toFixed(1)}% ${isFaster ? 'faster' : 'slower'}`}
                    </div>
                </div>
            </div>
            <div class="performance-summary ${isNoise ? 'neutral' : (isFaster ? 'faster' : 'slower')}">
                ${isNoise
                    ? `\u2713 Change ${displayTimeDiff.toFixed(2)} ms (within ±${PERFORMANCE_EPSILON} ms noise)`
                    : (isFaster ? '\u2713 Performance Improvement' : '\u26A0 Performance Regression')}
            </div>
        </div>

        <div class="json-diff-section">
            <div class="section-header">
                <h3>JSON Position Data Diff</h3>
                <button class="copy-btn" data-copy-target="${jsonDiffId}">Copy to Clipboard</button>
            </div>
            <div class="json-diff-container" id="${jsonDiffId}">
                ${diff.jsonDiffHtml}
            </div>
        </div>${diffSection}
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
}
