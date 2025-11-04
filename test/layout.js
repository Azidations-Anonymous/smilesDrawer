#!/usr/bin/env node

/**
 * Comprehensive layout tests for Kamada-Kawai force-directed algorithm.
 * Tests verify correct positioning, finite coordinates, and layout quality.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Parser = require('../src/parsing/Parser.js');
const MolecularPreprocessor = require('../src/preprocessing/MolecularPreprocessor.js');

function computePositions(smiles) {
    const preprocessor = new MolecularPreprocessor({});
    preprocessor.initDraw(Parser.parse(smiles, {}), 'light', false, []);
    preprocessor.processGraph();
    return preprocessor.graph.vertices.map(vertex => ({
        id: vertex.id,
        x: vertex.position.x,
        y: vertex.position.y,
        positioned: vertex.positioned,
        forcePositioned: vertex.forcePositioned
    }));
}

function assertAllFinite(positions, message = 'All coordinates should be finite') {
    positions.forEach(({ x, y, id }) => {
        assert.ok(Number.isFinite(x), `${message}: vertex ${id} x=${x}`);
        assert.ok(Number.isFinite(y), `${message}: vertex ${id} y=${y}`);
    });
}

function assertAllPositioned(positions, message = 'All vertices should be positioned') {
    positions.forEach(({ id, positioned }) => {
        assert.ok(positioned, `${message}: vertex ${id} not positioned`);
    });
}

function assertNoOverlaps(positions, minDistance = 5.0) {
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            const dx = positions[i].x - positions[j].x;
            const dy = positions[i].y - positions[j].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            assert.ok(
                distance >= minDistance,
                `Vertices ${positions[i].id} and ${positions[j].id} too close: ${distance.toFixed(2)} < ${minDistance}`
            );
        }
    }
}

function computeBoundingBox(positions) {
    if (positions.length === 0) {
        return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
    }
    const minX = Math.min(...positions.map(p => p.x));
    const maxX = Math.max(...positions.map(p => p.x));
    const minY = Math.min(...positions.map(p => p.y));
    const maxY = Math.max(...positions.map(p => p.y));
    return {
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX,
        height: maxY - minY
    };
}

describe('Kamada-Kawai layout - basic structures', () => {
    it('places all vertices for single ring (cyclohexane)', () => {
        const positions = computePositions('C1CCCCC1');
        assert.equal(positions.length, 6, 'Cyclohexane should have 6 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions);
    });

    it('places all vertices for small aromatic ring (benzene)', () => {
        const positions = computePositions('c1ccccc1');
        assert.equal(positions.length, 6, 'Benzene should have 6 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions);
    });

    it('places all vertices for larger ring (cyclooctane)', () => {
        const positions = computePositions('C1CCCCCCC1');
        assert.equal(positions.length, 8, 'Cyclooctane should have 8 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions);
    });

    it('places all vertices for small ring (cyclopropane)', () => {
        const positions = computePositions('C1CC1');
        assert.equal(positions.length, 3, 'Cyclopropane should have 3 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions, 3.0); // Smaller minimum distance for small ring
    });
});

describe('Kamada-Kawai layout - fused ring systems', () => {
    it('places all vertices for fused cyclohexanes (decalin)', () => {
        const positions = computePositions('C1CCCC2CC1CCCC2');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions);
    });

    it('places all vertices for fused aromatic rings (naphthalene)', () => {
        const positions = computePositions('c1ccc2ccccc2c1');
        assert.equal(positions.length, 10, 'Naphthalene should have 10 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions);
    });

    it('places all vertices for triple fused rings (anthracene)', () => {
        const positions = computePositions('c1ccc2cc3ccccc3cc2c1');
        assert.equal(positions.length, 14, 'Anthracene should have 14 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions);
    });

    it('places all vertices for complex fused system (phenanthrene)', () => {
        const positions = computePositions('c1ccc2c(c1)ccc1ccccc12');
        assert.equal(positions.length, 14, 'Phenanthrene should have 14 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions);
    });
});

describe('Kamada-Kawai layout - bridged systems', () => {
    it('places all vertices for simple bridged system (bicyclo[2.2.1]heptane/norbornane)', () => {
        const positions = computePositions('C1CC2CCC1C2');
        assert.equal(positions.length, 7, 'Norbornane should have 7 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions);
    });

    it('places all vertices for adamantane (tricyclic bridged)', () => {
        const positions = computePositions('C1C2CC3CC1CC(C2)C3');
        assert.equal(positions.length, 10, 'Adamantane should have 10 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions);
    });

    it('places all vertices for cubane (highly symmetric bridged)', () => {
        const positions = computePositions('C12C3C4C1C5C4C3C25');
        assert.equal(positions.length, 8, 'Cubane should have 8 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions);
    });
});

describe('Kamada-Kawai layout - edge cases', () => {
    it('handles linear chains without rings', () => {
        const positions = computePositions('CCCC');
        assert.equal(positions.length, 4, 'Butane should have 4 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
    });

    it('handles branched structures', () => {
        const positions = computePositions('CC(C)C');
        assert.equal(positions.length, 4, 'Isobutane should have 4 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
    });

    it('handles ring with substituents', () => {
        const positions = computePositions('C1CCCCC1C');
        assert.equal(positions.length, 7, 'Methylcyclohexane should have 7 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
    });
});

describe('Kamada-Kawai layout - quality metrics', () => {
    it('maintains reasonable spacing in cyclohexane', () => {
        const positions = computePositions('C1CCCCC1');
        const bbox = computeBoundingBox(positions);

        // Layout should use reasonable space (not collapsed to tiny area)
        assert.ok(bbox.width > 10, `Layout width ${bbox.width} should be > 10`);
        assert.ok(bbox.height > 10, `Layout height ${bbox.height} should be > 10`);

        // Layout should not be excessively spread out
        assert.ok(bbox.width < 1000, `Layout width ${bbox.width} should be < 1000`);
        assert.ok(bbox.height < 1000, `Layout height ${bbox.height} should be < 1000`);
    });

    it('produces similar-sized layouts for similar-sized rings', () => {
        const pos5 = computePositions('C1CCCC1');
        const pos6 = computePositions('C1CCCCC1');
        const pos7 = computePositions('C1CCCCCC1');

        const bbox5 = computeBoundingBox(pos5);
        const bbox6 = computeBoundingBox(pos6);
        const bbox7 = computeBoundingBox(pos7);

        // Bounding boxes should increase gradually with ring size
        assert.ok(bbox5.width > 0 && bbox6.width > 0 && bbox7.width > 0);
        assert.ok(bbox7.width > bbox5.width, 'Larger ring should have larger layout');
    });

    it('positions force-positioned vertices in bridged systems', () => {
        const positions = computePositions('C1CC2CCC1C2');
        const forcePositionedCount = positions.filter(p => p.forcePositioned).length;

        // Bridged system should have some force-positioned vertices
        assert.ok(forcePositionedCount > 0, 'Bridged system should have force-positioned vertices');
    });
});

describe('Kamada-Kawai layout - complex molecules', () => {
    it('handles steroid-like fused ring system', () => {
        // Simplified steroid skeleton
        const positions = computePositions('C1CCC2C1CCC1C2CCC2C1CCCC2');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions);
    });

    it('handles large aromatic system (pyrene)', () => {
        const positions = computePositions('c1cc2ccc3cccc4ccc(c1)c2c34');
        assert.equal(positions.length, 16, 'Pyrene should have 16 vertices');
        assertAllPositioned(positions);
        assertAllFinite(positions);
        assertNoOverlaps(positions);
    });
});
