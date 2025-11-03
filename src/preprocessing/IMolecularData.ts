interface IMolecularData {
  graph: any;
  rings: any;
  ringConnections: any;
  opts: any;
  bridgedRing: boolean;
  highlight_atoms: any;

  isRingAromatic(ring: any): boolean;
  getEdgeNormals(edge: any): any[];
  getRingbondType(vertexA: any, vertexB: any): string | null;
  areVerticesInSameRing(vertexA: any, vertexB: any): boolean;
  chooseSide(vertexA: any, vertexB: any, sides: any[] | Record<string, any>): any;
  getLargestOrAromaticCommonRing(vertexA: any, vertexB: any): any;
  initDraw(data: any, themeName: string, infoOnly: boolean, highlight_atoms: any): void;
  processGraph(): void;
  getTotalOverlapScore(): number;
  getMolecularFormula(data: any): string;
  getPositionData(): any;
}

export = IMolecularData;
