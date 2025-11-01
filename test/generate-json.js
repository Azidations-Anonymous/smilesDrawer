#!/usr/bin/env node

/**
 * @file Generates JSON representation of molecular graph data from SMILES strings for regression testing.
 * @module test/generate-json
 * @description
 * This script parses a SMILES string using SmilesDrawer and extracts the molecular graph structure
 * (vertices and edges with all their properties) as JSON. The JSON output is deterministic and can
 * be compared between different versions of the code to detect regressions.
 *
 * The graph data includes:
 * - Vertices: atom positions, elements, angles, directions, and connectivity
 * - Edges: bond types, aromatic ring membership, wedge stereochemistry
 *
 * @example
 * // Generate JSON to stdout
 * node test/generate-json.js "CCO"
 *
 * @example
 * // Generate JSON to file
 * node test/generate-json.js "CCO" /tmp/output.json
 */

const { JSDOM } = require('jsdom');
const fs = require('fs');

const smilesInput = process.argv[2];
const outputFile = process.argv[3];

if (!smilesInput) {
    console.error('ERROR: No SMILES string provided');
    console.error('Usage: node generate-json.js "<SMILES>" [output-file]');
    process.exit(2);
}

console.log(`PROCESSING: ${smilesInput}`);

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;

const SmilesDrawer = require('../app.js');

const options = {
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
    experimental: false,
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
};

try {
    console.log('PARSING: Starting parse');
    const svgDrawer = new SmilesDrawer.SvgDrawer(options);

    SmilesDrawer.parse(smilesInput, function(tree) {
        console.log('PARSE_SUCCESS: Tree generated');

        console.log('PROCESSING: Generating graph data');

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svg.setAttribute('width', String(options.width));
        svg.setAttribute('height', String(options.height));

        const drawData = svgDrawer.draw(tree, svg, 'light', false);

        const graph = svgDrawer.preprocessor.graph;
        const graphData = {
            vertices: graph && graph.vertices ? graph.vertices.map(v => ({
                id: v.id,
                value: v.value,
                position: v.position,
                positioned: v.positioned,
                angle: v.angle,
                dir: v.dir,
                neighbourCount: v.neighbours ? v.neighbours.length : 0,
                edges: v.edges ? v.edges.map(e => e.id) : []
            })) : [],
            edges: graph && graph.edges ? graph.edges.map(e => ({
                id: e.id,
                sourceId: e.sourceId,
                targetId: e.targetId,
                bondType: e.bondType,
                isPartOfAromaticRing: e.isPartOfAromaticRing,
                center: e.center,
                wedge: e.wedge
            })) : []
        };

        console.log('PROCESS_SUCCESS: Graph data extracted');

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
