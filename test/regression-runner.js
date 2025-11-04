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
const { performance } = require('perf_hooks');

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

// Check for bisect mode
const bisectIndex = args.indexOf('-bisect');
const bisectMode = bisectIndex !== -1;
let bisectSmiles = '';

if (bisectMode) {
    if (bisectIndex + 1 >= args.length) {
        console.error('ERROR: -bisect flag requires a SMILES string argument');
        process.exit(2);
    }
    bisectSmiles = args[bisectIndex + 1];
}

const pathArgs = args.filter((arg, index) => {
    if (arg.startsWith('-')) return false;
    if (index > 0 && args[index - 1] === '-bisect') return false;
    return true;
});

const oldCodePath = pathArgs[0];
const newCodePath = pathArgs[1];

if (!oldCodePath || !newCodePath) {
    console.error('ERROR: Missing arguments');
    console.error('Usage: node regression-runner.js <old-code-path> <new-code-path> [-all] [-failearly] [-novisual] [-bisect "<smiles>"]');
    console.error('  -all         Test all datasets (default: fastregression only)');
    console.error('  -failearly   Stop at first difference (default: continue)');
    console.error('  -novisual    Skip SVG generation (default: generate visual comparisons)');
    console.error('  -bisect      Test single SMILES for bisect mode (returns 0=match, 1=difference)');
    console.error('');
    console.error('Example: node regression-runner.js /tmp/smiles-old /Users/ch/Develop/smilesDrawer');
    console.error('Example: node regression-runner.js /tmp/smiles-old /Users/ch/Develop/smilesDrawer -all -failearly');
    console.error('Example: node regression-runner.js /tmp/smiles-old /Users/ch/Develop/smilesDrawer -bisect "C1CCCCC1"');
    process.exit(2);
}

// Bisect mode: test single SMILES and exit with 0=match, 1=difference
if (bisectMode) {
    const smiles = sanitizeSmiles(bisectSmiles);

    // Generate JSON for comparison
    const oldJsonFile = path.join(os.tmpdir(), 'smiles-drawer-bisect-old.json');
    const newJsonFile = path.join(os.tmpdir(), 'smiles-drawer-bisect-new.json');

    const oldJsonResult = spawnSync('node', ['test/generate-json.js', smiles, oldJsonFile], {
        cwd: oldCodePath,
        encoding: 'utf8'
    });

    if (oldJsonResult.error || oldJsonResult.status !== 0) {
        // Old code failed - treat as difference
        process.exit(1);
    }

    const newJsonResult = spawnSync('node', ['test/generate-json.js', smiles, newJsonFile], {
        cwd: newCodePath,
        encoding: 'utf8'
    });

    if (newJsonResult.error || newJsonResult.status !== 0) {
        // New code failed - treat as difference
        process.exit(1);
    }

    // Read and compare JSON
    let oldJson, newJson;
    try {
        oldJson = fs.readFileSync(oldJsonFile, 'utf8');
        newJson = fs.readFileSync(newJsonFile, 'utf8');
    } catch (err) {
        // File read error - treat as difference
        process.exit(1);
    } finally {
        // Clean up temp files
        try {
            fs.unlinkSync(oldJsonFile);
            fs.unlinkSync(newJsonFile);
        } catch (err) {
            // Ignore cleanup errors
        }
    }

    // Exit 0 if match, 1 if difference
    if (oldJson === newJson) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

// Regular regression test mode
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

    console.log('\x1b[93mLOADED:\x1b[0m ' + smilesList.length + ' SMILES strings');

    // Warmup phase: run a simple molecule through both old and new code to eliminate cold-start overhead
    console.log('\n\x1b[93mWARMUP:\x1b[0m Running simple molecule to load modules and JIT compile...');
    const warmupSmiles = 'C';
    const warmupOldJsonFile = path.join(os.tmpdir(), 'smiles-drawer-warmup-old.json');
    const warmupNewJsonFile = path.join(os.tmpdir(), 'smiles-drawer-warmup-new.json');

    spawnSync('node', ['test/generate-json.js', warmupSmiles, warmupOldJsonFile], {
        cwd: oldCodePath,
        encoding: 'utf8'
    });
    spawnSync('node', ['test/generate-json.js', warmupSmiles, warmupNewJsonFile], {
        cwd: newCodePath,
        encoding: 'utf8'
    });

    if (!noVisual) {
        const warmupOldSvgFile = path.join(os.tmpdir(), 'smiles-drawer-warmup-old.svg');
        const warmupNewSvgFile = path.join(os.tmpdir(), 'smiles-drawer-warmup-new.svg');

        spawnSync('node', ['test/generate-svg.js', warmupSmiles, warmupOldSvgFile], {
            cwd: oldCodePath,
            encoding: 'utf8'
        });
        spawnSync('node', ['test/generate-svg.js', warmupSmiles, warmupNewSvgFile], {
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
        const oldJsonResult = spawnSync('node', ['test/generate-json.js', smiles, oldJsonFile], {
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
        const newJsonResult = spawnSync('node', ['test/generate-json.js', smiles, newJsonFile], {
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
            totalDifferences++;

            console.log('  DIFFERENCE DETECTED' + (noVisual ? '' : ' - Generating SVG comparison'));

            if (!noVisual) {
                // Generate SVG for both versions
                const oldSvgFile = path.join(os.tmpdir(), 'smiles-drawer-old-svg-' + Date.now() + '-' + Math.random().toString(36).substring(7) + '.svg');
                const newSvgFile = path.join(os.tmpdir(), 'smiles-drawer-new-svg-' + Date.now() + '-' + Math.random().toString(36).substring(7) + '.svg');

                const oldSvgStartTime = performance.now();
                spawnSync('node', ['test/generate-svg.js', smiles, oldSvgFile], {
                    cwd: oldCodePath,
                    encoding: 'utf8'
                });
                const oldSvgEndTime = performance.now();
                const oldSvgRenderTime = oldSvgEndTime - oldSvgStartTime;

                const newSvgStartTime = performance.now();
                spawnSync('node', ['test/generate-svg.js', smiles, newSvgFile], {
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
                const oldJsonObj = JSON.parse(oldJson);
                const newJsonObj = JSON.parse(newJson);
                const delta = jsondiffpatch.diff(oldJsonObj, newJsonObj);
                const rawJsonDiffHtml = htmlFormatter.format(delta, oldJsonObj);
                const jsonDiffHtml = collapseJsonDiff(rawJsonDiffHtml);

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
                    newSrcDiff: newSrcDiff,
                    oldSvgRenderTime: oldSvgRenderTime,
                    newSvgRenderTime: newSvgRenderTime,
                    oldJsonRenderTime: oldJsonRenderTime,
                    newJsonRenderTime: newJsonRenderTime
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
    console.log('\n\x1b[93mReports saved to:\x1b[0m ' + outputDir);
    if (noVisual) {
        console.log('\x1b[93mFiles:\x1b[0m 1.json through ' + totalDifferences + '.json');
    } else {
        console.log('\x1b[93mFiles:\x1b[0m 1.html, 1.json through ' + totalDifferences + '.html, ' + totalDifferences + '.json');
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
    const diffSection = diff.newHasChanges && collapsedDiff ? `
        <div class="diff-section">
            <h3>Uncommitted Changes in src/</h3>
            <pre class="diff-content"><code>${escapeHtml(collapsedDiff)}</code></pre>
        </div>` : '';

    const oldTotalTime = diff.oldSvgRenderTime + diff.oldJsonRenderTime;
    const newTotalTime = diff.newSvgRenderTime + diff.newJsonRenderTime;
    const timeDiff = newTotalTime - oldTotalTime;
    const percentChange = oldTotalTime > 0 ? ((timeDiff / oldTotalTime) * 100) : 0;
    const isFaster = timeDiff < 0;
    const performanceClass = isFaster ? 'performance-improvement' : 'performance-regression';

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

        .commit-info > div:last-child {
            text-align: right;
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
                    <span class="benchmark-value benchmark-delta">${timeDiff >= 0 ? '+' : ''}${timeDiff.toFixed(2)} ms</span>
                    <div class="benchmark-detail">
                        ${Math.abs(percentChange).toFixed(1)}% ${isFaster ? 'faster' : 'slower'}
                    </div>
                </div>
            </div>
            <div class="performance-summary ${isFaster ? 'faster' : 'slower'}">
                ${isFaster ? '\u2713 Performance Improvement' : '\u26A0 Performance Regression'}
            </div>
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
