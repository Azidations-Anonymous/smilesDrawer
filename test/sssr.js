#!/usr/bin/env node

/**
 * @file Structural ring detection tests focused on SSSR behaviour.
 * @description
 * Test suite that validates the Smallest Set of Smallest Rings implementation
 * against fused-ring examples using Node's built-in test runner.
 *
 * Run via: npm run test:sssr
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const Parser = require('../src/parsing/Parser.js');
const MolecularPreprocessor = require('../src/preprocessing/MolecularPreprocessor.js');
const SSSR = require('../src/algorithms/SSSR.js');

const TPPP_SMILES = 'C=9C=CC(C7=C1C=CC(=N1)C(C=2C=CC=CC=2)=C3C=CC(N3)=C(C=4C=CC=CC=4)C=5C=CC(N=5)=C(C=6C=CC=CC=6)C8=CC=C7N8)=CC=9';
const FIGURE_S2_MACROCYCLE = 'C/C/1=C\\CC/C(=C/CC(=C(C)CCC=C(C)C)CC1)/C';

/**
 * Convenience helper – parse SMILES, build the graph, and return the rings.
 * @param {string} smiles
 * @returns {number[][]} ring membership expressed as vertex id arrays
 */
function detectRings(smiles) {
    const parseTree = Parser.parse(smiles, {});
    const preprocessor = new MolecularPreprocessor({});
    preprocessor.initDraw(parseTree, 'light', false, []);
    const rings = SSSR.getRings(preprocessor.graph, false);
    return rings ?? [];
}

function canonicalizeRings(rings) {
    const sortedRings = rings.map((ring) => [...ring].sort((a, b) => a - b));
    sortedRings.sort((a, b) => {
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) {
            if (a[i] !== b[i]) {
                return a[i] - b[i];
            }
        }
        return a.length - b.length;
    });
    return sortedRings;
}

/**
 * Run the molecular preprocessor pipeline to access ring metadata.
 * @param {string} smiles
 * @returns {MolecularPreprocessor}
 */
function prepareMolecule(smiles) {
    const parseTree = Parser.parse(smiles, {});
    const preprocessor = new MolecularPreprocessor({});
    preprocessor.initDraw(parseTree, 'light', false, []);
    return preprocessor;
}

describe('SSSR ring detection', () => {
    it('should detect single ring in cyclohexane', () => {
        const rings = detectRings('C1CCCCC1');
        assert.equal(rings.length, 1, 'Cyclohexane should have exactly 1 ring');
    });

    it('should detect single aromatic ring in benzene', () => {
        const rings = detectRings('c1ccccc1');
        assert.equal(rings.length, 1, 'Benzene should have exactly 1 aromatic ring');
    });

    it('should detect 2 rings in decalin (fused cyclohexanes)', () => {
        const rings = detectRings('C1CCCC2CC1CCCC2');
        assert.equal(rings.length, 2, 'Decalin should have exactly 2 rings');
    });

    it('should detect 2 rings in naphthalene (fused aromatic rings)', () => {
        const rings = detectRings('c1ccc2cccc2c1');
        assert.equal(rings.length, 2, 'Naphthalene should have exactly 2 fused aromatic rings');
    });

    it('should detect no fused rings in TPPP', () => {
        const preprocessor = prepareMolecule(TPPP_SMILES);
        const fused = preprocessor.getFusedRings();
        assert.equal(fused.length, 0, 'TPPP should not yield fused rings');
    });

    it('should include a super-ring in the TPPP SSSR output', () => {
        const rings = detectRings(TPPP_SMILES);
        assert.ok(rings.length > 0, 'SSSR returned no rings for TPPP');

        const largest = Math.max(...rings.map(r => r.length));
        assert.ok(
            largest >= 12,
            `Expected at least one ring of size ≥12 in TPPP SSSR output, observed sizes: ${rings.map(r => r.length).join(', ')}`
        );
    });

    it('matches PIKAChU fused cyclohexane SSSR for decalin', () => {
        const rings = detectRings('C1CCC2CC1CCC2');
        const canonical = canonicalizeRings(rings);

        assert.deepEqual(
            canonical,
            [
                [0, 1, 2, 3, 4, 5],
                [3, 4, 5, 6, 7, 8],
            ],
            'Decalin SSSR should mirror PIKAChU fused cyclohexane rings'
        );
    });

    it('matches PIKAChU fused aromatic SSSR for naphthalene', () => {
        const rings = detectRings('c1ccc2cccc2c1');
        const canonical = canonicalizeRings(rings);

        assert.deepEqual(
            canonical,
            [
                [0, 1, 2, 3, 7, 8],
                [3, 4, 5, 6, 7],
            ],
            'Naphthalene SSSR should match PIKAChU fused aromatic rings'
        );
    });

    it('matches PIKAChU adamantane cage SSSR', () => {
        const rings = detectRings('C1C2CC3CC(C1)CC(C2)C3');
        const canonical = canonicalizeRings(rings);

        assert.deepEqual(
            canonical,
            [
                [0, 1, 2, 3, 4, 5, 6],
                [1, 2, 3, 8, 9, 10],
                [3, 4, 5, 7, 8, 10]
            ],
            'Adamantane SSSR should match PIKAChU cage rings'
        );
    });

    it('matches PIKAChU anthracene fused aromatic SSSR', () => {
        const rings = detectRings('c1ccc2cc3ccccc3cc2c1');
        const canonical = canonicalizeRings(rings);

        assert.deepEqual(
            canonical,
            [
                [0, 1, 2, 3, 12, 13],
                [3, 4, 5, 10, 11, 12],
                [5, 6, 7, 8, 9, 10]
            ],
            'Anthracene SSSR should match PIKAChU fused rings'
        );
    });

    it('produces large macrocycle SSSR consistent with PIKAChU', () => {
        const rings = detectRings('C1CCCCC2CCCCCC3CCCCCC4CCCCCC5CCCCCC6CCCCCC(C1)C2C3C4C5C6');
        const orderedByLength = rings.map((ring) => ring.length).sort((a, b) => a - b);

        assert.deepEqual(
            orderedByLength,
            [9, 9, 9, 9, 9, 12],
            'Macrocycle SSSR lengths should match PIKAChU expectations'
        );
    });

    it('matches PIKAChU ferrioxamine-like macrocycle SSSR', () => {
        const ferrioxamine = 'CC1=[O][Fe]2345ON1CCC[C@H]1NC(=O)CNC(=O)[C@H](CO)NC(=O)CNC(=O)[C@@H](CCCN(O2)C(C)=[O]3)NC(=O)[C@@H](CCCN(O4)C(C)=[O]5)NC1=O';
        const rings = detectRings(ferrioxamine);
        const ordered = rings.map((ring) => ring.length).sort((a, b) => a - b);

        assert.deepEqual(
            ordered,
            [5, 5, 5, 15, 15, 16],
            'Ferrioxamine macrocycle SSSR lengths should match PIKAChU expectations'
        );
    });

    it('detects the Additional file 2 Fig. S2 macrocycle ring', () => {
        const rings = detectRings(FIGURE_S2_MACROCYCLE);
        const ordered = rings.map((ring) => ring.length).sort((a, b) => a - b);

        assert.deepEqual(
            ordered,
            [10],
            'Figure S2 macrocycle should contribute a single 10-membered ring'
        );
    });

    it('exposes aromatic macrocycles captured via Johnson inventory', () => {
        const molecule = prepareMolecule('c1ccc2cccc2c1');
        const aromaticInventory = molecule.getAromaticRings();
        const sizes = aromaticInventory.map((ring) => ring.members.length);

        const sssrAromaticSizes = molecule.rings
            .filter((ring) => molecule.isRingAromatic(ring))
            .map((ring) => ring.members.length);

        assert.ok(
            aromaticInventory.length >= sssrAromaticSizes.length,
            'Cycle inventory should include at least the SSSR aromatic rings'
        );

        const longestInventory = Math.max(...sizes);
        const longestSSSR = Math.max(...sssrAromaticSizes);
        assert.ok(
            longestInventory > longestSSSR,
            'Aromatic inventory should expose longer fused cycles than the SSSR basis'
        );
    });
});
