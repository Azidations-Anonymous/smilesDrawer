import IMolecularData = require('./IMolecularData');

class MolecularDataSnapshot implements IMolecularData {
  graph: any;
  rings: any;
  ringConnections: any;
  opts: any;
  bridgedRing: boolean;
  highlight_atoms: any;

  private source: IMolecularData;

  constructor(source: IMolecularData) {
    this.source = source;
    this.graph = source.graph;
    this.rings = source.rings;
    this.ringConnections = source.ringConnections;
    this.opts = source.opts;
    this.bridgedRing = source.bridgedRing;
    this.highlight_atoms = source.highlight_atoms;
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

  chooseSide(vertexA: any, vertexB: any, sides: any[] | Record<string, any>): any {
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
    return this.source.getPositionData();
  }

  toJSON(): any {
    return this.source.getPositionData();
  }
}

export = MolecularDataSnapshot;
