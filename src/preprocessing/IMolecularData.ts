import Graph = require('../graph/Graph');
import Ring = require('../graph/Ring');
import RingConnection = require('../graph/RingConnection');
import Vertex = require('../graph/Vertex');
import Edge = require('../graph/Edge');
import Vector2 = require('../graph/Vector2');
import { IMoleculeOptions } from '../config/IOptions';
import { AtomHighlight, SideChoice, PositionData } from './MolecularDataTypes';
import { BondType } from '../types/CommonTypes';

type ParseTree = any;

interface IMolecularData {
  graph: Graph;
  rings: Ring[];
  ringConnections: RingConnection[];
  opts: IMoleculeOptions;
  bridgedRing: boolean;
  highlight_atoms: AtomHighlight[];

  isRingAromatic(ring: Ring): boolean;
  getEdgeNormals(edge: Edge): Vector2[];
  getRingbondType(vertexA: Vertex, vertexB: Vertex): BondType | null;
  areVerticesInSameRing(vertexA: Vertex, vertexB: Vertex): boolean;
  chooseSide(vertexA: Vertex, vertexB: Vertex, sides: Vector2[]): SideChoice;
  getLargestOrAromaticCommonRing(vertexA: Vertex, vertexB: Vertex): Ring | null;
  initDraw(data: ParseTree, themeName: string, infoOnly: boolean, highlight_atoms: AtomHighlight[]): void;
  processGraph(): void;
  getTotalOverlapScore(): number;
  getMolecularFormula(data: ParseTree | Graph | null): string;
  registerAtomAnnotation(name: string, defaultValue?: unknown): void;
  setAtomAnnotation(vertexId: number, name: string, value: unknown): void;
  getAtomAnnotation(vertexId: number, name: string): unknown;
  setAtomAnnotationByAtomIndex(atomIdx: number, name: string, value: unknown): void;
  getAtomAnnotationByAtomIndex(atomIdx: number, name: string): unknown;
  listAtomAnnotationNames(): string[];
  getAtomAnnotations(vertexId: number): Record<string, unknown>;
  getPositionData(): PositionData;
}

export = IMolecularData;
