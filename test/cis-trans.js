#!/usr/bin/env node

/**
 * Regression tests for cis/trans stereobond corrections.
 *
 * The tests mirror the SMILES directional markers directly:
 *   - identical `/` or `\\` markers imply trans arrangements,
 *   - differing markers imply cis arrangements,
 * even when the double bond is embedded inside a ring.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Parser = require('../src/parsing/Parser.js');
const MolecularPreprocessor = require('../src/preprocessing/MolecularPreprocessor.js');
const { collectCisTransDiagnostics } = require('../debug/cis-trans-diagnostics.js');

const FIGURE_S2_SMILES = 'C[C@H]1C[C@@]23C(=O)/C(=C\\4/C=C/C(=C/[C@@H](C/C=C/C(=C/[C@]2(C=C1C)C)/C)O)/CO4)/C(=O)O3';

function prepareGraph(smiles) {
    const preprocessor = new MolecularPreprocessor({});
    preprocessor.initDraw(Parser.parse(smiles, {}), 'light', false, []);
    preprocessor.processGraph();
    return preprocessor.graph;
}

function getDirectionalNeighbour(graph, vertex, oppositeId) {
    for (const neighbourId of vertex.neighbours) {
        if (neighbourId === oppositeId) {
            continue;
        }
        const edge = graph.getEdge(vertex.id, neighbourId);
        if (edge && edge.stereoSymbol) {
            return graph.vertices[neighbourId];
        }
    }
    return null;
}

function sideOfLine(a, b, point) {
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (cross > 0) {
        return 1;
    }
    if (cross < 0) {
        return -1;
    }
    return 0;
}

function measuredOrientation(graph) {
    const edge = graph.edges.find(e => e.bondType === '=' && e.cisTrans);
    assert.ok(edge, 'no stereogenic double bond found');
    const vertexA = graph.vertices[edge.sourceId];
    const vertexB = graph.vertices[edge.targetId];
    const neighbourA = getDirectionalNeighbour(graph, vertexA, vertexB.id);
    const neighbourB = getDirectionalNeighbour(graph, vertexB, vertexA.id);

    assert.ok(neighbourA, 'missing directional neighbour on first atom');
    assert.ok(neighbourB, 'missing directional neighbour on second atom');

    const placementA = sideOfLine(vertexA.position, vertexB.position, neighbourA.position);
    const placementB = sideOfLine(vertexA.position, vertexB.position, neighbourB.position);

    assert.notStrictEqual(placementA, 0, 'degenerate placement for first substituent');
    assert.notStrictEqual(placementB, 0, 'degenerate placement for second substituent');

    return placementA === placementB ? 'cis' : 'trans';
}

function pointInPolygon(point, polygon, epsilon = 1e-6) {
    const almostEqual = (a, b) => Math.abs(a - b) <= epsilon;

    // Treat exact vertex matches as inside.
    for (const vertex of polygon) {
        if (almostEqual(vertex.x, point.x) && almostEqual(vertex.y, point.y)) {
            return true;
        }
    }

    const pointOnSegment = (a, b, p) => {
        const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        if (!almostEqual(cross, 0)) {
            return false;
        }
        const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
        if (dot < -epsilon) {
            return false;
        }
        const lenSq = (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);
        if (dot - lenSq > epsilon) {
            return false;
        }
        return true;
    };

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[j];
        const b = polygon[i];

        if (pointOnSegment(a, b, point)) {
            return true;
        }

        const intersects =
            ((a.y > point.y) !== (b.y > point.y)) &&
            (point.x < (b.x - a.x) * (point.y - a.y) / ((b.y - a.y) || Number.EPSILON) + a.x);

        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

describe('Cis/trans stereobond corrections', () => {
    it('keeps trans substituents on opposite sides for linear chains', () => {
        const graph = prepareGraph('F/C=C/F');
        assert.equal(measuredOrientation(graph), 'trans');
    });

    it('keeps cis substituents on the same side for linear chains', () => {
        const graph = prepareGraph('F/C=C\\F');
        assert.equal(measuredOrientation(graph), 'cis');
    });

    it('resolves ring-embedded trans bonds before overlap resolution', () => {
        const graph = prepareGraph('C1/C=C/CC=C\\1');
        assert.equal(measuredOrientation(graph), 'trans');
    });

    it('assigns sequence IDs to alternating stereobonds', () => {
        const preprocessor = new MolecularPreprocessor({});
        preprocessor.initDraw(Parser.parse('C/C=C/C=C/C', {}), 'light', false, []);
        preprocessor.processGraph();

        const diagnostics = collectCisTransDiagnostics(preprocessor);
        const sequenceIds = diagnostics
            .map((entry) => entry.sequenceId)
            .filter((id) => typeof id === 'number');

        assert.ok(sequenceIds.length >= 2, 'expected at least two stereobonds with a sequence id');
        const unique = new Set(sequenceIds);
        assert.equal(unique.size, 1, 'alternating stereobonds should share the same sequence id');
    });

    it('includes sequence IDs in cis/trans diagnostics output', () => {
        const preprocessor = new MolecularPreprocessor({});
        preprocessor.initDraw(Parser.parse('F/C=C/C=C/F', {}), 'light', false, []);
        preprocessor.processGraph();

        const diagnostics = collectCisTransDiagnostics(preprocessor);
        const annotated = diagnostics.find((entry) => typeof entry.sequenceId === 'number');

        assert.ok(annotated, 'expected diagnostics entry with a numeric sequence id');
        assert.ok(Array.isArray(annotated.evaluations) && annotated.evaluations.length > 0, 'diagnostics entry should retain evaluations');
    });

    it('flags inferred orientation source when no chiral dict exists', () => {
        const preprocessor = new MolecularPreprocessor({});
        preprocessor.initDraw(Parser.parse('C/C=C/C', {}), 'light', false, []);
        preprocessor.processGraph();

        const edge = preprocessor.graph.edges.find((e) => e.bondType === '=' && e.cisTrans);
        assert.ok(edge, 'expected stereogenic bond');
        edge.chiralDict = {};
        edge.cisTransNeighbours = {};
        edge.cisTrans = true;
        preprocessor.buildCisTransMetadata();

        const diagnostics = collectCisTransDiagnostics(preprocessor);
        const inferred = diagnostics.find((entry) => entry.orientationSource === 'inferred');
        assert.ok(inferred, 'expected at least one diagnostics entry marked as inferred');
    });

    it('reuses existing chiral dicts when rebuilding metadata', () => {
        const preprocessor = new MolecularPreprocessor({});
        preprocessor.initDraw(Parser.parse('F/C=C/F', {}), 'light', false, []);
        preprocessor.processGraph();

        const graph = preprocessor.graph;
        const edge = graph.edges.find((e) => e.bondType === '=' && e.cisTrans);
        assert.ok(edge, 'expected stereogenic double bond');

        const originalDict = JSON.stringify(edge.chiralDict || {});
        edge.cisTrans = false;
        edge.cisTransNeighbours = {};

        preprocessor.buildCisTransMetadata();

        assert.equal(JSON.stringify(edge.chiralDict || {}), originalDict, 'chiral dict should persist across rebuilds');
        assert.equal(JSON.stringify(edge.cisTransNeighbours || {}), originalDict, 'cisTransNeighbours should be restored from persisted chiral dict');
    });

    it('stabilises long alternating sequences', () => {
        const smiles = 'F/C=C/C=C/C=C/C=F';
        const preprocessor = new MolecularPreprocessor({});
        preprocessor.initDraw(Parser.parse(smiles, {}), 'light', false, []);
        preprocessor.processGraph();

        const diagnostics = collectCisTransDiagnostics(preprocessor);
        const sequenceIds = new Set();
        for (const entry of diagnostics) {
            assert.equal(entry.isDrawnCorrectly, true, `sequence bond ${entry.edgeId} should be corrected`);
            assert.equal(entry.evaluations[0].actual, entry.evaluations[0].expected, 'orientation should match expectation');
            if (entry.sequenceId !== null && entry.sequenceId !== undefined) {
                sequenceIds.add(entry.sequenceId);
            }
        }

        assert(sequenceIds.size <= 1, 'all alternating bonds should share the same sequence id');
    });

    it('exposes fallback ring plans for constrained stereobonds', () => {
        const smiles = 'C1/C=C/C=C\\1';
        const preprocessor = new MolecularPreprocessor({});
        preprocessor.initDraw(Parser.parse(smiles, {}), 'light', false, []);
        preprocessor.processGraph();

        const graph = preprocessor.graph;
        const edge = graph.edges.find((e) => e.bondType === '=' && e.cisTrans && graph.vertices[e.sourceId].value.rings.length && graph.vertices[e.targetId].value.rings.length);
        assert.ok(edge, 'expected a ring-embedded stereogenic bond');

        const manager = preprocessor.cisTransManager;
        const plans = manager['generateFallbackRingPlans'](edge);
        assert.ok(Array.isArray(plans) && plans.length >= 2, 'should expose at least two fallback ring plans');

        for (const plan of plans) {
            assert(plan.central.value.rings.length > 0, 'central atom must belong to a ring');
            const shared = plan.central.value.rings.filter((ringId) => plan.flanking[0].value.rings.includes(ringId) && plan.flanking[1].value.rings.includes(ringId));
            assert.ok(shared.length > 0, 'flanking atoms should share a ring with the central atom');
        }
    });

    it('serialises chiral metadata via dump-cis-trans CLI', () => {
        const smiles = 'F/C=C/F';
        const script = path.resolve(__dirname, '..', 'scripts', 'dump-cis-trans.js');
        const result = spawnSync('node', [script, '--smiles', smiles], { encoding: 'utf8' });
        assert.equal(result.status, 0, `CLI failed: ${result.stderr}`);

        const payload = JSON.parse(result.stdout);
        assert.ok(payload.doubleBondCount >= 1, 'expected at least one stereogenic bond in CLI output');
        const first = payload.doubleBonds[0];
        assert.ok(first.chiralDict && Object.keys(first.chiralDict).length > 0, 'CLI output should include chiralDict entries');
        assert.ok(Array.isArray(payload.cisTransDiagnostics) && payload.cisTransDiagnostics.length > 0, 'CLI output should include diagnostics');
        assert.ok(payload.cisTransDiagnostics[0].orientationSource, 'diagnostics should record orientation source');
    });

    it('round-trips chiralDict via debug/generate-json.js', () => {
        const smiles = 'F/C=C/F';
        const script = path.resolve(__dirname, '..', 'debug', 'generate-json.js');
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cis-trans-json-'));
        const outputPath = path.join(tmpDir, 'out.json');

        try {
            const result = spawnSync('node', [script, smiles, outputPath], { encoding: 'utf8' });
            assert.equal(result.status, 0, `generate-json failed: ${result.stderr}`);

            const payload = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
            const edges = payload.serializedData ? payload.serializedData.edges : payload.edges;
            assert.ok(Array.isArray(edges) && edges.length > 0, 'JSON output should contain edges');
            const stereobond = edges.find((edge) => edge && edge.cisTrans);
            assert.ok(stereobond, 'expected at least one stereogenic edge in JSON output');
            assert.ok(stereobond.chiralDict && Object.keys(stereobond.chiralDict).length > 0, 'serialized edge should include chiralDict');
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});
