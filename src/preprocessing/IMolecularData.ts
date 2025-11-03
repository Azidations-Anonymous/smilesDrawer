import Graph = require('../graph/Graph');
import Ring = require('../graph/Ring');
import RingConnection = require('../graph/RingConnection');
import Vertex = require('../graph/Vertex');
import Edge = require('../graph/Edge');
import Vector2 = require('../graph/Vector2');
import { IMoleculeOptions } from '../config/IOptions';
import { AtomHighlight, SideChoice } from './MolecularDataTypes';

interface IMolecularData {
  graph: Graph;
  rings: Ring[];
  ringConnections: RingConnection[];
  opts: IMoleculeOptions;
  bridgedRing: boolean;
  highlight_atoms: AtomHighlight[];

  isRingAromatic(ring: Ring): boolean;
  getEdgeNormals(edge: Edge): Vector2[];
  getRingbondType(vertexA: Vertex, vertexB: Vertex): string | null;
  areVerticesInSameRing(vertexA: Vertex, vertexB: Vertex): boolean;
  chooseSide(vertexA: Vertex, vertexB: Vertex, sides: Vector2[]): SideChoice;
  getLargestOrAromaticCommonRing(vertexA: Vertex, vertexB: Vertex): Ring | null;
  initDraw(data: any, themeName: string, infoOnly: boolean, highlight_atoms: AtomHighlight[]): void;
  processGraph(): void;
  getTotalOverlapScore(): number;
  getMolecularFormula(data: any): string;
  getPositionData(): any;
}

export = IMolecularData;
