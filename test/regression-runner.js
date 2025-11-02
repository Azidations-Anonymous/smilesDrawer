#!/usr/bin/env node

/**
 * @file Regression test orchestrator for SmilesDrawer
 * @module test/regression-runner
 * @description
 * Compares molecular graph outputs between two versions of SmilesDrawer to detect regressions.
 * Uses a fail-fast approach: tests SMILES strings one at a time and stops on the first mismatch.
 *
 * ## Test Modes
 * - **Fast mode (default)**: Tests only the fastregression dataset (~114 SMILES)
 * - **Full mode (-all)**: Tests all 6 datasets (thousands of SMILES)
 *
 * ## How it works
 * 1. For each SMILES string:
 *    - Sanitize input (remove control characters)
 *    - Generate molecular graph JSON from old code version
 *    - Generate molecular graph JSON from new code version
 *    - Compare JSON outputs byte-for-byte
 *    - Stop immediately if mismatch found
 * 2. Skip invalid SMILES that fail to parse in either version
 * 3. Report total tested, skipped, and any regressions found
 *
 * ## Exit codes
 * - 0: All tests passed
 * - 1: Regression detected (outputs diff)
 * - 2: Infrastructure error
 *
 * @example
 * // Test fast regression dataset
 * node test/regression-runner.js /path/to/old/code /path/to/new/code
 *
 * @example
 * // Test all datasets
 * node test/regression-runner.js /path/to/old/code /path/to/new/code -all
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
const pathArgs = args.filter(arg => !arg.startsWith('-'));

const oldCodePath = pathArgs[0];
const newCodePath = pathArgs[1];

if (!oldCodePath || !newCodePath) {
    console.error('ERROR: Missing arguments');
    console.error('Usage: node regression-runner.js <old-code-path> <new-code-path> [-all]');
    console.error('  -all  Test all datasets (default: fastregression only)');
    console.error('');
    console.error('Example: node regression-runner.js /tmp/smiles-old /Users/ch/Develop/smilesDrawer');
    console.error('Example: node regression-runner.js /tmp/smiles-old /Users/ch/Develop/smilesDrawer -all');
    process.exit(2);
}

const datasets = allMode ? fullDatasets : fastDatasets;

console.log('='.repeat(80));
console.log('SMILES DRAWER REGRESSION TEST SUITE');
console.log('='.repeat(80));
console.log('MODE: ' + (allMode ? 'FULL (all datasets)' : 'FAST (fastregression only)'));
console.log('OLD CODE PATH: ' + oldCodePath);
console.log('NEW CODE PATH: ' + newCodePath);
console.log('='.repeat(80));

let totalTested = 0;
let totalDatasets = 0;
let totalSkipped = 0;

for (const dataset of datasets) {
    console.log('\n' + '='.repeat(80));
    console.log('TESTING DATASET: ' + dataset.name);
    console.log('='.repeat(80));

    let smilesList;
    try {
        const fs = require('fs');
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

        let oldJson, newJson;

        const oldTempFile = path.join(os.tmpdir(), 'smiles-drawer-old-' + Date.now() + '-' + Math.random().toString(36).substring(7) + '.json');
        const newTempFile = path.join(os.tmpdir(), 'smiles-drawer-new-' + Date.now() + '-' + Math.random().toString(36).substring(7) + '.json');

        const oldResult = spawnSync('node', ['test/generate-json.js', smiles, oldTempFile], {
            cwd: oldCodePath,
            encoding: 'utf8'
        });

        if (oldResult.error || oldResult.status !== 0) {
            if (oldResult.stderr && oldResult.stderr.includes('PARSE_ERROR')) {
                console.log('  SKIP: Invalid SMILES (parse error in old code)');
                totalSkipped++;
                continue;
            }
            console.error('  ERROR: Old code failed to generate graph data');
            if (oldResult.error) {
                console.error('  ' + oldResult.error.message);
            }
            if (oldResult.stderr) {
                console.error('  STDERR: ' + oldResult.stderr);
            }
            if (oldResult.stdout) {
                console.error('  STDOUT: ' + oldResult.stdout);
            }
            process.exit(2);
        }

        try {
            oldJson = fs.readFileSync(oldTempFile, 'utf8');
            console.log('  OLD: Generated graph data (' + oldJson.length + ' bytes)');
            fs.unlinkSync(oldTempFile);
        } catch (err) {
            console.error('  ERROR: Failed to read JSON from old code temp file');
            console.error('  ' + err.message);
            process.exit(2);
        }

        const newResult = spawnSync('node', ['test/generate-json.js', smiles, newTempFile], {
            cwd: newCodePath,
            encoding: 'utf8'
        });

        if (newResult.error || newResult.status !== 0) {
            if (newResult.stderr && newResult.stderr.includes('PARSE_ERROR')) {
                console.log('  SKIP: Invalid SMILES (parse error in new code)');
                totalSkipped++;
                continue;
            }
            console.error('  ERROR: New code failed to generate graph data');
            if (newResult.error) {
                console.error('  ' + newResult.error.message);
            }
            if (newResult.stderr) {
                console.error('  STDERR: ' + newResult.stderr);
            }
            if (newResult.stdout) {
                console.error('  STDOUT: ' + newResult.stdout);
            }
            process.exit(2);
        }

        try {
            newJson = fs.readFileSync(newTempFile, 'utf8');
            console.log('  NEW: Generated graph data (' + newJson.length + ' bytes)');
            fs.unlinkSync(newTempFile);
        } catch (err) {
            console.error('  ERROR: Failed to read JSON from new code temp file');
            console.error('  ' + err.message);
            process.exit(2);
        }

        if (oldJson !== newJson) {
            console.error('\n' + '!'.repeat(80));
            console.error('REGRESSION DETECTED!');
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

        console.log('  MATCH: Graph data is identical ✓');
        totalTested++;
    }

    totalDatasets++;
    console.log('\n' + dataset.name + ' COMPLETE: All ' + smilesList.length + ' SMILES passed');
}

console.log('\n' + '='.repeat(80));
console.log('ALL TESTS PASSED!');
console.log('='.repeat(80));
console.log('Datasets tested: ' + totalDatasets);
console.log('Total SMILES tested: ' + totalTested);
console.log('Invalid SMILES skipped: ' + totalSkipped);
console.log('Regressions found: 0');
console.log('='.repeat(80));

process.exit(0);

/**
 * Sanitizes a SMILES string by removing non-printable ASCII characters.
 * Some datasets contain control characters that cause parse errors. This function
 * filters the input to only include visible ASCII characters (32-126).
 *
 * @param {string} smiles - The SMILES string to sanitize
 * @returns {string} Sanitized SMILES string containing only printable ASCII characters
 */
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

/**
 * Extracts JSON content between markers from script output.
 * Used as a fallback when file-based output is not available.
 *
 * @param {string} output - The raw output containing JSON_START_MARKER and JSON_END_MARKER
 * @returns {string} Extracted JSON string
 * @throws {Error} If markers are not found in the output
 * @private
 */
function extractJSON(output) {
    const startMarker = 'JSON_START_MARKER';
    const endMarker = 'JSON_END_MARKER';

    const startIndex = output.indexOf(startMarker);
    const endIndex = output.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1) {
        const err = new Error('Could not find JSON markers in output. Output length: ' + output.length + ', has start: ' + (startIndex !== -1) + ', has end: ' + (endIndex !== -1));
        err.output = output;
        throw err;
    }

    return output.substring(startIndex + startMarker.length, endIndex).trim();
}
