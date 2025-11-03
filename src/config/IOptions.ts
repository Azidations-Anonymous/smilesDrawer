import { AtomVisualization } from '../types/CommonTypes';

/**
 * Color theme for rendering molecular structures
 */
interface IThemeColors {
  C: string;
  O: string;
  N: string;
  F: string;
  CL: string;
  BR: string;
  I: string;
  P: string;
  S: string;
  B: string;
  SI: string;
  H: string;
  BACKGROUND: string;
}

/**
 * Heatmap/weight visualization configuration
 */
interface IWeightOptions {
  colormap: string[] | null;
  additionalPadding: number;
  sigma: number;
  interval: number;
  opacity: number;
}

/**
 * Molecular drawing options
 */
interface IMoleculeOptions {
  // Canvas dimensions
  width: number;
  height: number;
  scale: number;
  padding: number;

  // Bond rendering
  bondThickness: number;
  bondLength: number;
  shortBondLength: number;
  bondSpacing: number;

  // Atom rendering
  atomVisualization: AtomVisualization;
  terminalCarbons: boolean;
  explicitHydrogens: boolean;

  // Stereochemistry
  isomeric: boolean;

  // Layout/algorithm options
  compactDrawing: boolean;
  overlapSensitivity: number;
  overlapResolutionIterations: number;
  experimentalSSSR: boolean;

  // Kamada-Kawai force layout parameters
  kkThreshold: number;
  kkInnerThreshold: number;
  kkMaxIteration: number;
  kkMaxInnerIteration: number;
  kkMaxEnergy: number;

  // Typography
  fontFamily: string;
  fontSizeLarge: number;
  fontSizeSmall: number;

  // Debugging
  debug: boolean;

  // Weight visualization
  weights: IWeightOptions;

  // Themes
  themes: {
    dark: IThemeColors;
    light: IThemeColors;
    oldschool: IThemeColors;
    solarized: IThemeColors;
    "solarized-dark": IThemeColors;
    matrix: IThemeColors;
    github: IThemeColors;
    carbon: IThemeColors;
    cyberpunk: IThemeColors;
    gruvbox: IThemeColors;
    "gruvbox-dark": IThemeColors;
    custom: IThemeColors;
    [themeName: string]: IThemeColors; // Allow custom themes
  };

  // Computed properties (set by OptionsManager)
  halfBondSpacing?: number;
  bondLengthSq?: number;
  halfFontSizeLarge?: number;
  quarterFontSizeLarge?: number;
  fifthFontSizeSmall?: number;
}

/**
 * Arrow configuration for reaction diagrams
 */
interface IArrowOptions {
  length: number;
  headSize: number;
  thickness: number;
  margin: number;
}

/**
 * Plus sign configuration for reaction diagrams
 */
interface IPlusOptions {
  size: number;
  thickness: number;
}

/**
 * Reaction-specific weight options
 */
interface IReactionWeightOptions {
  normalize: boolean;
}

/**
 * Reaction drawing options
 */
interface IReactionOptions {
  scale: number;
  fontSize: number;
  fontFamily: string;
  spacing: number;
  plus: IPlusOptions;
  arrow: IArrowOptions;
  weights: IReactionWeightOptions;
}

/**
 * Attached pseudo element information for rendering
 */
interface IAttachedPseudoElement {
  element: string;
  count: number;
  hydrogenCount: number;
  previousElement: string;
  charge: number;
}

type AttachedPseudoElements = Record<string, IAttachedPseudoElement>;

export {
  IThemeColors,
  IWeightOptions,
  IMoleculeOptions,
  IArrowOptions,
  IPlusOptions,
  IReactionWeightOptions,
  IReactionOptions,
  IAttachedPseudoElement,
  AttachedPseudoElements
};
