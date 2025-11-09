/**
 * Common union literal types for improved type safety
 */

/**
 * Bond types in SMILES notation
 */
export type BondType =
  | '-'   // Single bond
  | '='   // Double bond
  | '#'   // Triple bond
  | '$'   // Quadruple bond
  | '.'   // Disconnected/zero bond
  | '/'   // Stereochemistry up
  | '\\'; // Stereochemistry down

/**
 * Directional bond markers used to encode cis/trans intent in SMILES.
 */
export type DirectionalBond = '/' | '\\';

/**
 * Wedge type for stereochemical bonds
 */
export type WedgeType = 'up' | 'down' | null;

/**
 * Atom visualization mode
 */
export type AtomVisualization = 'default' | 'balls' | 'allballs';

/**
 * SMILES chirality notation (used in bracket atoms)
 */
export type SmilesChirality = '@' | '@@' | null;

/**
 * CIP chirality designation (R/S nomenclature)
 */
export type Chirality = 'R' | 'S' | null;

/**
 * Text rendering direction for atom labels
 */
export type TextDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Hydrogen direction for stereochemistry
 */
export type HydrogenDirection = 'up' | 'down' | 'left' | 'right' | null;

/**
 * Stereochemical plane position (-1 back, 0 middle, 1 front)
 */
export type PlanePosition = -1 | 0 | 1;

/**
 * Cis/trans relationship between substituents around a stereobond.
 */
export type CisTransOrientation = 'cis' | 'trans';
