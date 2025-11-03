// we use the drawer to do all the preprocessing. then we take over the drawing
// portion to output to svg
import ArrayHelper = require('../utils/ArrayHelper');
import Atom = require('../graph/Atom');
import MolecularPreprocessor = require('../preprocessing/MolecularPreprocessor');
import Graph = require('../graph/Graph');
import Line = require('../graph/Line');
import SvgWrapper = require('./SvgWrapper');
import ThemeManager = require('../config/ThemeManager');
import Vector2 = require('../graph/Vector2');
import GaussDrawer = require('./GaussDrawer');
import SvgEdgeDrawer = require('./draw/SvgEdgeDrawer');
import SvgVertexDrawer = require('./draw/SvgVertexDrawer');
import SvgWeightsDrawer = require('./draw/SvgWeightsDrawer');

class SvgDrawer {
  preprocessor: any;
  opts: any;
  clear: boolean;
  svgWrapper: any;
  themeManager: any;
  bridgedRing: boolean;
    private edgeDrawer: SvgEdgeDrawer;
    private vertexDrawer: SvgVertexDrawer;
    private weightsDrawer: SvgWeightsDrawer;

  constructor(options: any, clear: boolean = true) {
      this.preprocessor = new MolecularPreprocessor(options);
      this.opts = this.preprocessor.opts;
      this.clear = clear;
      this.svgWrapper = null;
      this.edgeDrawer = new SvgEdgeDrawer(this);
        this.vertexDrawer = new SvgVertexDrawer(this);
          this.weightsDrawer = new SvgWeightsDrawer(this);
  }

  /**
   * Draws the parsed smiles data to an svg element.
   *
   * @param {Object} data The tree returned by the smiles parser.
   * @param {?(String|SVGElement)} target The id of the HTML svg element the structure is drawn to - or the element itself.
   * @param {String} themeName='dark' The name of the theme to use. Built-in themes are 'light' and 'dark'.
   * @param {Boolean} infoOnly=false Only output info on the molecule without drawing anything to the canvas.
   *
   * @returns {SVGElement} The svg element
   */
  draw(data: any, target: string | SVGElement | null, themeName: string = 'light', weights: any = null, infoOnly: boolean = false, highlight_atoms: any[] = [], weightsNormalized: boolean = false): SVGElement {
    if (target === null || target === 'svg') {
      target = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      target.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      target.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      target.setAttributeNS(null, 'width', this.opts.width.toString());
      target.setAttributeNS(null, 'height', this.opts.height.toString());
    } else if (typeof target === 'string') {
      target = document.getElementById(target) as unknown as SVGElement;
    }

    let optionBackup = {
      padding: this.opts.padding,
      compactDrawing: this.opts.compactDrawing
    };

    // Overwrite options when weights are added
    if (weights !== null) {
      this.opts.padding += this.opts.weights.additionalPadding;
      this.opts.compactDrawing = false;
    }

    let preprocessor = this.preprocessor;

    preprocessor.initDraw(data, themeName, infoOnly, highlight_atoms);

    if (!infoOnly) {
      this.themeManager = new ThemeManager(this.opts.themes, themeName);
      if (this.svgWrapper === null || this.clear) {
        this.svgWrapper = new SvgWrapper(this.themeManager, target, this.opts, this.clear);
      }
    }

    preprocessor.processGraph();

    // Set the canvas to the appropriate size
    this.svgWrapper.determineDimensions(preprocessor.graph.vertices);

    // Do the actual drawing
    this.drawAtomHighlights(preprocessor.opts.debug);
    this.drawEdges(preprocessor.opts.debug);
    this.drawVertices(preprocessor.opts.debug);

    if (weights !== null) {
      this.drawWeights(weights, weightsNormalized);
    }

    if (preprocessor.opts.debug) {
      console.log(preprocessor.graph);
      console.log(preprocessor.rings);
      console.log(preprocessor.ringConnections);
    }

    this.svgWrapper.constructSvg();

    // Reset options in case weights were added.
    if (weights !== null) {
      this.opts.padding = optionBackup.padding;
      this.opts.compactDrawing = optionBackup.padding;
    }

    return target;
  }

  /**
 * Draws the parsed smiles data to a canvas element.
 *
 * @param {Object} data The tree returned by the smiles parser.
 * @param {(String|HTMLCanvasElement)} target The id of the HTML canvas element the structure is drawn to - or the element itself.
 * @param {String} themeName='dark' The name of the theme to use. Built-in themes are 'light' and 'dark'.
 * @param {Boolean} infoOnly=false Only output info on the molecule without drawing anything to the canvas.
 */
  drawCanvas(data: any, target: string | HTMLCanvasElement, themeName: string = 'light', infoOnly: boolean = false): string | HTMLCanvasElement {
    let canvas = null;
    if (typeof target === 'string') {
      canvas = document.getElementById(target);
    } else {
      canvas = target;
    }

    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    // 500 as a size is arbritrary, but the canvas is scaled when drawn to the canvas anyway
    svg.setAttributeNS(null, 'viewBox', '0 0 ' + 500 + ' ' + 500);
    svg.setAttributeNS(null, 'width', 500 + '');
    svg.setAttributeNS(null, 'height', 500 + '');
    svg.setAttributeNS(null, 'style', 'visibility: hidden: position: absolute; left: -1000px');
    document.body.appendChild(svg);
    this.draw(data, svg, themeName, null, infoOnly);
    this.svgWrapper.toCanvas(canvas, this.opts.width, this.opts.height);
    document.body.removeChild(svg);
    return target;
  }

  /**
   * Returns the total overlap score of the current molecule.
   *
   * @returns {Number} The overlap score.
   */
  getTotalOverlapScore(): number {
    return this.preprocessor.getTotalOverlapScore();
  }

  /**
   * Returns the molecular formula of the loaded molecule as a string.
   *
   * @returns {String} The molecular formula.
   */
  getMolecularFormula(graph: any = null): string {
    return this.preprocessor.getMolecularFormula(graph);
  }

  /**
   * Returns complete positioning and structural data for the loaded molecule.
   * This data includes everything needed to implement custom rendering algorithms:
   * vertices (atoms) with positions and angles, edges (bonds) with types and stereochemistry,
   * and ring information.
   *
   * The output format is versioned for stability. Current version: 1
   *
   * @returns {Object} An object containing versioned positioning data.
   *   See MolecularPreprocessor.getPositionData() for detailed structure.
   *
   * @example
   * const drawer = new SmilesDrawer.SvgDrawer();
   * SmilesDrawer.parse('c1ccccc1', function(tree) {
   *     drawer.draw(tree, 'output-svg', 'light');
   *     const posData = drawer.getPositionData();
   *     console.log(posData.vertices); // Array of positioned atoms
   *     console.log(posData.edges);    // Array of bonds
   * });
   */
  getPositionData(): any {
    return this.preprocessor.getPositionData();
  }

    drawAromaticityRing(ring: any): void {
        this.edgeDrawer.drawAromaticityRing(ring);
    }

    drawEdges(debug: boolean): void {
        this.edgeDrawer.drawEdges(debug);
    }

    drawEdge(edgeId: number, debug: boolean): void {
        this.edgeDrawer.drawEdge(edgeId, debug);
    }

    multiplyNormals(normals: any[], spacing: number): void {
        this.edgeDrawer.multiplyNormals(normals, spacing);
    }

    drawAtomHighlights(debug: boolean): void {
        this.vertexDrawer.drawAtomHighlights(debug);
    }

    drawVertices(debug: boolean): void {
        this.vertexDrawer.drawVertices(debug);
    }

    drawWeights(weights: number[], weightsNormalized: boolean): void {
        this.weightsDrawer.drawWeights(weights, weightsNormalized);
    }
}

export = SvgDrawer;
