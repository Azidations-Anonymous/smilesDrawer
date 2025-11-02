import StereochemistryManager from "./StereochemistryManager";
import OverlapResolutionManager from "./OverlapResolutionManager";
import PositioningManager from "./PositioningManager";

import RingManager = require("./RingManager");

import MathHelper = require('./MathHelper');
import ArrayHelper = require('./ArrayHelper');
import Vector2 = require('./Vector2');
import Line = require('./Line');
import Vertex = require('./Vertex');
import Edge = require('./Edge');
import Atom = require('./Atom');
import Ring = require('./Ring');
import RingConnection = require('./RingConnection');
import CanvasWrapper = require('./CanvasWrapper');
import Graph = require('./Graph');
import SSSR = require('./SSSR');
import ThemeManager = require('./ThemeManager');
import Options = require('./Options');

/** 
 * The main class of the application representing the smiles drawer 
 * 
 * @property {Graph} graph The graph associated with this SmilesDrawer.Drawer instance.
 * @property {Number} ringIdCounter An internal counter to keep track of ring ids.
 * @property {Number} ringConnectionIdCounter An internal counter to keep track of ring connection ids.
 * @property {CanvasWrapper} canvasWrapper The CanvasWrapper associated with this SmilesDrawer.Drawer instance.
 * @property {Number} totalOverlapScore The current internal total overlap score.
 * @property {Object} defaultOptions The default options.
 * @property {Object} opts The merged options.
 * @property {Object} theme The current theme.
 */
class DrawerBase {
  graph: any;
  doubleBondConfigCount: number | null;
  doubleBondConfig: any;
  canvasWrapper: any;
  totalOverlapScore: number;
  defaultOptions: any;
  opts: any;
  theme: any;
  themeManager: any;
  data: any;
  infoOnly: boolean;
  highlight_atoms: any;

  /**
   * The constructor for the class SmilesDrawer.
   *
   * @param {Object} options An object containing custom values for different options. It is merged with the default options.
   */
  constructor(options: any) {
    this.ringManager = new RingManager(this);
      this.stereochemistryManager = new StereochemistryManager(this);
      this.overlapResolver = new OverlapResolutionManager(this);
      this.positioningManager = new PositioningManager(this);
    this.graph = null;
    this.doubleBondConfigCount = 0;
    this.doubleBondConfig = null;
    this.ringIdCounter = 0;
    this.ringConnectionIdCounter = 0;
    this.canvasWrapper = null;
    this.totalOverlapScore = 0;

    this.defaultOptions = {
      width: 500,
      height: 500,
      scale: 0.0,
      bondThickness: 1.0,
      bondLength: 30,
      shortBondLength: 0.8,
      bondSpacing: 0.17 * 30,
      atomVisualization: 'default',
      isomeric: true,
      debug: false,
      terminalCarbons: false,
      explicitHydrogens: true,
      overlapSensitivity: 0.42,
      overlapResolutionIterations: 1,
      compactDrawing: true,
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSizeLarge: 11,
      fontSizeSmall: 3,
      padding: 10.0,
      experimentalSSSR: false,
      kkThreshold: 0.1,
      kkInnerThreshold: 0.1,
      kkMaxIteration: 20000,
      kkMaxInnerIteration: 50,
      kkMaxEnergy: 1e9,
      weights: {
        colormap: null,
        additionalPadding: 20.0,
        sigma: 10,
        interval: 0.0,
        opacity: 1.0,
      },
      themes: {
        dark: {
          C: '#fff',
          O: '#e74c3c',
          N: '#3498db',
          F: '#27ae60',
          CL: '#16a085',
          BR: '#d35400',
          I: '#8e44ad',
          P: '#d35400',
          S: '#f1c40f',
          B: '#e67e22',
          SI: '#e67e22',
          H: '#aaa',
          BACKGROUND: '#141414'
        },
        light: {
          C: '#222',
          O: '#e74c3c',
          N: '#3498db',
          F: '#27ae60',
          CL: '#16a085',
          BR: '#d35400',
          I: '#8e44ad',
          P: '#d35400',
          S: '#f1c40f',
          B: '#e67e22',
          SI: '#e67e22',
          H: '#666',
          BACKGROUND: '#fff'
        },
        oldschool: {
          C: '#000',
          O: '#000',
          N: '#000',
          F: '#000',
          CL: '#000',
          BR: '#000',
          I: '#000',
          P: '#000',
          S: '#000',
          B: '#000',
          SI: '#000',
          H: '#000',
          BACKGROUND: '#fff'
        },
        "solarized": {
          C: "#586e75",
          O: "#dc322f",
          N: "#268bd2",
          F: "#859900",
          CL: "#16a085",
          BR: "#cb4b16",
          I: "#6c71c4",
          P: "#d33682",
          S: "#b58900",
          B: "#2aa198",
          SI: "#2aa198",
          H: "#657b83",
          BACKGROUND: "#fff"
        },
        "solarized-dark": {
          C: "#93a1a1",
          O: "#dc322f",
          N: "#268bd2",
          F: "#859900",
          CL: "#16a085",
          BR: "#cb4b16",
          I: "#6c71c4",
          P: "#d33682",
          S: "#b58900",
          B: "#2aa198",
          SI: "#2aa198",
          H: "#839496",
          BACKGROUND: "#fff"
        },
        "matrix": {
          C: "#678c61",
          O: "#2fc079",
          N: "#4f7e7e",
          F: "#90d762",
          CL: "#82d967",
          BR: "#23755a",
          I: "#409931",
          P: "#c1ff8a",
          S: "#faff00",
          B: "#50b45a",
          SI: "#409931",
          H: "#426644",
          BACKGROUND: "#fff"
        },
        "github": {
          C: "#24292f",
          O: "#cf222e",
          N: "#0969da",
          F: "#2da44e",
          CL: "#6fdd8b",
          BR: "#bc4c00",
          I: "#8250df",
          P: "#bf3989",
          S: "#d4a72c",
          B: "#fb8f44",
          SI: "#bc4c00",
          H: "#57606a",
          BACKGROUND: "#fff"
        },
        "carbon": {
          C: "#161616",
          O: "#da1e28",
          N: "#0f62fe",
          F: "#198038",
          CL: "#007d79",
          BR: "#fa4d56",
          I: "#8a3ffc",
          P: "#ff832b",
          S: "#f1c21b",
          B: "#8a3800",
          SI: "#e67e22",
          H: "#525252",
          BACKGROUND: "#fff"
        },
        "cyberpunk": {
          C: "#ea00d9",
          O: "#ff3131",
          N: "#0abdc6",
          F: "#00ff9f",
          CL: "#00fe00",
          BR: "#fe9f20",
          I: "#ff00ff",
          P: "#fe7f00",
          S: "#fcee0c",
          B: "#ff00ff",
          SI: "#ffffff",
          H: "#913cb1",
          BACKGROUND: "#fff"
        },
        "gruvbox": {
          C: "#665c54",
          O: "#cc241d",
          N: "#458588",
          F: "#98971a",
          CL: "#79740e",
          BR: "#d65d0e",
          I: "#b16286",
          P: "#af3a03",
          S: "#d79921",
          B: "#689d6a",
          SI: "#427b58",
          H: "#7c6f64",
          BACKGROUND: "#fbf1c7"
        },
        "gruvbox-dark": {
          C: "#ebdbb2",
          O: "#cc241d",
          N: "#458588",
          F: "#98971a",
          CL: "#b8bb26",
          BR: "#d65d0e",
          I: "#b16286",
          P: "#fe8019",
          S: "#d79921",
          B: "#8ec07c",
          SI: "#83a598",
          H: "#bdae93",
          BACKGROUND: "#282828"
        },
        custom: {
          C: '#222',
          O: '#e74c3c',
          N: '#3498db',
          F: '#27ae60',
          CL: '#16a085',
          BR: '#d35400',
          I: '#8e44ad',
          P: '#d35400',
          S: '#f1c40f',
          B: '#e67e22',
          SI: '#e67e22',
          H: '#666',
          BACKGROUND: '#fff'
        },
      }
    };

    this.opts = Options.extend(true, this.defaultOptions, options);
    this.opts.halfBondSpacing = this.opts.bondSpacing / 2.0;
    this.opts.bondLengthSq = this.opts.bondLength * this.opts.bondLength;
    this.opts.halfFontSizeLarge = this.opts.fontSizeLarge / 2.0;
    this.opts.quarterFontSizeLarge = this.opts.fontSizeLarge / 4.0;
    this.opts.fifthFontSizeSmall = this.opts.fontSizeSmall / 5.0;

    // Set the default theme.
    this.theme = this.opts.themes.dark;
  }

  /**
   * Draws the parsed smiles data to a canvas element.
   *
   * @param {Object} data The tree returned by the smiles parser.
   * @param {(String|HTMLCanvasElement)} target The id of the HTML canvas element the structure is drawn to - or the element itself.
   * @param {String} themeName='dark' The name of the theme to use. Built-in themes are 'light' and 'dark'.
   * @param {Boolean} infoOnly=false Only output info on the molecule without drawing anything to the canvas.
   */
  draw(data: any, target: any, themeName: string = 'light', infoOnly: boolean = false): void {
    this.initDraw(data, themeName, infoOnly, null);

    if (!this.infoOnly) {
      this.themeManager = new ThemeManager(this.opts.themes, themeName);
      this.canvasWrapper = new CanvasWrapper(target, this.themeManager, this.opts);
    }

    if (!infoOnly) {
      this.processGraph();

      // Set the canvas to the appropriate size
      this.canvasWrapper.scale(this.graph.vertices);

      // Do the actual drawing
      this.drawEdges(this.opts.debug);
      this.drawVertices(this.opts.debug);
      this.canvasWrapper.reset();

      if (this.opts.debug) {
        console.log(this.graph);
        console.log(this.rings);
        console.log(this.ringConnections);
      }
    }
  }

  /**
   * Returns the number of rings this edge is a part of.
   *
   * @param {Number} edgeId The id of an edge.
   * @returns {Number} The number of rings the provided edge is part of.
   */
  edgeRingCount(edgeId: number): number {
      return this.ringManager.edgeRingCount(edgeId);
  }

  /**
   * Returns an array containing the bridged rings associated with this  molecule.
   *
   * @returns {Ring[]} An array containing all bridged rings associated with this molecule.
   */
  getBridgedRings(): any[] {
      return this.ringManager.getBridgedRings();
  }

  /**
   * Returns an array containing all fused rings associated with this molecule.
   *
   * @returns {Ring[]} An array containing all fused rings associated with this molecule.
   */
  getFusedRings(): any[] {
      return this.ringManager.getFusedRings();
  }

  /**
   * Returns an array containing all spiros associated with this molecule.
   *
   * @returns {Ring[]} An array containing all spiros associated with this molecule.
   */
  getSpiros(): any[] {
      return this.ringManager.getSpiros();
  }

  /**
   * Returns a string containing a semicolon and new-line separated list of ring properties: Id; Members Count; Neighbours Count; IsSpiro; IsFused; IsBridged; Ring Count (subrings of bridged rings)
   *
   * @returns {String} A string as described in the method description.
   */
  printRingInfo(): string {
      return this.ringManager.printRingInfo();
  }

  /**
   * Rotates the drawing to make the widest dimension horizontal.
   */
  rotateDrawing(): void {
    // Rotate the vertices to make the molecule align horizontally
    // Find the longest distance
    let a = 0;
    let b = 0;
    let maxDist = 0;
    for (var i = 0; i < this.graph.vertices.length; i++) {
      let vertexA = this.graph.vertices[i];

      if (!vertexA.value.isDrawn) {
        continue;
      }

      for (var j = i + 1; j < this.graph.vertices.length; j++) {
        let vertexB = this.graph.vertices[j];

        if (!vertexB.value.isDrawn) {
          continue;
        }

        let dist = vertexA.position.distanceSq(vertexB.position);

        if (dist > maxDist) {
          maxDist = dist;
          a = i;
          b = j;
        }
      }
    }

    let angle = -Vector2.subtract(this.graph.vertices[a].position, this.graph.vertices[b].position).angle();

    if (!isNaN(angle)) {
      // Round to 30 degrees
      let remainder = angle % 0.523599;

      // Round either up or down in 30 degree steps
      if (remainder < 0.2617995) {
        angle = angle - remainder;
      } else {
        angle += 0.523599 - remainder;
      }

      // Finally, rotate everything
      for (var i = 0; i < this.graph.vertices.length; i++) {
        if (i === b) {
          continue;
        }

        this.graph.vertices[i].position.rotateAround(angle, this.graph.vertices[b].position);
      }

      for (var i = 0; i < this.rings.length; i++) {
        this.rings[i].center.rotateAround(angle, this.graph.vertices[b].position);
      }
    }
  }

  /**
   * Returns the total overlap score of the current molecule.
   *
   * @returns {Number} The overlap score.
   */
  getTotalOverlapScore(): number {
    return this.totalOverlapScore;
  }

  /**
   * Returns the ring count of the current molecule.
   *
   * @returns {Number} The ring count.
   */
  getRingCount(): number {
      return this.ringManager.getRingCount();
  }

  /**
   * Checks whether or not the current molecule  a bridged ring.
   *
   * @returns {Boolean} A boolean indicating whether or not the current molecule  a bridged ring.
   */
  hasBridgedRing(): boolean {
      return this.ringManager.hasBridgedRing();
  }

  /**
   * Returns the number of heavy atoms (non-hydrogen) in the current molecule.
   *
   * @returns {Number} The heavy atom count.
   */
  getHeavyAtomCount(): number {
    let hac = 0;

    for (var i = 0; i < this.graph.vertices.length; i++) {
      if (this.graph.vertices[i].value.element !== 'H') {
        hac++;
      }
    }

    return hac;
  }

  /**
   * Returns the molecular formula of the loaded molecule as a string.
   *
   * @returns {String} The molecular formula.
   */
  getMolecularFormula(data: any = null): string {
    let molecularFormula = '';
    let counts = new Map();

    let graph = data === null ? this.graph : new Graph(data, this.opts.isomeric);

    // Initialize element count
    for (var i = 0; i < graph.vertices.length; i++) {
      let atom = graph.vertices[i].value;

      if (counts.has(atom.element)) {
        counts.set(atom.element, counts.get(atom.element) + 1);
      } else {
        counts.set(atom.element, 1);
      }

      // Hydrogens attached to a chiral center were added as vertices,
      // those in non chiral brackets are added here
      if (atom.bracket && !atom.bracket.chirality) {
        if (counts.has('H')) {
          counts.set('H', counts.get('H') + atom.bracket.hcount);
        } else {
          counts.set('H', atom.bracket.hcount);
        }
      }

      // Add the implicit hydrogens according to valency, exclude
      // bracket atoms as they were handled and always have the number
      // of hydrogens specified explicitly
      if (!atom.bracket) {
        let nHydrogens = Atom.maxBonds[atom.element] - atom.bondCount;

        if (atom.isPartOfAromaticRing) {
          nHydrogens--;
        }

        if (counts.has('H')) {
          counts.set('H', counts.get('H') + nHydrogens);
        } else {
          counts.set('H', nHydrogens);
        }
      }
    }

    if (counts.has('C')) {
      let count = counts.get('C');
      molecularFormula += 'C' + (count > 1 ? count : '');
      counts.delete('C');
    }

    if (counts.has('H')) {
      let count = counts.get('H');
      molecularFormula += 'H' + (count > 1 ? count : '');
      counts.delete('H');
    }

    let elements = Object.keys(Atom.atomicNumbers).sort();

    elements.map(e => {
      if (counts.has(e)) {
        let count = counts.get(e);
        molecularFormula += e + (count > 1 ? count : '');
      }
    });

    return molecularFormula;
  }

  /**
   * Returns the type of the ringbond (e.g. '=' for a double bond). The ringbond represents the break in a ring introduced when creating the MST. If the two vertices supplied as arguments are not part of a common ringbond, the method returns null.
   *
   * @param {Vertex} vertexA A vertex.
   * @param {Vertex} vertexB A vertex.
   * @returns {(String|null)} Returns the ringbond type or null, if the two supplied vertices are not connected by a ringbond.
   */
  getRingbondType(vertexA: any, vertexB: any): string | null {
      return this.ringManager.getRingbondType(vertexA, vertexB);
  }

  initDraw(data: any, themeName: string, infoOnly: boolean, highlight_atoms: any): void {
    this.data = data;
    this.infoOnly = infoOnly;

    this.ringIdCounter = 0;
    this.ringConnectionIdCounter = 0;

    this.graph = new Graph(data, this.opts.isomeric);
    this.rings = Array();
    this.ringConnections = Array();

    this.originalRings = Array();
    this.originalRingConnections = Array();

    this.bridgedRing = false;

    // Reset those, in case the previous drawn SMILES had a dangling \ or /
    this.doubleBondConfigCount = null;
    this.doubleBondConfig = null;

    this.highlight_atoms = highlight_atoms

    this.initRings();
    this.initHydrogens();
  }

  processGraph(): void {
    this.position();

    // Restore the ring information (removes bridged rings and replaces them with the original, multiple, rings)
    this.restoreRingInformation();

    // Atoms bonded to the same ring atom
    this.resolvePrimaryOverlaps();

    let overlapScore = this.getOverlapScore();

    this.totalOverlapScore = this.getOverlapScore().total;

    for (var o = 0; o < this.opts.overlapResolutionIterations; o++) {
      for (var i = 0; i < this.graph.edges.length; i++) {
        let edge = this.graph.edges[i];
        if (this.isEdgeRotatable(edge)) {
          let subTreeDepthA = this.graph.getTreeDepth(edge.sourceId, edge.targetId);
          let subTreeDepthB = this.graph.getTreeDepth(edge.targetId, edge.sourceId);

          // Only rotate the shorter subtree
          let a = edge.targetId;
          let b = edge.sourceId;

          if (subTreeDepthA > subTreeDepthB) {
            a = edge.sourceId;
            b = edge.targetId;
          }

          let subTreeOverlap = this.getSubtreeOverlapScore(b, a, overlapScore.vertexScores);
          if (subTreeOverlap.value > this.opts.overlapSensitivity) {
            let vertexA = this.graph.vertices[a];
            let vertexB = this.graph.vertices[b];
            let neighboursB = vertexB.getNeighbours(a);

            if (neighboursB.length === 1) {
              let neighbour = this.graph.vertices[neighboursB[0]];
              let angle = neighbour.position.getRotateAwayFromAngle(vertexA.position, vertexB.position, MathHelper.toRad(120));

              this.rotateSubtree(neighbour.id, vertexB.id, angle, vertexB.position);
              // If the new overlap is bigger, undo change
              let newTotalOverlapScore = this.getOverlapScore().total;

              if (newTotalOverlapScore > this.totalOverlapScore) {
                this.rotateSubtree(neighbour.id, vertexB.id, -angle, vertexB.position);
              } else {
                this.totalOverlapScore = newTotalOverlapScore;
              }
            } else if (neighboursB.length === 2) {
              // Switch places / sides
              // If vertex a is in a ring, do nothing
              if (vertexB.value.rings.length !== 0 && vertexA.value.rings.length !== 0) {
                continue;
              }

              let neighbourA = this.graph.vertices[neighboursB[0]];
              let neighbourB = this.graph.vertices[neighboursB[1]];

              if (neighbourA.value.rings.length === 1 && neighbourB.value.rings.length === 1) {
                // Both neighbours in same ring. TODO: does this create problems with wedges? (up = down and vice versa?)
                if (neighbourA.value.rings[0] !== neighbourB.value.rings[0]) {
                  continue;
                }
                // TODO: Rotate circle
              } else if (neighbourA.value.rings.length !== 0 || neighbourB.value.rings.length !== 0) {
                continue;
              } else {
                let angleA = neighbourA.position.getRotateAwayFromAngle(vertexA.position, vertexB.position, MathHelper.toRad(120));
                let angleB = neighbourB.position.getRotateAwayFromAngle(vertexA.position, vertexB.position, MathHelper.toRad(120));

                this.rotateSubtree(neighbourA.id, vertexB.id, angleA, vertexB.position);
                this.rotateSubtree(neighbourB.id, vertexB.id, angleB, vertexB.position);

                let newTotalOverlapScore = this.getOverlapScore().total;

                if (newTotalOverlapScore > this.totalOverlapScore) {
                  this.rotateSubtree(neighbourA.id, vertexB.id, -angleA, vertexB.position);
                  this.rotateSubtree(neighbourB.id, vertexB.id, -angleB, vertexB.position);
                } else {
                  this.totalOverlapScore = newTotalOverlapScore;
                }
              }
            }

            overlapScore = this.getOverlapScore();
          }
        }
      }
    }

    this.resolveSecondaryOverlaps(overlapScore.scores);

    if (this.opts.isomeric) {
      this.annotateStereochemistry();
    }

    // Initialize pseudo elements or shortcuts
    if (this.opts.compactDrawing && this.opts.atomVisualization === 'default') {
      this.initPseudoElements();
    }

    this.rotateDrawing();
  }

  /**
   * Initializes rings and ringbonds for the current molecule.
   */
  initRings(): void {
      this.ringManager.initRings();
  }

  initHydrogens(): void {
    // Do not draw hydrogens except when they are connected to a stereocenter connected to two or more rings.
    if (!this.opts.explicitHydrogens) {
      for (var i = 0; i < this.graph.vertices.length; i++) {
        let vertex = this.graph.vertices[i];

        if (vertex.value.element !== 'H') {
          continue;
        }

        // Hydrogens should have only one neighbour, so just take the first
        // Also set hasHydrogen true on connected atom
        let neighbour = this.graph.vertices[vertex.neighbours[0]];
        neighbour.value.hasHydrogen = true;

        if (!neighbour.value.isStereoCenter || neighbour.value.rings.length < 2 && !neighbour.value.bridgedRing ||
          neighbour.value.bridgedRing && neighbour.value.originalRings.length < 2) {
          vertex.value.isDrawn = false;
        }
      }
    }
  }

  /**
   * Returns all rings connected by bridged bonds starting from the ring with the supplied ring id.
   *
   * @param {Number} ringId A ring id.
   * @returns {Number[]} An array containing all ring ids of rings part of a bridged ring system.
   */
  getBridgedRingRings(ringId: number): number[] {
      return this.ringManager.getBridgedRingRings(ringId);
  }

  /**
   * Checks whether or not a ring is part of a bridged ring.
   *
   * @param {Number} ringId A ring id.
   * @returns {Boolean} A boolean indicating whether or not the supplied ring (by id) is part of a bridged ring system.
   */
  isPartOfBridgedRing(ringId: number): boolean {
      return this.ringManager.isPartOfBridgedRing(ringId);
  }

  /**
   * Creates a bridged ring.
   *
   * @param {Number[]} ringIds An array of ids of rings involved in the bridged ring.
   * @param {Number} sourceVertexId The vertex id to start the bridged ring discovery from.
   * @returns {Ring} The bridged ring.
   */
  createBridgedRing(ringIds: number[], sourceVertexId: number): any {
      return this.ringManager.createBridgedRing(ringIds, sourceVertexId);
  }

  /**
   * Checks whether or not two vertices are in the same ring.
   *
   * @param {Vertex} vertexA A vertex.
   * @param {Vertex} vertexB A vertex.
   * @returns {Boolean} A boolean indicating whether or not the two vertices are in the same ring.
   */
  areVerticesInSameRing(vertexA: any, vertexB: any): boolean {
      return this.ringManager.areVerticesInSameRing(vertexA, vertexB);
  }

  /**
   * Returns an array of ring ids shared by both vertices.
   *
   * @param {Vertex} vertexA A vertex.
   * @param {Vertex} vertexB A vertex.
   * @returns {Number[]} An array of ids of rings shared by the two vertices.
   */
  getCommonRings(vertexA: any, vertexB: any): number[] {
      return this.ringManager.getCommonRings(vertexA, vertexB);
  }

  /**
   * Returns the aromatic or largest ring shared by the two vertices.
   *
   * @param {Vertex} vertexA A vertex.
   * @param {Vertex} vertexB A vertex.
   * @returns {(Ring|null)} If an aromatic common ring exists, that ring, else the largest (non-aromatic) ring, else null.
   */
  getLargestOrAromaticCommonRing(vertexA: any, vertexB: any): any {
      return this.ringManager.getLargestOrAromaticCommonRing(vertexA, vertexB);
  }

  /**
   * Returns an array of vertices positioned at a specified location.
   *
   * @param {Vector2} position The position to search for vertices.
   * @param {Number} radius The radius within to search.
   * @param {Number} excludeVertexId A vertex id to be excluded from the search results.
   * @returns {Number[]} An array containing vertex ids in a given location.
   */
  getVerticesAt(position: any, radius: number, excludeVertexId: number): number[] {
      return this.positioningManager.getVerticesAt(position, radius, excludeVertexId);
  }

  /**
   * Returns the closest vertex (connected as well as unconnected).
   *
   * @param {Vertex} vertex The vertex of which to find the closest other vertex.
   * @returns {Vertex} The closest vertex.
   */
  getClosestVertex(vertex: any): any {
      return this.positioningManager.getClosestVertex(vertex);
  }

  /**
   * Add a ring to this representation of a molecule.
   *
   * @param {Ring} ring A new ring.
   * @returns {Number} The ring id of the new ring.
   */
  addRing(ring: any): number {
      return this.ringManager.addRing(ring);
  }

  /**
   * Removes a ring from the array of rings associated with the current molecule.
   *
   * @param {Number} ringId A ring id.
   */
  removeRing(ringId: number): void {
      this.ringManager.removeRing(ringId);
  }

  /**
   * Gets a ring object from the array of rings associated with the current molecule by its id. The ring id is not equal to the index, since rings can be added and removed when processing bridged rings.
   *
   * @param {Number} ringId A ring id.
   * @returns {Ring} A ring associated with the current molecule.
   */
  getRing(ringId: number): any {
      return this.ringManager.getRing(ringId);
  }

  /**
   * Add a ring connection to this representation of a molecule.
   *
   * @param {RingConnection} ringConnection A new ringConnection.
   * @returns {Number} The ring connection id of the new ring connection.
   */
  addRingConnection(ringConnection: any): number {
      return this.ringManager.addRingConnection(ringConnection);
  }

  /**
   * Removes a ring connection from the array of rings connections associated with the current molecule.
   *
   * @param {Number} ringConnectionId A ring connection id.
   */
  removeRingConnection(ringConnectionId: number): void {
      this.ringManager.removeRingConnection(ringConnectionId);
  }

  /**
   * Removes all ring connections between two vertices.
   *
   * @param {Number} vertexIdA A vertex id.
   * @param {Number} vertexIdB A vertex id.
   */
  removeRingConnectionsBetween(vertexIdA: number, vertexIdB: number): void {
      this.ringManager.removeRingConnectionsBetween(vertexIdA, vertexIdB);
  }

  /**
   * Get a ring connection with a given id.
   *
   * @param {Number} id
   * @returns {RingConnection} The ring connection with the specified id.
   */
  getRingConnection(id: number): any {
      return this.ringManager.getRingConnection(id);
  }

  /**
   * Get the ring connections between a ring and a set of rings.
   *
   * @param {Number} ringId A ring id.
   * @param {Number[]} ringIds An array of ring ids.
   * @returns {Number[]} An array of ring connection ids.
   */
  getRingConnections(ringId: number, ringIds: number[]): number[] {
      return this.ringManager.getRingConnections(ringId, ringIds);
  }

  /**
   * Returns the overlap score of the current molecule based on its positioned vertices. The higher the score, the more overlaps occur in the structure drawing.
   *
   * @returns {Object} Returns the total overlap score and the overlap score of each vertex sorted by score (higher to lower). Example: { total: 99, scores: [ { id: 0, score: 22 }, ... ]  }
   */
  getOverlapScore(): any {
      return this.overlapResolver.getOverlapScore();
  }

  /**
   * When drawing a double bond, choose the side to place the double bond. E.g. a double bond should always been drawn inside a ring.
   *
   * @param {Vertex} vertexA A vertex.
   * @param {Vertex} vertexB A vertex.
   * @param {Vector2[]} sides An array containing the two normals of the line spanned by the two provided vertices.
   * @returns {Object} Returns an object containing the following information: {
          totalSideCount: Counts the sides of each vertex in the molecule, is an array [ a, b ],
          totalPosition: Same as position, but based on entire molecule,
          sideCount: Counts the sides of each neighbour, is an array [ a, b ],
          position: which side to position the second bond, is 0 or 1, represents the index in the normal array. This is based on only the neighbours
          anCount: the number of neighbours of vertexA,
          bnCount: the number of neighbours of vertexB
      }
   */
  chooseSide(vertexA: any, vertexB: any, sides: any[]): any {
      return this.overlapResolver.chooseSide(vertexA, vertexB, sides);
  }

  /**
   * Sets the center for a ring.
   *
   * @param {Ring} ring A ring.
   */
  setRingCenter(ring: any): void {
      this.ringManager.setRingCenter(ring);
  }

  /**
   * Gets the center of a ring contained within a bridged ring and containing a given vertex.
   *
   * @param {Ring} ring A bridged ring.
   * @param {Vertex} vertex A vertex.
   * @returns {Vector2} The center of the subring that containing the vertex.
   */
  getSubringCenter(ring: any, vertex: any): any {
      return this.ringManager.getSubringCenter(ring, vertex);
  }

  /**
   * Draw the actual edges as bonds to the canvas.
   *
   * @param {Boolean} debug A boolean indicating whether or not to draw debug helpers.
   */
  drawEdges(debug: boolean): void {
    let that = this;
    let drawn = Array(this.graph.edges.length);
    drawn.fill(false);

    this.graph.traverseBF(0, function (vertex) {
      let edges = that.graph.getEdges(vertex.id);
      for (var i = 0; i < edges.length; i++) {
        let edgeId = edges[i];
        if (!drawn[edgeId]) {
          drawn[edgeId] = true;
          that.drawEdge(edgeId, debug);
        }
      }
    });

    // Draw ring for implicitly defined aromatic rings
    if (!this.bridgedRing) {
      for (var i = 0; i < this.rings.length; i++) {
        let ring = this.rings[i];

        if (this.isRingAromatic(ring)) {
          this.canvasWrapper.drawAromaticityRing(ring);
        }
      }
    }
  }

  /**
   * Draw the an edge as a bonds to the canvas.
   *
   * @param {Number} edgeId An edge id.
   * @param {Boolean} debug A boolean indicating whether or not to draw debug helpers.
   */
  drawEdge(edgeId: number, debug: boolean): void {
    let that = this;
    let edge = this.graph.edges[edgeId];
    let vertexA = this.graph.vertices[edge.sourceId];
    let vertexB = this.graph.vertices[edge.targetId];
    let elementA = vertexA.value.element;
    let elementB = vertexB.value.element;

    if ((!vertexA.value.isDrawn || !vertexB.value.isDrawn) && this.opts.atomVisualization === 'default') {
      return;
    }

    let a = vertexA.position;
    let b = vertexB.position;
    let normals = this.getEdgeNormals(edge);

    // Create a point on each side of the line
    let sides = ArrayHelper.clone(normals) as any[];

    sides[0].multiplyScalar(10).add(a);
    sides[1].multiplyScalar(10).add(a);

    if (edge.bondType === '=' || this.getRingbondType(vertexA, vertexB) === '=' ||
      (edge.isPartOfAromaticRing && this.bridgedRing)) {
      // Always draw double bonds inside the ring
      let inRing = this.areVerticesInSameRing(vertexA, vertexB);
      let s = this.chooseSide(vertexA, vertexB, sides);

      if (inRing) {
        // Always draw double bonds inside a ring
        // if the bond is shared by two rings, it is drawn in the larger
        // problem: smaller ring is aromatic, bond is still drawn in larger -> fix this
        let lcr = this.getLargestOrAromaticCommonRing(vertexA, vertexB);
        let center = lcr.center;

        normals[0].multiplyScalar(that.opts.bondSpacing);
        normals[1].multiplyScalar(that.opts.bondSpacing);

        // Choose the normal that is on the same side as the center
        let line = null;

        if (center.sameSideAs(vertexA.position, vertexB.position, Vector2.add(a, normals[0]))) {
          line = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);
        } else {
          line = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);
        }

        line.shorten(this.opts.bondLength - this.opts.shortBondLength * this.opts.bondLength);

        // The shortened edge
        if (edge.isPartOfAromaticRing) {
          this.canvasWrapper.drawLine(line, true);
        } else {
          this.canvasWrapper.drawLine(line);
        }

        // The normal edge
        this.canvasWrapper.drawLine(new Line(a, b, elementA, elementB));
      } else if (edge.center || vertexA.isTerminal() && vertexB.isTerminal()) {
        normals[0].multiplyScalar(that.opts.halfBondSpacing);
        normals[1].multiplyScalar(that.opts.halfBondSpacing);

        let lineA = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);
        let lineB = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

        this.canvasWrapper.drawLine(lineA);
        this.canvasWrapper.drawLine(lineB);
      } else if (s.anCount == 0 && s.bnCount > 1 || s.bnCount == 0 && s.anCount > 1) {
        // Both lines are the same length here
        // Add the spacing to the edges (which are of unit length)
        normals[0].multiplyScalar(that.opts.halfBondSpacing);
        normals[1].multiplyScalar(that.opts.halfBondSpacing);

        let lineA = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);
        let lineB = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

        this.canvasWrapper.drawLine(lineA);
        this.canvasWrapper.drawLine(lineB);
      } else if (s.sideCount[0] > s.sideCount[1]) {
        normals[0].multiplyScalar(that.opts.bondSpacing);
        normals[1].multiplyScalar(that.opts.bondSpacing);

        let line = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);

        line.shorten(this.opts.bondLength - this.opts.shortBondLength * this.opts.bondLength);
        this.canvasWrapper.drawLine(line);
        this.canvasWrapper.drawLine(new Line(a, b, elementA, elementB));
      } else if (s.sideCount[0] < s.sideCount[1]) {
        normals[0].multiplyScalar(that.opts.bondSpacing);
        normals[1].multiplyScalar(that.opts.bondSpacing);

        let line = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

        line.shorten(this.opts.bondLength - this.opts.shortBondLength * this.opts.bondLength);
        this.canvasWrapper.drawLine(line);
        this.canvasWrapper.drawLine(new Line(a, b, elementA, elementB));
      } else if (s.totalSideCount[0] > s.totalSideCount[1]) {
        normals[0].multiplyScalar(that.opts.bondSpacing);
        normals[1].multiplyScalar(that.opts.bondSpacing);

        let line = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);

        line.shorten(this.opts.bondLength - this.opts.shortBondLength * this.opts.bondLength);
        this.canvasWrapper.drawLine(line);
        this.canvasWrapper.drawLine(new Line(a, b, elementA, elementB));
      } else if (s.totalSideCount[0] <= s.totalSideCount[1]) {
        normals[0].multiplyScalar(that.opts.bondSpacing);
        normals[1].multiplyScalar(that.opts.bondSpacing);

        let line = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

        line.shorten(this.opts.bondLength - this.opts.shortBondLength * this.opts.bondLength);
        this.canvasWrapper.drawLine(line);
        this.canvasWrapper.drawLine(new Line(a, b, elementA, elementB));
      } else {

      }
    } else if (edge.bondType === '#') {
      normals[0].multiplyScalar(that.opts.bondSpacing / 1.5);
      normals[1].multiplyScalar(that.opts.bondSpacing / 1.5);

      let lineA = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);
      let lineB = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

      this.canvasWrapper.drawLine(lineA);
      this.canvasWrapper.drawLine(lineB);

      this.canvasWrapper.drawLine(new Line(a, b, elementA, elementB));
    } else if (edge.bondType === '.') {
      // TODO: Something... maybe... version 2?
    } else {
      let isChiralCenterA = vertexA.value.isStereoCenter;
      let isChiralCenterB = vertexB.value.isStereoCenter;

      if (edge.wedge === 'up') {
        this.canvasWrapper.drawWedge(new Line(a, b, elementA, elementB, isChiralCenterA, isChiralCenterB));
      } else if (edge.wedge === 'down') {
        this.canvasWrapper.drawDashedWedge(new Line(a, b, elementA, elementB, isChiralCenterA, isChiralCenterB));
      } else {
        this.canvasWrapper.drawLine(new Line(a, b, elementA, elementB, isChiralCenterA, isChiralCenterB));
      }
    }

    if (debug) {
      let midpoint = Vector2.midpoint(a, b);
      this.canvasWrapper.drawDebugText(midpoint.x, midpoint.y, 'e: ' + edgeId);
    }
  }

  /**
   * Draws the vertices representing atoms to the canvas.
   *
   * @param {Boolean} debug A boolean indicating whether or not to draw debug messages to the canvas.
   */
  drawVertices(debug: boolean): void {
    for (var i = 0; i < this.graph.vertices.length; i++) {
      let vertex = this.graph.vertices[i];
      let atom = vertex.value;
      let charge = 0;
      let isotope = 0;
      let bondCount = vertex.value.bondCount;
      let element = atom.element;
      let hydrogens = Atom.maxBonds[element] - bondCount;
      let dir = vertex.getTextDirection(this.graph.vertices);
      let isTerminal = this.opts.terminalCarbons || element !== 'C' || atom.hasAttachedPseudoElements ? vertex.isTerminal() : false;
      let isCarbon = atom.element === 'C';
      // This is a HACK to remove all hydrogens from nitrogens in aromatic rings, as this
      // should be the most common state. This has to be fixed by kekulization
      if (atom.element === 'N' && atom.isPartOfAromaticRing) {
        hydrogens = 0;
      }

      if (atom.bracket) {
        hydrogens = atom.bracket.hcount;
        charge = atom.bracket.charge;
        isotope = atom.bracket.isotope;
      }

      // If the molecule has less than 3 elements, always write the "C" for carbon
      // Likewise, if the carbon has a charge or an isotope, always draw it
      if (charge || isotope || this.graph.vertices.length < 3) {
        isCarbon = false;
      }

      if (this.opts.atomVisualization === 'allballs') {
        this.canvasWrapper.drawBall(vertex.position.x, vertex.position.y, element);
      } else if ((atom.isDrawn && (!isCarbon || atom.drawExplicit || isTerminal || atom.hasAttachedPseudoElements)) || this.graph.vertices.length === 1) {
        if (this.opts.atomVisualization === 'default') {
          this.canvasWrapper.drawText(vertex.position.x, vertex.position.y,
            element, hydrogens, dir, isTerminal, charge, isotope, this.graph.vertices.length, atom.getAttachedPseudoElements());
        } else if (this.opts.atomVisualization === 'balls') {
          this.canvasWrapper.drawBall(vertex.position.x, vertex.position.y, element);
        }
      } else if (vertex.getNeighbourCount() === 2 && vertex.forcePositioned == true) {
        // If there is a carbon which bonds are in a straight line, draw a dot
        let a = this.graph.vertices[vertex.neighbours[0]].position;
        let b = this.graph.vertices[vertex.neighbours[1]].position;
        let angle = Vector2.threePointangle(vertex.position, a, b);

        if (Math.abs(Math.PI - angle) < 0.1) {
          this.canvasWrapper.drawPoint(vertex.position.x, vertex.position.y, element);
        }
      }

      if (debug) {
        let value = 'v: ' + vertex.id + ' ' + ArrayHelper.print(atom.ringbonds);
        this.canvasWrapper.drawDebugText(vertex.position.x, vertex.position.y, value);
      } else {
        // this.canvasWrapper.drawDebugText(vertex.position.x, vertex.position.y, vertex.value.chirality);
      }
    }

    // Draw the ring centers for debug purposes
    if (this.opts.debug) {
      for (var j = 0; j < this.rings.length; j++) {
        let center = this.rings[j].center;
        this.canvasWrapper.drawDebugPoint(center.x, center.y, 'r: ' + this.rings[j].id);
      }
    }
  }

  /**
   * Position the vertices according to their bonds and properties.
   */
  position(): void {
      this.positioningManager.position();
  }

  /**
   * Stores the current information associated with rings.
   */
  backupRingInformation(): void {
      this.ringManager.backupRingInformation();
  }

  /**
   * Restores the most recently backed up information associated with rings.
   */
  restoreRingInformation(): void {
      this.ringManager.restoreRingInformation();
  }

  // TODO: This needs some cleaning up

  /**
   * Creates a new ring, that is, positiones all the vertices inside a ring.
   *
   * @param {Ring} ring The ring to position.
   * @param {(Vector2|null)} [center=null] The center of the ring to be created.
   * @param {(Vertex|null)} [startVertex=null] The first vertex to be positioned inside the ring.
   * @param {(Vertex|null)} [previousVertex=null] The last vertex that was positioned.
   * @param {Boolean} [previousVertex=false] A boolean indicating whether or not this ring was force positioned already - this is needed after force layouting a ring, in order to draw rings connected to it.
   */
  createRing(ring: any, center: any = null, startVertex: any = null, previousVertex: any = null): void {
      this.ringManager.createRing(ring, center, startVertex, previousVertex);
  }

  /**
   * Rotate an entire subtree by an angle around a center.
   *
   * @param {Number} vertexId A vertex id (the root of the sub-tree).
   * @param {Number} parentVertexId A vertex id in the previous direction of the subtree that is to rotate.
   * @param {Number} angle An angle in randians.
   * @param {Vector2} center The rotational center.
   */
  rotateSubtree(vertexId: number, parentVertexId: number, angle: number, center: any): void {
      this.overlapResolver.rotateSubtree(vertexId, parentVertexId, angle, center);
  }

  /**
   * Gets the overlap score of a subtree.
   *
   * @param {Number} vertexId A vertex id (the root of the sub-tree).
   * @param {Number} parentVertexId A vertex id in the previous direction of the subtree.
   * @param {Number[]} vertexOverlapScores An array containing the vertex overlap scores indexed by vertex id.
   * @returns {Object} An object containing the total overlap score and the center of mass of the subtree weighted by overlap score { value: 0.2, center: new Vector2() }.
   */
  getSubtreeOverlapScore(vertexId: number, parentVertexId: number, vertexOverlapScores: any): any {
      return this.overlapResolver.getSubtreeOverlapScore(vertexId, parentVertexId, vertexOverlapScores);
  }

  /**
   * Returns the current (positioned vertices so far) center of mass.
   *
   * @returns {Vector2} The current center of mass.
   */
  getCurrentCenterOfMass(): any {
      return this.overlapResolver.getCurrentCenterOfMass();
  }

  /**
   * Returns the current (positioned vertices so far) center of mass in the neighbourhood of a given position.
   *
   * @param {Vector2} vec The point at which to look for neighbours.
   * @param {Number} [r=currentBondLength*2.0] The radius of vertices to include.
   * @returns {Vector2} The current center of mass.
   */
  getCurrentCenterOfMassInNeigbourhood(vec: any, r: number = this.opts.bondLength * 2.0): any {
      return this.overlapResolver.getCurrentCenterOfMassInNeigbourhood(vec, r);
  }

  /**
   * Resolve primary (exact) overlaps, such as two vertices that are connected to the same ring vertex.
   */
  resolvePrimaryOverlaps(): void {
      this.overlapResolver.resolvePrimaryOverlaps();
  }

  /**
   * Resolve secondary overlaps. Those overlaps are due to the structure turning back on itself.
   *
   * @param {Object[]} scores An array of objects sorted descending by score.
   * @param {Number} scores[].id A vertex id.
   * @param {Number} scores[].score The overlap score associated with the vertex id.
   */
  resolveSecondaryOverlaps(scores: any[]): void {
      this.overlapResolver.resolveSecondaryOverlaps(scores);
  }

  /**
   * Get the last non-null or 0 angle.
   * @param {Number} vertexId A vertex id.
   * @returns {Vertex} The last angle that was not 0 or null.
   */
  getLastAngle(vertexId: number): number {
      return this.positioningManager.getLastAngle(vertexId);
  }

  /**
   * Positiones the next vertex thus creating a bond.
   *
   * @param {Vertex} vertex A vertex.
   * @param {Vertex} [previousVertex=null] The previous vertex which has been positioned.
   * @param {Number} [angle=0.0] The (global) angle of the vertex.
   * @param {Boolean} [originShortest=false] Whether the origin is the shortest subtree in the branch.
   * @param {Boolean} [skipPositioning=false] Whether or not to skip positioning and just check the neighbours.
   */
  createNextBond(vertex: any, previousVertex: any = null, angle: number = 0.0, originShortest: boolean = false, skipPositioning: boolean = false): void {
      this.positioningManager.createNextBond(vertex, previousVertex, angle, originShortest, skipPositioning);
  }

  /**
   * Gets the vetex sharing the edge that is the common bond of two rings.
   *
   * @param {Vertex} vertex A vertex.
   * @returns {(Number|null)} The id of a vertex sharing the edge that is the common bond of two rings with the vertex provided or null, if none.
   */
  getCommonRingbondNeighbour(vertex: any): any {
      return this.ringManager.getCommonRingbondNeighbour(vertex);
  }

  /**
   * Check if a vector is inside any ring.
   *
   * @param {Vector2} vec A vector.
   * @returns {Boolean} A boolean indicating whether or not the point (vector) is inside any of the rings associated with the current molecule.
   */
  isPointInRing(vec: any): boolean {
      return this.ringManager.isPointInRing(vec);
  }

  /**
   * Check whether or not an edge is part of a ring.
   *
   * @param {Edge} edge An edge.
   * @returns {Boolean} A boolean indicating whether or not the edge is part of a ring.
   */
  isEdgeInRing(edge: any): boolean {
      return this.ringManager.isEdgeInRing(edge);
  }

  /**
   * Check whether or not an edge is rotatable.
   *
   * @param {Edge} edge An edge.
   * @returns {Boolean} A boolean indicating whether or not the edge is rotatable.
   */
  isEdgeRotatable(edge: any): boolean {
    let vertexA = this.graph.vertices[edge.sourceId];
    let vertexB = this.graph.vertices[edge.targetId];

    // Only single bonds are rotatable
    if (edge.bondType !== '-') {
      return false;
    }

    // Do not rotate edges that have a further single bond to each side - do that!
    // If the bond is terminal, it doesn't make sense to rotate it
    // if (vertexA.getNeighbourCount() + vertexB.getNeighbourCount() < 5) {
    //   return false;
    // }

    if (vertexA.isTerminal() || vertexB.isTerminal()) {
      return false;
    }

    // Ringbonds are not rotatable
    if (vertexA.value.rings.length > 0 && vertexB.value.rings.length > 0 &&
      this.areVerticesInSameRing(vertexA, vertexB)) {
      return false;
    }

    return true;
  }

  /**
   * Check whether or not a ring is an implicitly defined aromatic ring (lower case smiles).
   *
   * @param {Ring} ring A ring.
   * @returns {Boolean} A boolean indicating whether or not a ring is implicitly defined as aromatic.
   */
  isRingAromatic(ring: any): boolean {
      return this.ringManager.isRingAromatic(ring);
  }

  /**
   * Get the normals of an edge.
   *
   * @param {Edge} edge An edge.
   * @returns {Vector2[]} An array containing two vectors, representing the normals.
   */
  getEdgeNormals(edge: any): any[] {
    let v1 = this.graph.vertices[edge.sourceId].position;
    let v2 = this.graph.vertices[edge.targetId].position;

    // Get the normalized normals for the edge
    let normals = Vector2.units(v1, v2);

    return normals;
  }

  /**
   * Returns an array of vertices that are neighbouring a vertix but are not members of a ring (including bridges).
   *
   * @param {Number} vertexId A vertex id.
   * @returns {Vertex[]} An array of vertices.
   */
  getNonRingNeighbours(vertexId: number): any[] {
      return this.positioningManager.getNonRingNeighbours(vertexId);
  }

  /**
   * Annotaed stereochemistry information for visualization.
   */
  annotateStereochemistry(): void {
      this.stereochemistryManager.annotateStereochemistry();
  }

  /**
   *
   *
   * @param {Number} vertexId The id of a vertex.
   * @param {(Number|null)} previousVertexId The id of the parent vertex of the vertex.
   * @param {Uint8Array} visited An array containing the visited flag for all vertices in the graph.
   * @param {Array} priority An array of arrays storing the atomic numbers for each level.
   * @param {Number} maxDepth The maximum depth.
   * @param {Number} depth The current depth.
   */
  visitStereochemistry(vertexId: number, previousVertexId: number, visited: Uint8Array, priority: any[], maxDepth: number, depth: number, parentAtomicNumber: number = 0): void {
      this.stereochemistryManager.visitStereochemistry(vertexId, previousVertexId, visited, priority, maxDepth, depth, parentAtomicNumber);
  }

  /**
   * Creates pseudo-elements (such as Et, Me, Ac, Bz, ...) at the position of the carbon sets
   * the involved atoms not to be displayed.
   */
  initPseudoElements(): void {
    for (var i = 0; i < this.graph.vertices.length; i++) {
      const vertex = this.graph.vertices[i];
      const neighbourIds = vertex.neighbours;
      let neighbours = Array(neighbourIds.length);

      for (var j = 0; j < neighbourIds.length; j++) {
        neighbours[j] = this.graph.vertices[neighbourIds[j]];
      }

      // Ignore atoms that have less than 3 neighbours, except if
      // the vertex is connected to a ring and has two neighbours
      if (vertex.getNeighbourCount() < 3 || vertex.value.rings.length > 0) {
        continue;
      }

      // TODO: This exceptions should be handled more elegantly (via config file?)

      // Ignore phosphates (especially for triphosphates)
      if (vertex.value.element === 'P') {
        continue;
      }

      // Ignore also guanidine
      if (vertex.value.element === 'C' && neighbours.length === 3 &&
        neighbours[0].value.element === 'N' && neighbours[1].value.element === 'N' && neighbours[2].value.element === 'N') {
        continue;
      }

      // Continue if there are less than two heteroatoms
      // or if a neighbour has more than 1 neighbour
      let heteroAtomCount = 0;
      let ctn = 0;

      for (var j = 0; j < neighbours.length; j++) {
        let neighbour = neighbours[j];
        let neighbouringElement = neighbour.value.element;
        let neighbourCount = neighbour.getNeighbourCount();

        if (neighbouringElement !== 'C' && neighbouringElement !== 'H' &&
          neighbourCount === 1) {
          heteroAtomCount++;
        }

        if (neighbourCount > 1) {
          ctn++;
        }
      }

      if (ctn > 1 || heteroAtomCount < 2) {
        continue;
      }

      // Get the previous atom (the one which is not terminal)
      let previous = null;

      for (var j = 0; j < neighbours.length; j++) {
        let neighbour = neighbours[j];

        if (neighbour.getNeighbourCount() > 1) {
          previous = neighbour;
        }
      }

      for (var j = 0; j < neighbours.length; j++) {
        let neighbour = neighbours[j];

        if (neighbour.getNeighbourCount() > 1) {
          continue;
        }

        neighbour.value.isDrawn = false;

        let hydrogens = Atom.maxBonds[neighbour.value.element] - neighbour.value.bondCount;
        let charge = '';

        if (neighbour.value.bracket) {
          hydrogens = neighbour.value.bracket.hcount;
          charge = neighbour.value.bracket.charge || 0;
        }

        vertex.value.attachPseudoElement(neighbour.value.element, previous ? previous.value.element : null, hydrogens, charge);
      }
    }

    // The second pass
    for (var i = 0; i < this.graph.vertices.length; i++) {
      const vertex = this.graph.vertices[i];
      const atom = vertex.value;
      const element = atom.element;

      if (element === 'C' || element === 'H' || !atom.isDrawn) {
        continue;
      }

      const neighbourIds = vertex.neighbours;
      let neighbours = Array(neighbourIds.length);

      for (var j = 0; j < neighbourIds.length; j++) {
        neighbours[j] = this.graph.vertices[neighbourIds[j]];
      }

      for (var j = 0; j < neighbours.length; j++) {
        let neighbour = neighbours[j].value;

        if (!neighbour.hasAttachedPseudoElements || neighbour.getAttachedPseudoElementsCount() !== 2) {
          continue;
        }

        const pseudoElements = neighbour.getAttachedPseudoElements();

        if (pseudoElements.hasOwnProperty('0O') && pseudoElements.hasOwnProperty('3C')) {
          neighbour.isDrawn = false;
          vertex.value.attachPseudoElement('Ac', '', 0);
        }
      }
    }
  }

    private ringManager: RingManager;

    get ringIdCounter(): number {
        return this.ringManager.ringIdCounter;
    }

    set ringIdCounter(value: number) {
        this.ringManager.ringIdCounter = value;
    }

    get ringConnectionIdCounter(): number {
        return this.ringManager.ringConnectionIdCounter;
    }

    set ringConnectionIdCounter(value: number) {
        this.ringManager.ringConnectionIdCounter = value;
    }

    get rings(): any[] {
        return this.ringManager.rings;
    }

    set rings(value: any[]) {
        this.ringManager.rings = value;
    }

    get ringConnections(): any[] {
        return this.ringManager.ringConnections;
    }

    set ringConnections(value: any[]) {
        this.ringManager.ringConnections = value;
    }

    get originalRings(): any[] {
        return this.ringManager.originalRings;
    }

    set originalRings(value: any[]) {
        this.ringManager.originalRings = value;
    }

    get originalRingConnections(): any[] {
        return this.ringManager.originalRingConnections;
    }

    set originalRingConnections(value: any[]) {
        this.ringManager.originalRingConnections = value;
    }

    get bridgedRing(): boolean {
        return this.ringManager.bridgedRing;
    }

    set bridgedRing(value: boolean) {
        this.ringManager.bridgedRing = value;
    }

    private stereochemistryManager: StereochemistryManager;
    private overlapResolver: OverlapResolutionManager;
    private positioningManager: PositioningManager;
}

export = DrawerBase;
