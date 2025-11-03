/**
 * Atom highlighting configuration: [atomClass, color]
 */
export type AtomHighlight = [number, string];

/**
 * Result of chooseSide calculation for bond placement
 */
export interface SideChoice {
  totalSideCount: number[];
  totalPosition: number;
  sideCount: number[];
  position: number;
  anCount: number;
  bnCount: number;
}

/**
 * Individual vertex overlap score entry
 */
export interface VertexOverlapScoreEntry {
  id: number;
  score: number;
}

/**
 * Overall overlap score result
 */
export interface OverlapScore {
  total: number;
  scores: VertexOverlapScoreEntry[];
  vertexScores: Float32Array;
}

/**
 * Subtree overlap score with center of mass
 */
export interface SubtreeOverlapScore {
  value: number;
  center: Vector2;
}

/**
 * Serialized bracket notation data
 */
export interface SerializedBracket {
  hcount: number;
  charge: number;
  isotope: number;
  class: number | null;
}

/**
 * Serialized atom/vertex value data
 */
export interface SerializedAtomValue {
  idx: number | null;
  element: string;
  drawExplicit: boolean;
  isDrawn: boolean;
  bondType: string | null;
  branchBond: string | null;
  ringbonds: any[];
  rings: number[];
  bondCount: number;
  class: number | null;
  neighbouringElements: string[];

  // Ring membership
  isBridge: boolean;
  isBridgeNode: boolean;
  bridgedRing: number | null;
  originalRings: number[];
  anchoredRings: number[];
  isConnectedToRing: boolean;
  isPartOfAromaticRing: boolean;

  // Bracket notation
  bracket: SerializedBracket | null;

  // Stereochemistry
  plane: number;
  chirality: string;
  isStereoCenter: boolean;
  priority: number;
  mainChain: boolean;
  hydrogenDirection: string;
  hasHydrogen: boolean;
  subtreeDepth: number;

  // Pseudo elements
  attachedPseudoElements: Record<string, any>;
  hasAttachedPseudoElements: boolean;
}

/**
 * Serialized vertex data
 */
export interface SerializedVertex {
  // Vertex topology
  id: number;
  parentVertexId: number | null;
  children: number[];
  spanningTreeChildren: number[];
  edges: number[];
  neighbours: number[];
  neighbourCount: number;

  // Positioning data
  position: { x: number; y: number };
  previousPosition: { x: number; y: number };
  positioned: boolean;
  forcePositioned: boolean;
  angle: number;
  dir: number;

  // Atom data
  value: SerializedAtomValue | null;
}

/**
 * Serialized edge data
 */
export interface SerializedEdge {
  id: number;
  sourceId: number;
  targetId: number;
  weight: number;
  bondType: string;
  isPartOfAromaticRing: boolean;
  center: boolean;
  wedge: string | null;
}

/**
 * Serialized ring data
 */
export interface SerializedRing {
  id: number;
  members: number[];
  isBridged: boolean;
  isPartOfBridged: boolean;
  isFused: boolean;
  isSpiro: boolean;
  neighbours: number[];
  center: { x: number; y: number } | null;
}

/**
 * Serialized position data for rendering
 */
export interface PositionData {
  version: number;
  vertices: SerializedVertex[];
  edges: SerializedEdge[];
  rings: SerializedRing[];
  metadata: {
    vertexCount: number;
    edgeCount: number;
    ringCount: number;
    atomIdxToVertexId?: number[];
    isomeric: boolean;
  };
}

import Vector2 = require('../graph/Vector2');
