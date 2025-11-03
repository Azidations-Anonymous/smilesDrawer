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
