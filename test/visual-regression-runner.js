#!/usr/bin/env node

/**
 * @file Visual regression test runner for SmilesDrawer
 * @module test/visual-regression-runner
 * @description
 * Compares molecular structure renderings between two versions of SmilesDrawer.
 * By default, continues testing even when differences are found and generates
 * HTML reports with side-by-side SVG comparisons.
 *
 * ## Features
 * - Tests all SMILES (with optional fail-early mode)
 * - Generates SVG for both old and new versions (optional)
 * - Creates interactive HTML report showing differences
 * - Allows manual visual inspection of changes
 *
 * ## Usage
 * node test/visual-regression-runner.js <old-code-path> <new-code-path> [-all] [-failearly] [-novisual]
 *
 * @example
 * node test/visual-regression-runner.js /tmp/baseline /Users/ch/Develop/smilesDrawer
 * node test/visual-regression-runner.js /tmp/baseline /Users/ch/Develop/smilesDrawer -all
 * node test/visual-regression-runner.js /tmp/baseline /Users/ch/Develop/smilesDrawer -failearly
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
    console.error('Usage: node visual-regression-runner.js <old-code-path> <new-code-path> [-all] [-failearly] [-novisual]');
    console.error('  -all       Test all datasets (default: fastregression only)');
    console.error('  -failearly Stop at first difference (default: continue)');
    console.error('  -novisual  Skip SVG generation (default: generate visual comparisons)');
    console.error('');
    console.error('Example: node visual-regression-runner.js /tmp/smiles-old /Users/ch/Develop/smilesDrawer');
    console.error('Example: node visual-regression-runner.js /tmp/smiles-old /Users/ch/Develop/smilesDrawer -all -failearly');
    process.exit(2);
}

const datasets = allMode ? fullDatasets : fastDatasets;

// Create output directory for individual HTML reports (delete old results)
const outputDir = path.join(process.cwd(), 'visual-regression-results');
if (!noVisual) {
    if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true, force: true });
    }
    fs.mkdirSync(outputDir, { recursive: true });
}

console.log('='.repeat(80));
console.log('SMILES DRAWER VISUAL REGRESSION TEST');
console.log('='.repeat(80));
console.log('MODE: ' + (allMode ? 'FULL (all datasets)' : 'FAST (fastregression only)'));
console.log('FAIL-EARLY: ' + (failEarly ? 'YES (stop at first difference)' : 'NO (collect all differences)'));
console.log('VISUAL: ' + (noVisual ? 'NO (skip SVG generation)' : 'YES (generate side-by-side comparisons)'));
console.log('OLD CODE PATH: ' + oldCodePath);
console.log('NEW CODE PATH: ' + newCodePath);
if (!noVisual) {
    console.log('OUTPUT DIRECTORY: ' + outputDir);
}
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

            if (failEarly) {
                console.error('\n' + '!'.repeat(80));
                console.error('DIFFERENCE DETECTED!');
                console.error('!'.repeat(80));
                console.error('Dataset: ' + dataset.name);
                console.error('Index: ' + index + '/' + smilesList.length);
                console.error('SMILES: ' + smiles);
                console.error('Old JSON length: ' + oldJson.length + ' bytes');
                console.error('New JSON length: ' + newJson.length + ' bytes');
                console.error('\nOLD JSON:');
                console.error(oldJson);
                console.error('\nNEW JSON:');
                console.error(newJson);
                console.error('\n' + '!'.repeat(80));
                process.exit(1);
            }

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
                    diffNumber: totalDifferences
                });

                fs.writeFileSync(htmlFilePath, html, 'utf8');
                console.log('  HTML report saved: ' + htmlFilePath);
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
        console.log('DIFFERENCES FOUND');
    } else {
        console.log('DIFFERENCES FOUND - HTML REPORTS GENERATED');
    }
    console.log('='.repeat(80));
    console.log('Total tested: ' + totalTested);
    console.log('Total skipped: ' + totalSkipped);
    console.log('Differences found: ' + totalDifferences);
    if (!noVisual) {
        console.log('\nHTML reports saved to: ' + outputDir);
        console.log('Files: 1.html through ' + totalDifferences + '.html');
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
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Difference #${diff.diffNumber} - SMILES Drawer</title>
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

        @media (max-width: 768px) {
            .comparison-container {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
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
    </div>
</body>
</html>`;
}
