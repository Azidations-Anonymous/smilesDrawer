#!/usr/bin/env node

/**
 * Property-based tests validating generic Kamada-Kawai behaviour using fast-check.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');

// Use the production preprocessing code paths to ensure the WASM/JS layout is
// exercised exactly as it would be in the browser.
const Parser = require('../src/parsing/Parser.js');
const MolecularPreprocessor = require('../src/preprocessing/MolecularPreprocessor.js');
const Graph = require('../src/graph/Graph.js');

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/**
 * Fully preprocess a SMILES string so the returned graph reflects the
 * production layout pipeline (ring handling, fused structures, etc.).
 */
function prepareMolecule(smiles) {
    const preprocessor = new MolecularPreprocessor({});
    preprocessor.initDraw(Parser.parse(smiles, {}), 'light', false, []);
    preprocessor.processGraph();
    return {
        graph: preprocessor.graph,
        bondLength: preprocessor.opts.bondLength
    };
}

/**
 * Return current vertex positions for evaluation. We copy the values to avoid
 * mutating the underlying graph in the tests.
 */
function collectPositions(graph) {
    return graph.vertices.map(vertex => ({
        x: vertex.position.x,
        y: vertex.position.y
    }));
}

/**
 * Compute layout edge lengths; used to correlate geometry with bond length.
 */
function computeEdgeLengths(graph) {
    const positions = collectPositions(graph);
    return graph.edges.map(edge => {
        const source = positions[edge.sourceId];
        const target = positions[edge.targetId];
        return Math.hypot(source.x - target.x, source.y - target.y);
    });
}

/**
 * Assert every coordinate is finite.
 */
function ensureFinite(points, context) {
    points.forEach((p, idx) => {
        assert.ok(Number.isFinite(p.x), `${context}: x not finite for vertex ${idx}`);
        assert.ok(Number.isFinite(p.y), `${context}: y not finite for vertex ${idx}`);
    });
}

/**
 * Rough bounding radius of the layout used in "more atoms ⇒ more space" checks.
 */
function computeBoundingSize(points) {
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    return Math.hypot(width, height);
}

/**
 * Centre a set of points around the origin (translation invariance).
 */
function centrePoints(points) {
    const centroid = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    const inv = 1 / points.length;
    centroid.x *= inv;
    centroid.y *= inv;
    return points.map(p => ({ x: p.x - centroid.x, y: p.y - centroid.y }));
}

/**
 * Rotate a point cloud by a given angle.
 */
function rotatePoints(points, angle) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return points.map(p => ({
        x: p.x * c - p.y * s,
        y: p.x * s + p.y * c
    }));
}

/**
 * Translate a point cloud.
 */
function translatePoints(points, dx, dy) {
    return points.map(p => ({
        x: p.x + dx,
        y: p.y + dy
    }));
}

/**
 * Compute radii about the origin (after centring).
 */
function computeRadii(points) {
    return points.map(p => Math.hypot(p.x, p.y));
}

/**
 * Max |value - mean| helper.
 */
function maxDeviation(values) {
    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    return Math.max(...values.map(v => Math.abs(v - avg)));
}

/**
 * Pairwise distances sorted ascending (used to compare congruent layouts).
 */
function pairwiseSortedDistances(points) {
    const distances = [];
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            distances.push(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y));
        }
    }
    return distances.sort((a, b) => a - b);
}

/**
 * Average spring energy per pair.
 */
function computeSpringEnergyAverage(graph, bondLength) {
    const positions = collectPositions(graph);
    const dist = graph.getDistanceMatrix();
    let total = 0;
    let pairs = 0;
    for (let i = 0; i < dist.length; i++) {
        for (let j = i + 1; j < dist.length; j++) {
            const dij = dist[i][j];
            if (!Number.isFinite(dij) || dij === 0) {
                continue;
            }
            const dx = positions[i].x - positions[j].x;
            const dy = positions[i].y - positions[j].y;
            const actual = Math.hypot(dx, dy);
            const desired = bondLength * dij;
            const strength = bondLength * Math.pow(dij, -2.0);
            total += strength * Math.pow(actual - desired, 2);
            pairs++;
        }
    }
    return pairs ? total / pairs : 0;
}

/**
 * Gradient magnitude of the current energy landscape.
 */
function computeGradientMagnitude(graph, bondLength) {
    const positions = collectPositions(graph);
    const dist = graph.getDistanceMatrix();
    let gradientSum = 0;

    for (let i = 0; i < dist.length; i++) {
        let gradX = 0;
        let gradY = 0;
        for (let j = 0; j < dist.length; j++) {
            if (i === j) {
                continue;
            }
            const dij = dist[i][j];
            if (!Number.isFinite(dij) || dij === 0) {
                continue;
            }
            const desired = bondLength * dij;
            const dx = positions[i].x - positions[j].x;
            const dy = positions[i].y - positions[j].y;
            const actual = Math.hypot(dx, dy);
            if (actual === 0) {
                continue;
            }
            const strength = bondLength * Math.pow(dij, -2.0);
            const factor = strength * (1 - desired / actual);
            gradX += factor * dx;
            gradY += factor * dy;
        }
        gradientSum += gradX * gradX + gradY * gradY;
    }

    return Math.sqrt(gradientSum);
}

/** SMILES helpers used by properties */
const chainSmiles = (length) => 'C'.repeat(length);
const ringSmiles = (length) => (length === 3 ? 'C1CC1' : 'C1' + 'C'.repeat(length - 2) + 'C1');

// --- property suites ----------------------------------------------------

describe('Kamada-Kawai property-based invariants', () => {
    it('ensures longer chains occupy more space on average', () => {
        const property = fc.property(
            fc.integer({ min: 2, max: 6 }),
            fc.integer({ min: 7, max: 12 }),
            (shortLen, longLen) => {
                assert.ok(shortLen < longLen);

                const short = prepareMolecule(chainSmiles(shortLen));
                const long = prepareMolecule(chainSmiles(longLen));

                const shortPositions = collectPositions(short.graph);
                const longPositions = collectPositions(long.graph);
                ensureFinite(shortPositions, 'short chain');
                ensureFinite(longPositions, 'long chain');

                const shortSize = computeBoundingSize(shortPositions);
                const longSize = computeBoundingSize(longPositions);

                // allow some slack because layout can rotate the chain
                return longSize >= shortSize * 0.8;
            }
        );

        fc.assert(property, { numRuns: 25 });
    });

    it('keeps ring radii uniform regardless of size', () => {
        const property = fc.property(fc.integer({ min: 3, max: 12 }), (ringSize) => {
            const { graph } = prepareMolecule(ringSmiles(ringSize));
            const centred = centrePoints(collectPositions(graph));
            ensureFinite(centred, 'ring');
            const deviation = maxDeviation(computeRadii(centred));
            return deviation < Math.max(1.5, ringSize * 0.3);
        });

        fc.assert(property, { numRuns: 30 });
    });

    it('keeps spring energy bounded for randomly sized rings', () => {
        const property = fc.property(fc.integer({ min: 3, max: 12 }), (ringSize) => {
            const { graph, bondLength } = prepareMolecule(ringSmiles(ringSize));
            const avgEnergy = computeSpringEnergyAverage(graph, bondLength);
            return Number.isFinite(avgEnergy) && avgEnergy < 1800;
        });

        fc.assert(property, { numRuns: 30 });
    });

    it('keeps bond lengths close to target bond length for random chains', () => {
        const property = fc.property(fc.integer({ min: 2, max: 12 }), (len) => {
            const { graph, bondLength } = prepareMolecule(chainSmiles(len));
            const edgeLengths = computeEdgeLengths(graph);
            const maxDeviation = Math.max(...edgeLengths.map(length => Math.abs(length - bondLength)));
            return Number.isFinite(maxDeviation) && maxDeviation < bondLength * 0.4;
        });

        fc.assert(property, { numRuns: 30 });
    });
});

function computeGradientMagnitude(graph, bondLength) {
    const dist = graph.getDistanceMatrix();
    const positions = collectPositions(graph);
    let gradX = new Array(dist.length).fill(0);
    let gradY = new Array(dist.length).fill(0);

    for (let i = 0; i < dist.length; i++) {
        for (let j = 0; j < dist.length; j++) {
            if (i === j) continue;
            const dij = dist[i][j];
            if (!Number.isFinite(dij) || dij === 0) {
                continue;
            }
            const desired = bondLength * dij;
            const dx = positions[i].x - positions[j].x;
            const dy = positions[i].y - positions[j].y;
            const actual = Math.hypot(dx, dy);
            if (actual === 0) {
                continue;
            }
            const strength = bondLength * Math.pow(dij, -2.0);
            const factor = strength * (1 - desired / actual);
            gradX[i] += factor * dx;
            gradY[i] += factor * dy;
        }
    }

    let sum = 0;
    for (let i = 0; i < dist.length; i++) {
        sum += gradX[i] * gradX[i] + gradY[i] * gradY[i];
    }
    return Math.sqrt(sum);
}

function getConnectedComponents(graph) {
    const adjacency = graph.getAdjacencyMatrix();
    const rawComponents = Graph.getConnectedComponents(adjacency);
    return rawComponents.map(componentSet => Array.from(componentSet));
}

function componentPairwiseDistances(graph, component) {
    const positions = collectPositions(graph);
    const distances = [];
    for (let i = 0; i < component.length; i++) {
        for (let j = i + 1; j < component.length; j++) {
            const a = positions[component[i]];
            const b = positions[component[j]];
            distances.push(Math.hypot(a.x - b.x, a.y - b.y));
        }
    }
    return distances.sort((a, b) => a - b);
}

function centroid(points) {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
}

function sortComponentDistanceSets(components) {
    return components
        .map(distances => distances.slice())
        .sort((a, b) => {
            if (a.length !== b.length) {
                return a.length - b.length;
            }
            for (let i = 0; i < a.length; i++) {
                const diff = a[i] - b[i];
                if (Math.abs(diff) > 1e-6) {
                    return diff < 0 ? -1 : 1;
                }
            }
            return 0;
        });
}

function listsApproximatelyEqual(a, b, tolerance = 1e-3) {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i] - b[i]) > tolerance) {
            return false;
        }
    }
    return true;
}

describe('Kamada-Kawai isomorphism and component invariants', () => {
    it('keeps component layouts congruent regardless of component order', () => {
        const property = fc.property(
            fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 2, maxLength: 4 }).chain(base =>
                fc.tuple(fc.constant(base), fc.shuffledSubarray(base, { minLength: base.length, maxLength: base.length }))
            ),
            ([baseOrder, shuffled]) => {
                const baseSmiles = baseOrder.map(chainSmiles).join('.');
                const shuffledSmiles = shuffled.map(chainSmiles).join('.');

                const base = prepareMolecule(baseSmiles);
                const permuted = prepareMolecule(shuffledSmiles);

                const baseComponents = sortComponentDistanceSets(getConnectedComponents(base.graph).map(comp => componentPairwiseDistances(base.graph, comp)));
                const permutedComponents = sortComponentDistanceSets(getConnectedComponents(permuted.graph).map(comp => componentPairwiseDistances(permuted.graph, comp)));

                if (baseComponents.length !== permutedComponents.length) {
                    return false;
                }

                for (let i = 0; i < baseComponents.length; i++) {
                    if (!listsApproximatelyEqual(baseComponents[i], permutedComponents[i])) {
                        return false;
                    }
                }

                return true;
            }
        );

        fc.assert(property, { numRuns: 20 });
    });

    it('keeps disconnected components separated in space', () => {
        const property = fc.property(
            fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 2, maxLength: 4 }),
            (components) => {
                const smiles = components.map(chainSmiles).join('.');
                const { graph } = prepareMolecule(smiles);
                const allPositions = collectPositions(graph);
                const comps = getConnectedComponents(graph);
                const centroids = comps.map(componentIndices => centroid(componentIndices.map(index => allPositions[index])));

                for (let i = 0; i < centroids.length; i++) {
                    for (let j = i + 1; j < centroids.length; j++) {
                        const distance = Math.hypot(centroids[i].x - centroids[j].x, centroids[i].y - centroids[j].y);
                        if (!(distance > 5)) {
                            return false;
                        }
                    }
                }
                return true;
            }
        );

        fc.assert(property, { numRuns: 20 });
    });
});

describe('Kamada-Kawai robustness properties', () => {
    it('converges to similar energy regardless of rotation perturbation', () => {
        const property = fc.property(
            fc.integer({ min: 3, max: 10 }),
            fc.double({ min: -Math.PI, max: Math.PI }),
            (ringSize, angle) => {
                const smiles = ringSmiles(ringSize);
                const parseTree = Parser.parse(smiles, {});

                const baseline = new MolecularPreprocessor({});
                baseline.initDraw(parseTree, 'light', false, []);
                baseline.processGraph();
                const baseEnergy = computeSpringEnergyAverage(baseline.graph, baseline.opts.bondLength);

                const rotated = new MolecularPreprocessor({});
                rotated.initDraw(parseTree, 'light', false, []);
                rotated.processGraph();

                const centred = centrePoints(collectPositions(rotated.graph));
                const rotatedPoints = centred.map(p => ({
                    x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
                    y: p.x * Math.sin(angle) + p.y * Math.cos(angle)
                }));

                rotatedPoints.forEach((pos, idx) => {
                    const vertex = rotated.graph.vertices[idx];
                    vertex.position.x = pos.x;
                    vertex.position.y = pos.y;
                    vertex.positioned = true;
                });

                rotated.processGraph();
                const rotatedEnergy = computeSpringEnergyAverage(rotated.graph, rotated.opts.bondLength);

                return Number.isFinite(baseEnergy) && Number.isFinite(rotatedEnergy) && Math.abs(baseEnergy - rotatedEnergy) < 100;
            }
        );

        fc.assert(property, { numRuns: 20 });
    });

    it('gradient magnitude remains small on random molecules', () => {
        const smilesArb = fc.oneof(
            fc.integer({ min: 3, max: 10 }).map(ringSmiles),
            fc.integer({ min: 2, max: 8 }).map(chainSmiles)
        );

        const property = fc.property(smilesArb, (smiles) => {
            const { graph, bondLength } = prepareMolecule(smiles);
            const gradMagnitude = computeGradientMagnitude(graph, bondLength);
            return Number.isFinite(gradMagnitude) && gradMagnitude < bondLength * 50;
        });

        fc.assert(property, { numRuns: 25 });
    });

    it('layouts remain congruent after translation and rotation', () => {
        const property = fc.property(
            fc.integer({ min: 3, max: 10 }),
            fc.double({ min: -Math.PI, max: Math.PI }),
            fc.double({ min: -20, max: 20 }),
            fc.double({ min: -20, max: 20 }),
            (ringSize, angle, dx, dy) => {
                const smiles = ringSmiles(ringSize);
                const parseTree = Parser.parse(smiles, {});

                const baseline = new MolecularPreprocessor({});
                baseline.initDraw(parseTree, 'light', false, []);
                baseline.processGraph();
                const baselineDistances = pairwiseSortedDistances(centrePoints(collectPositions(baseline.graph)));

                const transformed = new MolecularPreprocessor({});
                transformed.initDraw(parseTree, 'light', false, []);
                transformed.processGraph();
                const centred = centrePoints(collectPositions(transformed.graph));
                const rotatedPoints = centred.map(p => ({
                    x: p.x * Math.cos(angle) - p.y * Math.sin(angle),
                    y: p.x * Math.sin(angle) + p.y * Math.cos(angle)
                }));
                const translated = rotatedPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));

                translated.forEach((pos, idx) => {
                    const vertex = transformed.graph.vertices[idx];
                    vertex.position.x = pos.x;
                    vertex.position.y = pos.y;
                    vertex.positioned = true;
                });

                transformed.processGraph();
                const transformedDistances = pairwiseSortedDistances(centrePoints(collectPositions(transformed.graph)));

                return listsApproximatelyEqual(baselineDistances, transformedDistances, 1e-2);
            }
        );

        fc.assert(property, { numRuns: 20 });
    });
});
