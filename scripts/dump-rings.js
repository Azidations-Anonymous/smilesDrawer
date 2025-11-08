#!/usr/bin/env node
/**
 * Dump SmilesDrawer ring inventory information for a given SMILES string.
 *
 * Example:
 *   node scripts/dump-rings.js --smiles 'C1CCCCC1' --pretty
 */

const Parser = require('../src/parsing/Parser.js');
const MolecularPreprocessor = require('../src/preprocessing/MolecularPreprocessor.js');
const { collectRingDiagnostics } = require('../debug/ring-diagnostics.js');

function usage() {
    console.error(`Usage: node scripts/dump-rings.js --smiles "<SMILES>" [--pretty] [--output path]

Options:
  --smiles    SMILES string to analyse (required)
  --pretty    Pretty-print the resulting JSON
  --output    Write JSON report to the given file instead of stdout
  --theme     Theme name to use during preprocessing (default: light)
`);
}

function parseArgs(argv) {
    const opts = {
        smiles: null,
        pretty: false,
        output: null,
        theme: 'light',
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--smiles' && i + 1 < argv.length) {
            opts.smiles = argv[++i];
        } else if (arg === '--pretty') {
            opts.pretty = true;
        } else if (arg === '--output' && i + 1 < argv.length) {
            opts.output = argv[++i];
        } else if (arg === '--theme' && i + 1 < argv.length) {
            opts.theme = argv[++i];
        } else if (arg === '--help' || arg === '-h') {
            usage();
            process.exit(0);
        } else {
            console.error(`Unknown argument: ${arg}`);
            usage();
            process.exit(1);
        }
    }

    if (!opts.smiles) {
        usage();
        process.exit(1);
    }

    return opts;
}

function buildReport(smiles, theme) {
    const parseTree = Parser.parse(smiles, {});
    const preprocessor = new MolecularPreprocessor({});
    preprocessor.initDraw(parseTree, theme, false, []);

    const graph = preprocessor.graph;
    const diagnostics = collectRingDiagnostics(preprocessor);

    return {
        smiles,
        vertexCount: graph.vertices.length,
        edgeCount: graph.edges.length,
        ringDiagnostics: diagnostics,
        vertices: graph.vertices
            .filter((vertex) => !!vertex)
            .map((vertex) => ({
                id: vertex.id,
                element: vertex.value.element,
                rings: Array.isArray(vertex.value.rings) ? vertex.value.rings.slice() : [],
                neighbours: Array.isArray(vertex.neighbours) ? vertex.neighbours.slice() : [],
                isDrawn: !!vertex.value.isDrawn,
                isAromatic: !!vertex.value.isPartOfAromaticRing,
            })),
    };
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    try {
        const report = buildReport(opts.smiles, opts.theme);
        const json = JSON.stringify(report, null, opts.pretty ? 2 : 0);

        if (opts.output) {
            require('node:fs').writeFileSync(opts.output, `${json}\n`, 'utf8');
        } else {
            process.stdout.write(`${json}\n`);
        }
    } catch (err) {
        console.error('Failed to dump ring data:', err.message || err);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}
