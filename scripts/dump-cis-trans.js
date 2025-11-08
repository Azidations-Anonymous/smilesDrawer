#!/usr/bin/env node
/**
 * Dump cis/trans metadata (chiral double bonds, neighbour orientation maps) for a SMILES string.
 *
 * Example:
 *   node scripts/dump-cis-trans.js --smiles 'C/C=C/C' --pretty
 */

const fs = require('node:fs');
const Parser = require('../src/parsing/Parser.js');
const MolecularPreprocessor = require('../src/preprocessing/MolecularPreprocessor.js');
const { collectCisTransDiagnostics } = require('../debug/cis-trans-diagnostics.js');

function usage() {
    console.error(`Usage: node scripts/dump-cis-trans.js --smiles "<SMILES>" [--pretty] [--output path]

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
    if (!graph) {
        throw new Error('Graph not initialized');
    }

    const manager = preprocessor.cisTransManager;
    const getSequenceId = manager && typeof manager.getSequenceId === 'function'
        ? (edgeId) => manager.getSequenceId(edgeId)
        : () => null;

    const bonds = graph.edges
        .filter((edge) => edge && edge.bondType === '=' && edge.cisTrans)
        .map((edge) => {
            const source = graph.vertices[edge.sourceId];
            const target = graph.vertices[edge.targetId];
            const sharedRings = source && target
                ? source.value.rings.filter((ringId) => target.value.rings.includes(ringId))
                : [];
            const analysis = typeof preprocessor.cisTransManager.getBondOrientationAnalysis === 'function'
                ? preprocessor.cisTransManager.getBondOrientationAnalysis(edge)
                : null;
            const orientationSource = analysis
                ? analysis.source
                : (edge.cisTransSource ?? (edge.chiralDict && Object.keys(edge.chiralDict).length > 0 ? 'chiralDict' : 'inferred'));

            return {
                id: edge.id,
                atoms: {
                    sourceId: edge.sourceId,
                    targetId: edge.targetId,
                    sourceElement: source?.value?.element ?? null,
                    targetElement: target?.value?.element ?? null,
                },
                chiralDict: edge.chiralDict,
                cisTransNeighbours: edge.cisTransNeighbours,
                sourceNeighbours: source ? source.neighbours.slice() : [],
                targetNeighbours: target ? target.neighbours.slice() : [],
                sharedRings,
                sequenceId: getSequenceId(edge.id ?? null),
                analysis: analysis ? {
                    isDrawnCorrectly: analysis.isCorrect,
                    evaluations: analysis.evaluations,
                    source: analysis.source
                } : {
                    isDrawnCorrectly: null,
                    evaluations: [],
                    source: orientationSource
                },
            };
        });

    return {
        smiles,
        theme,
        doubleBondCount: bonds.length,
        doubleBonds: bonds,
        cisTransDiagnostics: collectCisTransDiagnostics(preprocessor),
    };
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    try {
        const report = buildReport(opts.smiles, opts.theme);
        const json = JSON.stringify(report, null, opts.pretty ? 2 : 0);

        if (opts.output) {
            fs.writeFileSync(opts.output, `${json}\n`, 'utf8');
        } else {
            process.stdout.write(`${json}\n`);
        }
    } catch (err) {
        console.error('Failed to dump cis/trans metadata:', err.message || err);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    buildReport,
};
