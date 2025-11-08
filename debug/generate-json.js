#!/usr/bin/env node

/**
 * @file Generates JSON representation of molecular graph data from SMILES strings for regression testing.
 * @module test/generate-json
 * @description
 * This script parses a SMILES string using SmilesDrawer and extracts the molecular graph structure
 * using the public getPositionData() API. The JSON output is deterministic and versioned, allowing
 * comparison between different versions of the code to detect regressions.
 *
 * The graph data includes:
 * - Version: Format version number for compatibility
 * - Vertices: comprehensive atom data with positions, elements, angles, stereochemistry
 * - Edges: bond types, aromatic ring membership, wedge stereochemistry
 * - Rings: ring membership and properties
 * - Metadata: graph-level information (counts, mappings, flags)
 *
 * @example
 * // Generate JSON to stdout
 * node test/generate-json.js "CCO"
 *
 * @example
 * // Generate JSON to file
 * node test/generate-json.js "CCO" /tmp/output.json
 */

const scriptStartTime = Date.now();

const domLibLoadStart = Date.now();
const { parseHTML } = require('linkedom');
const domLibLoadEnd = Date.now();
console.log(`TIMING: linkedom load took ${domLibLoadEnd - domLibLoadStart}ms`);

const fs = require('fs');

const { createMoleculeOptions } = require('./molecule-options');
const { collectRingDiagnostics } = require('./ring-diagnostics');

const smilesInput = process.argv[2];
const outputFile = process.argv[3];

if (!smilesInput) {
    console.error('ERROR: No SMILES string provided');
    console.error('Usage: node generate-json.js "<SMILES>" [output-file]');
    process.exit(2);
}

console.log(`PROCESSING: ${smilesInput}`);

const domSetupStart = Date.now();
const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.HTMLElement = window.HTMLElement;
global.SVGElement = window.SVGElement;
global.HTMLCanvasElement = window.HTMLCanvasElement;
global.HTMLImageElement = window.HTMLImageElement;
global.Element = window.Element;
global.Node = window.Node;
global.DOMParser = window.DOMParser;
global.XMLSerializer = window.XMLSerializer;
const domSetupEnd = Date.now();
console.log(`TIMING: DOM setup took ${domSetupEnd - domSetupStart}ms`);

const smilesDrawerLoadStart = Date.now();
const SmilesDrawer = require('../app.js');
const smilesDrawerLoadEnd = Date.now();
console.log(`TIMING: SmilesDrawer load took ${smilesDrawerLoadEnd - smilesDrawerLoadStart}ms`);

const options = createMoleculeOptions({
    width: 500,
    height: 500,
    bondThickness: 1.0,
    bondLength: 30,
    shortBondLength: 0.85,
    bondSpacing: 0.18 * 30,
    atomVisualization: 'default',
    isomeric: true,
    debug: false,
    terminalCarbons: false,
    explicitHydrogens: false,
    overlapSensitivity: 0.42,
    overlapResolutionIterations: 1,
    compactDrawing: true,
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSizeLarge: 6,
    fontSizeSmall: 4,
    padding: 20.0,
    themes: {
        dark: {
            C: '#fff',
            O: '#e74c3c',
            N: '#3498db',
            F: '#27ae60',
            CL: '#16a085',
            BR: '#d35400',
            I: '#8e44ad',
            P: '#d35400',
            S: '#f39c12',
            B: '#e67e22',
            SI: '#e67e22',
            H: '#aaa',
            BACKGROUND: '#141414'
        },
        light: {
            C: '#222',
            O: '#e74c3c',
            N: '#3498db',
            F: '#27ae60',
            CL: '#16a085',
            BR: '#d35400',
            I: '#8e44ad',
            P: '#d35400',
            S: '#f39c12',
            B: '#e67e22',
            SI: '#e67e22',
            H: '#999',
            BACKGROUND: '#fff'
        }
    }
});

try {
    console.log('PARSING: Starting parse');
    const parseStartTime = Date.now();
    const svgDrawer = new SmilesDrawer.SvgDrawer(options);

    SmilesDrawer.parse(smilesInput, function(tree) {
        const parseEndTime = Date.now();
        console.log(`PARSE_SUCCESS: Tree generated (took ${parseEndTime - parseStartTime}ms)`);

        console.log('PROCESSING: Generating graph data');
        const drawStartTime = Date.now();

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', String(options.width));
        svg.setAttribute('height', String(options.height));

        svgDrawer.draw(tree, svg, 'light', false);

        // Use the new public API to get positioning data
        const graphData = svgDrawer.getPositionData();
        const ringDiagnostics = collectRingDiagnostics(svgDrawer.preprocessor);
        if (ringDiagnostics) {
            if (graphData && typeof graphData === 'object' && graphData.serializedData && typeof graphData.serializedData === 'object') {
                graphData.serializedData.ringDiagnostics = ringDiagnostics;
            } else if (graphData && typeof graphData === 'object') {
                graphData.ringDiagnostics = ringDiagnostics;
            }
        }
        const drawEndTime = Date.now();

        console.log(`PROCESS_SUCCESS: Graph data extracted using getPositionData() API (took ${drawEndTime - drawStartTime}ms)`);

        const jsonOutput = JSON.stringify(graphData, null, 2);

        if (outputFile) {
            fs.writeFileSync(outputFile, jsonOutput, 'utf8');
            console.log('JSON written to: ' + outputFile);
            console.log('JSON length: ' + jsonOutput.length + ' bytes');
        } else {
            console.log('JSON_START_MARKER');
            console.log(jsonOutput);
            console.log('JSON_END_MARKER');
        }

        const scriptEndTime = Date.now();
        console.log(`TIMING: Total script execution time: ${scriptEndTime - scriptStartTime}ms`);

        process.exit(0);
    }, function(err) {
        console.error('PARSE_ERROR: ' + err);
        process.exit(1);
    });
} catch (err) {
    console.error('FATAL_ERROR: ' + err.message);
    console.error(err.stack);
    process.exit(1);
}
