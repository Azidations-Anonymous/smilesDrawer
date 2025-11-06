#!/usr/bin/env node

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const Parser = require('../src/parsing/Parser.js');
const MolecularPreprocessor = require('../src/preprocessing/MolecularPreprocessor.js');

const parseSmiles = (smiles) => Parser.parse(smiles, {});

describe('Atom annotations', () => {
  it('registers defaults, overrides per atom, and serializes data', () => {
    const preprocessor = new MolecularPreprocessor({});
    const tree = parseSmiles('CCO');

    preprocessor.initDraw(tree, 'light', false, []);
    preprocessor.processGraph();

    preprocessor.registerAtomAnnotation('label', 'none');

    preprocessor.graph.vertices.forEach((vertex) => {
      assert.equal(preprocessor.getAtomAnnotation(vertex.id, 'label'), 'none');
    });

    preprocessor.setAtomAnnotation(0, 'label', 'start');
    preprocessor.setAtomAnnotationByAtomIndex(2, 'label', 'end');

    assert.equal(preprocessor.getAtomAnnotation(0, 'label'), 'start');
    assert.equal(preprocessor.getAtomAnnotationByAtomIndex(2, 'label'), 'end');

    const names = preprocessor.listAtomAnnotationNames();
    assert.deepEqual(names.sort(), ['label']);

    const serialized = preprocessor.getPositionData();
    const startVertex = serialized.vertices.find((v) => v.id === 0);
    assert.ok(startVertex);
    assert.equal(startVertex.value.annotations.label, 'start');

    const endVertexId = preprocessor.graph.atomIdxToVertexId[2];
    const endVertex = serialized.vertices.find((v) => v.id === endVertexId);
    assert.ok(endVertex);
    assert.equal(endVertex.value.annotations.label, 'end');
  });

  it('applies registered defaults on subsequent molecules', () => {
    const preprocessor = new MolecularPreprocessor({});
    preprocessor.registerAtomAnnotation('tag', 0);

    let tree = parseSmiles('CC');
    preprocessor.initDraw(tree, 'light', false, []);
    preprocessor.processGraph();

    preprocessor.setAtomAnnotation(0, 'tag', 5);

    tree = parseSmiles('O');
    preprocessor.initDraw(tree, 'light', false, []);
    preprocessor.processGraph();

    const serialized = preprocessor.getPositionData();
    assert.equal(serialized.vertices.length, 1);
    assert.equal(serialized.vertices[0].value.annotations.tag, 0);
  });
});
