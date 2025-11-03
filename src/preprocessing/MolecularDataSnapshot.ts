import IMolecularData = require('./IMolecularData');
import Graph = require('../graph/Graph');
import Ring = require('../graph/Ring');
import RingConnection = require('../graph/RingConnection');
import Vertex = require('../graph/Vertex');
import Edge = require('../graph/Edge');
import Vector2 = require('../graph/Vector2');
import { IMoleculeOptions } from '../config/IOptions';
import { SideChoice, AtomHighlight } from './MolecularDataTypes';

class MolecularDataSnapshot implements IMolecularData {
  private source: IMolecularData;
  private serializedData: any;

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

  getRingbondType(vertexA: Vertex, vertexB: Vertex): string | null {
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

  initDraw(data: any, themeName: string, infoOnly: boolean, highlight_atoms: AtomHighlight[]): void {
    throw new Error('MolecularDataSnapshot is read-only. initDraw() cannot be called.');
  }

  processGraph(): void {
    throw new Error('MolecularDataSnapshot is read-only. processGraph() cannot be called.');
  }

  getTotalOverlapScore(): number {
    return this.source.getTotalOverlapScore();
  }

  getMolecularFormula(data: any = null): string {
    return this.source.getMolecularFormula(data);
  }

  getPositionData(): any {
    return this.serializedData;
  }

  toJSON(): any {
    return this.serializedData;
  }
}

export = MolecularDataSnapshot;
