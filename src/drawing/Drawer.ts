import SvgDrawer = require('./SvgDrawer');
import IMolecularData = require('../preprocessing/IMolecularData');
import { AtomHighlight } from '../preprocessing/MolecularDataTypes';
import { IMoleculeOptions } from '../config/IOptions';

type ParseTree = any;

/**
 * The main class of the application representing the smiles drawer
 *
 * @property {Graph} graph The graph associated with this SmilesDrawer.Drawer instance.
 * @property {Number} ringIdCounter An internal counter to keep track of ring ids.
 * @property {Number} ringConnectionIdCounter An internal counter to keep track of ring connection ids.
 * @property {CanvasDrawer} canvasDrawer The CanvasDrawer associated with this SmilesDrawer.Drawer instance.
 * @property {Number} totalOverlapScore The current internal total overlap score.
 * @property {Object} defaultOptions The default options.
 * @property {Object} opts The merged options.
 * @property {Object} theme The current theme.
 */
class Drawer {
  svgDrawer: SvgDrawer;

  /**
   * The constructor for the class SmilesDrawer.
   *
   * @param {Object} options An object containing custom values for different options. It is merged with the default options.
   */
  constructor(options: Partial<IMoleculeOptions>) {
    this.svgDrawer = new SvgDrawer(options);
  }

  /**
   * Draws the parsed smiles data to a canvas element.
   *
   * @param {Object} data The tree returned by the smiles parser.
   * @param {(String|HTMLCanvasElement)} target The id of the HTML canvas element the structure is drawn to - or the element itself.
   * @param {String} themeName='dark' The name of the theme to use. Built-in themes are 'light' and 'dark'.
   * @param {Boolean} infoOnly=false Only output info on the molecule without drawing anything to the canvas.
   */
  draw(data: ParseTree, target: string | HTMLCanvasElement, themeName: string = 'light', infoOnly: boolean = false, highlight_atoms: AtomHighlight[] = []): void {
    let canvas = null;
    if (typeof target === 'string') {
      canvas = document.getElementById(target);
    } else {
      canvas = target;
    }

    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    svg.setAttributeNS(null, 'viewBox', '0 0 ' + this.svgDrawer.opts.width + ' ' + this.svgDrawer.opts.height);
    svg.setAttributeNS(null, 'width', this.svgDrawer.opts.width + '');
    svg.setAttributeNS(null, 'height', this.svgDrawer.opts.height + '');
    this.svgDrawer.draw(data, svg, themeName, null, infoOnly, highlight_atoms);
    if (this.svgDrawer.svgWrapper && this.svgDrawer.svgWrapper.toCanvas) {
      this.svgDrawer.svgWrapper.toCanvas(canvas, this.svgDrawer.opts.width, this.svgDrawer.opts.height);
    }
  }

  /**
   * Returns the total overlap score of the current molecule.
   *
   * @returns {Number} The overlap score.
   */
  getTotalOverlapScore(): number {
    return this.svgDrawer.getTotalOverlapScore();
  }

  /**
   * Returns the molecular formula of the loaded molecule as a string.
   *
   * @returns {String} The molecular formula.
   */
  getMolecularFormula(): string {
    return this.svgDrawer.getMolecularFormula();
  }

  registerAtomAnnotation(name: string, defaultValue: unknown = null): void {
    this.svgDrawer.registerAtomAnnotation(name, defaultValue);
  }

  setAtomAnnotation(vertexId: number, name: string, value: unknown): void {
    this.svgDrawer.setAtomAnnotation(vertexId, name, value);
  }

  setAtomAnnotationByAtomIndex(atomIdx: number, name: string, value: unknown): void {
    this.svgDrawer.setAtomAnnotationByAtomIndex(atomIdx, name, value);
  }

  getAtomAnnotation(vertexId: number, name: string): unknown {
    return this.svgDrawer.getAtomAnnotation(vertexId, name);
  }

  getAtomAnnotationByAtomIndex(atomIdx: number, name: string): unknown {
    return this.svgDrawer.getAtomAnnotationByAtomIndex(atomIdx, name);
  }

  listAtomAnnotationNames(): string[] {
    return this.svgDrawer.listAtomAnnotationNames();
  }

  getAtomAnnotations(vertexId: number): Record<string, unknown> {
    return this.svgDrawer.getAtomAnnotations(vertexId);
  }

  /**
   * Returns complete positioning and structural data for the loaded molecule.
   * This data includes everything needed to implement custom rendering algorithms:
   * vertices (atoms) with positions and angles, edges (bonds) with types and stereochemistry,
   * and ring information.
   *
   * The returned object implements IMolecularData interface, providing access to both
   * the raw data and helper methods used by the internal renderer (getEdgeNormals,
   * isRingAromatic, areVerticesInSameRing, etc.).
   *
   * @returns {IMolecularData} An object implementing the molecular data interface.
   *
   * @example
   * const drawer = new SmilesDrawer.Drawer();
   * SmilesDrawer.parse('c1ccccc1', function(tree) {
   *     drawer.draw(tree, 'output-canvas', 'light');
   *     const molData = drawer.getPositionData();
   *     console.log(molData.graph.vertices); // Array of positioned atoms
   *     console.log(molData.graph.edges);    // Array of bonds
   *     const normals = molData.getEdgeNormals(edge); // Use helper methods
   * });
   */
  getPositionData(): IMolecularData {
    return this.svgDrawer.getPositionData();
  }
}

export = Drawer;
