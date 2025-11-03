import IMolecularData = require('./IMolecularData');
import Vertex = require('../graph/Vertex');
import Vector2 = require('../graph/Vector2');
import { SideChoice } from './MolecularDataTypes';

class MolecularDataSnapshot implements IMolecularData {
  private source: IMolecularData;
  private serializedData: any;

  constructor(source: IMolecularData) {
    this.source = source;
    this.serializedData = source.getPositionData();
  }

  get graph(): any {
    return this.source.graph;
  }

  get rings(): any {
    return this.source.rings;
  }

  get ringConnections(): any {
    return this.source.ringConnections;
  }

  get opts(): any {
    return this.source.opts;
  }

  get bridgedRing(): boolean {
    return this.source.bridgedRing;
  }

  get highlight_atoms(): any {
    return this.source.highlight_atoms;
  }

  isRingAromatic(ring: any): boolean {
    return this.source.isRingAromatic(ring);
  }

  getEdgeNormals(edge: any): any[] {
    return this.source.getEdgeNormals(edge);
  }

  getRingbondType(vertexA: any, vertexB: any): string | null {
    return this.source.getRingbondType(vertexA, vertexB);
  }

  areVerticesInSameRing(vertexA: any, vertexB: any): boolean {
    return this.source.areVerticesInSameRing(vertexA, vertexB);
  }

  chooseSide(vertexA: Vertex, vertexB: Vertex, sides: Vector2[]): SideChoice {
    return this.source.chooseSide(vertexA, vertexB, sides);
  }

  getLargestOrAromaticCommonRing(vertexA: any, vertexB: any): any {
    return this.source.getLargestOrAromaticCommonRing(vertexA, vertexB);
  }

  initDraw(data: any, themeName: string, infoOnly: boolean, highlight_atoms: any): void {
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
