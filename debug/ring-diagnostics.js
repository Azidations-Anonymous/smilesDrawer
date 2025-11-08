#!/usr/bin/env node

/**
 * @file Helpers for collecting ring diagnostics from a MolecularPreprocessor.
 */
const SSSR = require('../src/algorithms/SSSR.js');

function toArray(value) {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value.slice() : Array.from(value);
}

function toPoint(vector) {
    if (!vector || typeof vector.x !== 'number' || typeof vector.y !== 'number') {
        return null;
    }
    return { x: vector.x, y: vector.y };
}

function serializeRing(ringManager, ring) {
    if (!ring) {
        return null;
    }

    const data = {
        id: ring.id,
        size: ring.members.length,
        members: toArray(ring.members),
        neighbours: toArray(ring.neighbours),
        isBridged: !!ring.isBridged,
        isPartOfBridged: !!ring.isPartOfBridged,
        isSpiro: !!ring.isSpiro,
        isFused: !!ring.isFused,
        canFlip: !!ring.canFlip,
        positioned: !!ring.positioned,
        center: toPoint(ring.center),
        aromatic: null,
    };

    if (ringManager && typeof ringManager.isRingAromatic === 'function') {
        try {
            data.aromatic = ringManager.isRingAromatic(ring);
        } catch {
            data.aromatic = null;
        }
    }

    if (Array.isArray(ring.rings) && ring.rings.length > 0) {
        data.subrings = ring.rings.map((sub) => ({
            id: sub.id,
            size: sub.members.length,
            members: toArray(sub.members),
        }));
    }

    return data;
}

function serializeRingConnection(connection) {
    if (!connection) {
        return null;
    }

    return {
        id: connection.id,
        firstRingId: connection.firstRingId,
        secondRingId: connection.secondRingId,
        vertices: toArray(connection.vertices),
    };
}

function serializeAromaticRing(ring) {
    if (!ring) {
        return null;
    }
    return {
        id: ring.id,
        members: toArray(ring.members),
        center: toPoint(ring.center),
        neighbours: toArray(ring.neighbouring_rings || ring.neighbours || []),
    };
}

function collectRingDiagnostics(preprocessor) {
    if (!preprocessor || !preprocessor.graph) {
        return null;
    }

    const graph = preprocessor.graph;
    const ringManager = preprocessor.ringManager || preprocessor['ringManager'] || null;
    const sssr = SSSR.getRings(graph) || [];
    const aromaticRings = ringManager && typeof ringManager.getAromaticRings === 'function'
        ? ringManager.getAromaticRings()
        : [];

    return {
        version: 1,
        ringCount: typeof preprocessor.getRingCount === 'function'
            ? preprocessor.getRingCount()
            : (ringManager && Array.isArray(ringManager.rings) ? ringManager.rings.length : 0),
        originalRingCount: ringManager && Array.isArray(ringManager.originalRings)
            ? ringManager.originalRings.length
            : 0,
        hasBridgedRing: typeof preprocessor.hasBridgedRing === 'function' ? preprocessor.hasBridgedRing() : false,
        sssr: sssr.map((ring) => ring.slice()),
        cycleInventory: Array.isArray(graph.cycles) ? graph.cycles.map((cycle) => cycle.slice()) : [],
        ringManager: ringManager ? {
            rings: toArray(ringManager.rings).map((ring) => serializeRing(ringManager, ring)),
            originalRings: toArray(ringManager.originalRings).map((ring) => serializeRing(ringManager, ring)),
            ringConnections: toArray(ringManager.ringConnections).map(serializeRingConnection).filter(Boolean),
            originalRingConnections: toArray(ringManager.originalRingConnections).map(serializeRingConnection).filter(Boolean),
        } : null,
        aromaticRings: aromaticRings.map(serializeAromaticRing).filter(Boolean),
    };
}

module.exports = {
    collectRingDiagnostics,
};
