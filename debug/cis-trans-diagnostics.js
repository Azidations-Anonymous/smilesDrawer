#!/usr/bin/env node

/**
 * Collect cis/trans diagnostics from a MolecularPreprocessor instance.
 */

function cloneOrientationMap(map) {
    const result = {};
    if (!map) {
        return result;
    }
    for (const [key, nested] of Object.entries(map)) {
        const numericKey = Number(key);
        result[numericKey] = { ...nested };
    }
    return result;
}

function collectCisTransDiagnostics(preprocessor) {
    if (!preprocessor || !preprocessor.graph || !preprocessor.cisTransManager) {
        return [];
    }

    const getSequenceId = typeof preprocessor.cisTransManager.getSequenceId === 'function'
        ? (edgeId) => preprocessor.cisTransManager.getSequenceId(edgeId)
        : () => null;

    const diagnostics = [];
    for (const edge of preprocessor.graph.edges) {
        if (!edge || edge.bondType !== '=' || !edge.cisTrans) {
            continue;
        }

        const analysis = typeof preprocessor.cisTransManager.getBondOrientationAnalysis === 'function'
            ? preprocessor.cisTransManager.getBondOrientationAnalysis(edge)
            : null;
        const orientationSource = analysis
            ? analysis.source
            : (edge.cisTransSource ?? (edge.chiralDict && Object.keys(edge.chiralDict).length > 0 ? 'chiralDict' : 'inferred'));

        diagnostics.push({
            edgeId: edge.id,
            atoms: [edge.sourceId, edge.targetId],
            chiralDict: cloneOrientationMap(edge.chiralDict),
            cisTransNeighbours: cloneOrientationMap(edge.cisTransNeighbours),
            sequenceId: getSequenceId(edge.id ?? null),
            isDrawnCorrectly: analysis ? analysis.isCorrect : null,
            orientationSource,
            evaluations: analysis ? analysis.evaluations.map((entry) => ({
                leftAtomId: entry.leftAtomId,
                rightAtomId: entry.rightAtomId,
                expected: entry.expected,
                actual: entry.actual
            })) : []
        });
    }

    return diagnostics;
}

module.exports = {
    collectCisTransDiagnostics,
};
