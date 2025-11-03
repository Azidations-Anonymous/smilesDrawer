#!/usr/bin/env node

/**
 * @file Regression test runner for SmilesDrawer
 * @module test/regression-runner
 * @description
 * Compares molecular structure renderings between two versions of SmilesDrawer.
 * By default, continues testing even when differences are found and generates
 * HTML reports with side-by-side SVG comparisons and JSON output files.
 *
 * ## Features
 * - Tests all SMILES (with optional fail-early mode)
 * - Generates SVG for both old and new versions (optional with -novisual)
 * - Creates interactive HTML reports showing differences
 * - Saves JSON output to regression-results/ directory
 * - Allows manual visual inspection of changes
 *
 * ## Output
 * - regression-results/[N].html - Side-by-side SVG comparison (unless -novisual)
 * - regression-results/[N].json - JSON with {old, new} fields for data comparison
 *
 * ## Usage
 * node test/regression-runner.js <old-code-path> <new-code-path> [-all] [-failearly] [-novisual]
 *
 * @example
 * node test/regression-runner.js /tmp/baseline /Users/ch/Develop/smilesDrawer
 * node test/regression-runner.js /tmp/baseline /Users/ch/Develop/smilesDrawer -all
 * node test/regression-runner.js /tmp/baseline /Users/ch/Develop/smilesDrawer -failearly -novisual
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const jsondiffpatch = require('jsondiffpatch');
const htmlFormatter = require('jsondiffpatch/formatters/html');

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

const fastDatasets = [
    { name: 'fastregression', file: './fastregression.js' }
];

const fullDatasets = [
    { name: 'chembl', file: './chembl.js' },
    { name: 'drugbank', file: './drugbank.js' },
    { name: 'fdb', file: './fdb.js' },
    { name: 'force', file: './force.js' },
    { name: 'gdb17', file: './gdb17.js' },
    { name: 'schembl', file: './schembl.js' }
];

const args = process.argv.slice(2);
const allMode = args.includes('-all');
const failEarly = args.includes('-failearly');
const noVisual = args.includes('-novisual');
const pathArgs = args.filter(arg => !arg.startsWith('-'));

const oldCodePath = pathArgs[0];
const newCodePath = pathArgs[1];

if (!oldCodePath || !newCodePath) {
    console.error('ERROR: Missing arguments');
    console.error('Usage: node regression-runner.js <old-code-path> <new-code-path> [-all] [-failearly] [-novisual]');
    console.error('  -all       Test all datasets (default: fastregression only)');
    console.error('  -failearly Stop at first difference (default: continue)');
    console.error('  -novisual  Skip SVG generation (default: generate visual comparisons)');
    console.error('');
    console.error('Example: node regression-runner.js /tmp/smiles-old /Users/ch/Develop/smilesDrawer');
    console.error('Example: node regression-runner.js /tmp/smiles-old /Users/ch/Develop/smilesDrawer -all -failearly');
    process.exit(2);
}

const datasets = allMode ? fullDatasets : fastDatasets;

// Create output directory for reports (delete old results)
const outputDir = path.join(process.cwd(), 'regression-results');
if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
}
fs.mkdirSync(outputDir, { recursive: true });

// Get git information for both codebases
const oldCommitHash = getCommitHash(oldCodePath);
const newCommitHash = getCommitHash(newCodePath);
const newHasChanges = hasUncommittedChanges(newCodePath);
const newSrcDiff = newHasChanges ? getSrcDiff(newCodePath) : '';

console.log('='.repeat(80));
console.log('SMILES DRAWER REGRESSION TEST');
console.log('='.repeat(80));
console.log('MODE: ' + (allMode ? 'FULL (all datasets)' : 'FAST (fastregression only)'));
console.log('FAIL-EARLY: ' + (failEarly ? 'YES (stop at first difference)' : 'NO (collect all differences)'));
console.log('VISUAL: ' + (noVisual ? 'NO (skip SVG generation)' : 'YES (generate side-by-side comparisons)'));
console.log('OLD CODE PATH: ' + oldCodePath);
console.log('OLD COMMIT: ' + oldCommitHash);
console.log('NEW CODE PATH: ' + newCodePath);
console.log('NEW COMMIT: ' + newCommitHash + (newHasChanges ? ' (+ uncommitted changes)' : ''));
console.log('OUTPUT DIRECTORY: ' + outputDir);
console.log('='.repeat(80));

let totalTested = 0;
let totalDatasets = 0;
let totalSkipped = 0;
let totalDifferences = 0;

for (const dataset of datasets) {
    console.log('\n' + '='.repeat(80));
    console.log('TESTING DATASET: ' + dataset.name);
    console.log('='.repeat(80));

    let smilesList;
    try {
        const datasetContent = fs.readFileSync(path.join(__dirname, dataset.file), 'utf8');
        const func = new Function(datasetContent + '; return ' + dataset.name + ';');
        smilesList = func();
        if (!smilesList) {
            throw new Error('Dataset variable "' + dataset.name + '" not found in file');
        }
    } catch (err) {
        console.error('ERROR: Failed to load dataset: ' + dataset.file);
        console.error(err.message);
        process.exit(2);
    }

    console.log('LOADED: ' + smilesList.length + ' SMILES strings');

    for (let i = 0; i < smilesList.length; i++) {
        const rawSmiles = smilesList[i];
        const smiles = sanitizeSmiles(rawSmiles);
        const index = i + 1;

        console.log('\n[' + dataset.name + ' ' + index + '/' + smilesList.length + '] Testing: ' + smiles.substring(0, 60) + (smiles.length > 60 ? '...' : ''));

        // Generate JSON for comparison
        const oldJsonFile = path.join(os.tmpdir(), 'smiles-drawer-old-json-' + Date.now() + '-' + Math.random().toString(36).substring(7) + '.json');
        const newJsonFile = path.join(os.tmpdir(), 'smiles-drawer-new-json-' + Date.now() + '-' + Math.random().toString(36).substring(7) + '.json');

        const oldJsonResult = spawnSync('node', ['test/generate-json.js', smiles, oldJsonFile], {
            cwd: oldCodePath,
            encoding: 'utf8'
        });

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

        const newJsonResult = spawnSync('node', ['test/generate-json.js', smiles, newJsonFile], {
            cwd: newCodePath,
            encoding: 'utf8'
        });

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
            totalDifferences++;

            console.log('  DIFFERENCE DETECTED' + (noVisual ? '' : ' - Generating SVG comparison'));

            if (!noVisual) {
                // Generate SVG for both versions
                const oldSvgFile = path.join(os.tmpdir(), 'smiles-drawer-old-svg-' + Date.now() + '-' + Math.random().toString(36).substring(7) + '.svg');
                const newSvgFile = path.join(os.tmpdir(), 'smiles-drawer-new-svg-' + Date.now() + '-' + Math.random().toString(36).substring(7) + '.svg');

                spawnSync('node', ['test/generate-svg.js', smiles, oldSvgFile], {
                    cwd: oldCodePath,
                    encoding: 'utf8'
                });

                spawnSync('node', ['test/generate-svg.js', smiles, newSvgFile], {
                    cwd: newCodePath,
                    encoding: 'utf8'
                });

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
                const oldJsonObj = JSON.parse(oldJson);
                const newJsonObj = JSON.parse(newJson);
                const delta = jsondiffpatch.diff(oldJsonObj, newJsonObj);
                const jsonDiffHtml = htmlFormatter.format(delta, oldJsonObj);

                // Save JSON diff to file
                const jsonFilePath = path.join(outputDir, totalDifferences + '.json');
                const jsonOutput = {
                    old: oldJsonObj,
                    new: newJsonObj,
                    delta: delta
                };
                fs.writeFileSync(jsonFilePath, JSON.stringify(jsonOutput, null, 2), 'utf8');

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
                    newSrcDiff: newSrcDiff
                });

                fs.writeFileSync(htmlFilePath, html, 'utf8');
                console.log('  Reports saved: ' + totalDifferences + '.html, ' + totalDifferences + '.json');
            } else {
                // Save JSON even when -novisual is used
                const jsonFilePath = path.join(outputDir, totalDifferences + '.json');
                const jsonOutput = {
                    old: JSON.parse(oldJson),
                    new: JSON.parse(newJson)
                };
                fs.writeFileSync(jsonFilePath, JSON.stringify(jsonOutput, null, 2), 'utf8');
                console.log('  JSON saved: ' + totalDifferences + '.json');
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
                if (noVisual) {
                    console.error('Files: 1.json');
                } else {
                    console.error('Files: 1.html, 1.json');
                }
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
console.log('\n' + '='.repeat(80));
if (totalDifferences > 0) {
    if (noVisual) {
        console.log('DIFFERENCES FOUND - JSON REPORTS GENERATED');
    } else {
        console.log('DIFFERENCES FOUND - REPORTS GENERATED');
    }
    console.log('='.repeat(80));
    console.log('Total tested: ' + totalTested);
    console.log('Total skipped: ' + totalSkipped);
    console.log('Differences found: ' + totalDifferences);
    console.log('\nReports saved to: ' + outputDir);
    if (noVisual) {
        console.log('Files: 1.json through ' + totalDifferences + '.json');
    } else {
        console.log('Files: 1.html, 1.json through ' + totalDifferences + '.html, ' + totalDifferences + '.json');
    }
    console.log('='.repeat(80));
    process.exit(1);
} else {
    console.log('ALL TESTS PASSED - NO DIFFERENCES FOUND');
    console.log('='.repeat(80));
    console.log('Total tested: ' + totalTested);
    console.log('Total skipped: ' + totalSkipped);
    console.log('='.repeat(80));
    process.exit(0);
}

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

function generateIndividualHTMLReport(diff) {
    const diffSection = diff.newHasChanges && diff.newSrcDiff ? `
        <div class="diff-section">
            <h3>Uncommitted Changes in src/</h3>
            <pre class="diff-content"><code>${escapeHtml(diff.newSrcDiff)}</code></pre>
        </div>` : '';

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
            margin-bottom: 15px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            font-size: 0.9em;
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
            margin-left: 8px;
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

        .full-width-comparison {
            margin-top: 30px;
            border-top: 2px solid #ecf0f1;
            padding-top: 20px;
        }

        .full-width-comparison h3 {
            color: #2c3e50;
            margin-bottom: 20px;
            font-size: 1.2em;
        }

        .full-width-svg-section {
            margin-bottom: 30px;
        }

        .full-width-svg-section h4 {
            color: #2c3e50;
            margin-bottom: 10px;
            font-size: 1.1em;
        }

        .full-width-svg-container {
            background: white;
            border: 1px solid #bdc3c7;
            border-radius: 5px;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 10px;
        }

        .full-width-svg-container svg {
            max-width: 100%;
            height: auto;
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

        @media (max-width: 768px) {
            .comparison-container {
                grid-template-columns: 1fr;
            }

            .commit-info {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="commit-info">
            <div>
                <span class="commit-label">Baseline Commit:</span>
                <span class="commit-hash">${escapeHtml(diff.oldCommitHash)}</span>
            </div>
            <div>
                <span class="commit-label">Current Commit:</span>
                <span class="commit-hash">${escapeHtml(diff.newCommitHash)}</span>${diff.newHasChanges ? '<span class="uncommitted-badge">+ uncommitted</span>' : ''}
            </div>
        </div>

        <div class="smiles-display">
            <code>${escapeHtml(diff.smiles)}</code>
        </div>

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

        <div class="full-width-comparison">
            <h3>Full-Width Comparison</h3>

            <div class="full-width-svg-section">
                <h4>Baseline (Old)</h4>
                <div class="full-width-svg-container">
                    ${diff.oldSvg}
                </div>
                <div class="meta">JSON: ${diff.oldJsonLength} bytes</div>
            </div>

            <div class="full-width-svg-section">
                <h4>Current (New)</h4>
                <div class="full-width-svg-container">
                    ${diff.newSvg}
                </div>
                <div class="meta">JSON: ${diff.newJsonLength} bytes</div>
            </div>
        </div>

        <div class="json-diff-section">
            <h3>JSON Position Data Diff</h3>
            <div class="json-diff-container">
                ${diff.jsonDiffHtml}
            </div>
        </div>${diffSection}
    </div>
</body>
</html>`;
}
