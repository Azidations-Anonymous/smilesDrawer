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
  | '.'   // Disconnected/zero bond
  | '/'   // Stereochemistry up
  | '\\'; // Stereochemistry down

/**
 * Wedge type for stereochemical bonds
 */
export type WedgeType = 'up' | 'down' | '';

/**
 * Atom visualization mode
 */
export type AtomVisualization = 'default' | 'balls' | 'allballs';

/**
 * SMILES chirality notation (used in bracket atoms)
 */
export type SmilesChirality = '@' | '@@' | '';

/**
 * CIP chirality designation (R/S nomenclature)
 */
export type Chirality = 'R' | 'S' | '';

/**
 * Hydrogen direction for stereochemistry
 */
export type HydrogenDirection = 'up' | 'down' | 'left' | 'right' | '';
