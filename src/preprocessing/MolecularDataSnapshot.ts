import IMolecularData = require('./IMolecularData');
import Graph = require('../graph/Graph');
import Ring = require('../graph/Ring');
import RingConnection = require('../graph/RingConnection');
import Vertex = require('../graph/Vertex');
import Edge = require('../graph/Edge');
import Vector2 = require('../graph/Vector2');
import { IMoleculeOptions } from '../config/IOptions';
import { SideChoice, AtomHighlight, PositionData } from './MolecularDataTypes';
import { BondType } from '../types/CommonTypes';

type ParseTree = any;

class MolecularDataSnapshot implements IMolecularData {
  private source: IMolecularData;
  private serializedData: PositionData;

  constructor(source: IMolecularData) {
    this.source = source;
    this.serializedData = source.getPositionData();
  }

  get graph(): Graph {
    return this.source.graph;
  }

  get rings(): Ring[] {
    return this.source.rings;
  }

  get ringConnections(): RingConnection[] {
    return this.source.ringConnections;
  }

  get opts(): IMoleculeOptions {
    return this.source.opts;
  }

  get bridgedRing(): boolean {
    return this.source.bridgedRing;
  }

  get highlight_atoms(): AtomHighlight[] {
    return this.source.highlight_atoms;
  }

  isRingAromatic(ring: Ring): boolean {
    return this.source.isRingAromatic(ring);
  }

  getEdgeNormals(edge: Edge): Vector2[] {
    return this.source.getEdgeNormals(edge);
  }

  getRingbondType(vertexA: Vertex, vertexB: Vertex): BondType | null {
    return this.source.getRingbondType(vertexA, vertexB);
  }

  areVerticesInSameRing(vertexA: Vertex, vertexB: Vertex): boolean {
    return this.source.areVerticesInSameRing(vertexA, vertexB);
  }

  chooseSide(vertexA: Vertex, vertexB: Vertex, sides: Vector2[]): SideChoice {
    return this.source.chooseSide(vertexA, vertexB, sides);
  }

  getLargestOrAromaticCommonRing(vertexA: Vertex, vertexB: Vertex): Ring | null {
    return this.source.getLargestOrAromaticCommonRing(vertexA, vertexB);
  }

  initDraw(data: ParseTree, themeName: string, infoOnly: boolean, highlight_atoms: AtomHighlight[]): void {
    throw new Error('MolecularDataSnapshot is read-only. initDraw() cannot be called.');
  }

  processGraph(): void {
    throw new Error('MolecularDataSnapshot is read-only. processGraph() cannot be called.');
  }

  getTotalOverlapScore(): number {
    return this.source.getTotalOverlapScore();
  }

  getMolecularFormula(data: ParseTree | Graph | null = null): string {
    return this.source.getMolecularFormula(data);
  }

  registerAtomAnnotation(_name: string, _defaultValue: unknown = null): void {
    throw new Error('MolecularDataSnapshot is read-only. registerAtomAnnotation() cannot be called.');
  }

  setAtomAnnotation(_vertexId: number, _name: string, _value: unknown): void {
    throw new Error('MolecularDataSnapshot is read-only. setAtomAnnotation() cannot be called.');
  }

  getAtomAnnotation(vertexId: number, name: string): unknown {
    const vertex = this.getSerializedVertex(vertexId);
    if (!vertex || !vertex.value || !vertex.value.annotations) {
      return undefined;
    }
    return vertex.value.annotations[name];
  }

  setAtomAnnotationByAtomIndex(_atomIdx: number, _name: string, _value: unknown): void {
    throw new Error('MolecularDataSnapshot is read-only. setAtomAnnotationByAtomIndex() cannot be called.');
  }

  getAtomAnnotationByAtomIndex(atomIdx: number, name: string): unknown {
    const vertexId = this.getVertexIdFromAtomIndex(atomIdx);
    if (vertexId === null) {
      return undefined;
    }
    return this.getAtomAnnotation(vertexId, name);
  }

  listAtomAnnotationNames(): string[] {
    const names = new Set<string>();
    for (const vertex of this.serializedData.vertices) {
      if (vertex.value && vertex.value.annotations) {
        for (const key of Object.keys(vertex.value.annotations)) {
          names.add(key);
        }
      }
    }
    return Array.from(names.values());
  }

  getAtomAnnotations(vertexId: number): Record<string, unknown> {
    const vertex = this.getSerializedVertex(vertexId);
    if (!vertex || !vertex.value || !vertex.value.annotations) {
      return {};
    }
    return { ...vertex.value.annotations };
  }

  getPositionData(): PositionData {
    return this.serializedData;
  }

  toJSON(): PositionData {
    return this.serializedData;
  }

  private getSerializedVertex(vertexId: number) {
    return this.serializedData.vertices.find((vertex) => vertex.id === vertexId);
  }

  private getVertexIdFromAtomIndex(atomIdx: number): number | null {
    if (!this.serializedData.metadata.atomIdxToVertexId) {
      return null;
    }

    const vertexId = this.serializedData.metadata.atomIdxToVertexId[atomIdx];
    if (vertexId === undefined || vertexId === null) {
      return null;
    }

    return vertexId;
  }
}

export = MolecularDataSnapshot;
