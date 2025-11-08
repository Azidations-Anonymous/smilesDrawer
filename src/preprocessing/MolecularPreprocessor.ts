import StereochemistryManager from "./StereochemistryManager";
import OverlapResolutionManager from "./OverlapResolutionManager";
import PositioningManager from "./PositioningManager";
import DrawingManager from "../drawing/DrawingManager";
import PseudoElementManager from "./PseudoElementManager";
import MolecularInfoManager from "./MolecularInfoManager";
import InitializationManager from "./InitializationManager";
import GraphProcessingManager from "./GraphProcessingManager";
import CisTransManager from "./CisTransManager";
import OptionsManager from "../config/OptionsManager";
import RingManager = require("./RingManager");
import IMolecularData = require("./IMolecularData");
import { SideChoice, AtomHighlight, OverlapScore, SubtreeOverlapScore, VertexOverlapScoreEntry, PositionData } from "./MolecularDataTypes";
import { IMoleculeOptions, IThemeColors } from "../config/IOptions";
import { BondType, CisTransOrientation } from '../types/CommonTypes';
import { POSITION_DATA_VERSION } from '../config/Version';

import MathHelper = require('../utils/MathHelper');
import ArrayHelper = require('../utils/ArrayHelper');
import Vector2 = require('../graph/Vector2');
import Line = require('../graph/Line');
import Vertex = require('../graph/Vertex');
import Edge = require('../graph/Edge');
import Atom = require('../graph/Atom');
import Ring = require('../graph/Ring');
import RingConnection = require('../graph/RingConnection');
import CanvasDrawer = require('../drawing/CanvasDrawer');
import Graph = require('../graph/Graph');
import SSSR = require('../algorithms/SSSR');
import ThemeManager = require('../config/ThemeManager');
import Options = require('../config/Options');

type ParseTree = any;

/**
 * The molecular structure preprocessor and coordinator
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
class MolecularPreprocessor implements IMolecularData {
  graph: Graph;
  doubleBondConfigCount: number | null;
  doubleBondConfig: '/' | '\\' | null;
  canvasWrapper: CanvasDrawer | null;
  totalOverlapScore: number;
  opts: IMoleculeOptions;
  theme: IThemeColors;
  themeManager: ThemeManager;
  data: ParseTree;  // Parse tree data from SMILES parser
  infoOnly: boolean;
  highlight_atoms: AtomHighlight[];
  atomAnnotationDefaults: Map<string, unknown>;
  atomAnnotationNames: Set<string>;
  cisTransManager: CisTransManager;

  /**
   * The constructor for the class SmilesDrawer.
   *
   * @param {Object} options An object containing custom values for different options. It is merged with the default options.
   */
  constructor(options: Partial<IMoleculeOptions>) {
      this.ringManager = new RingManager(this);
        this.stereochemistryManager = new StereochemistryManager(this);
        this.overlapResolver = new OverlapResolutionManager(this);
        this.positioningManager = new PositioningManager(this);
        this.drawingManager = new DrawingManager(this);
        this.pseudoElementManager = new PseudoElementManager(this);
        this.molecularInfoManager = new MolecularInfoManager(this);
        this.initializationManager = new InitializationManager(this);
        this.graphProcessingManager = new GraphProcessingManager(this);
        this.cisTransManager = new CisTransManager(this);
      this.graph = null;
      this.doubleBondConfigCount = 0;
      this.doubleBondConfig = null;
      this.ringIdCounter = 0;
      this.ringConnectionIdCounter = 0;
      this.canvasWrapper = null;
      this.totalOverlapScore = 0;
      this.atomAnnotationDefaults = new Map();
      this.atomAnnotationNames = new Set();

      const optionsManager = new OptionsManager(options);
          this.opts = optionsManager.opts;
          this.theme = optionsManager.theme;
  }

  /**
   * Draws the parsed smiles data to a canvas element.
   *
   * @param {Object} data The tree returned by the smiles parser.
   * @param {(String|HTMLCanvasElement)} target The id of the HTML canvas element the structure is drawn to - or the element itself.
   * @param {String} themeName='dark' The name of the theme to use. Built-in themes are 'light' and 'dark'.
   * @param {Boolean} infoOnly=false Only output info on the molecule without drawing anything to the canvas.
   */
  draw(data: ParseTree, target: string | HTMLCanvasElement | HTMLElement, themeName: string = 'light', infoOnly: boolean = false): void {
      this.drawingManager.draw(data, target, themeName, infoOnly);
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
  getBridgedRings(): Ring[] {
      return this.ringManager.getBridgedRings();
  }

  /**
   * Returns an array containing all fused rings associated with this molecule.
   *
   * @returns {Ring[]} An array containing all fused rings associated with this molecule.
   */
  getFusedRings(): Ring[] {
      return this.ringManager.getFusedRings();
  }

  /**
   * Returns an array containing all spiros associated with this molecule.
   *
   * @returns {Ring[]} An array containing all spiros associated with this molecule.
   */
  getSpiros(): Ring[] {
      return this.ringManager.getSpiros();
  }

  /**
   * Analyze the graph to derive cis/trans intent for every stereogenic double bond.
   */
  buildCisTransMetadata(): void {
      this.cisTransManager.buildMetadata();
  }

  /**
   * Enforce the captured cis/trans intent on the current layout.
   */
  correctCisTransBonds(): void {
      this.cisTransManager.correctBondOrientations();
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
      this.drawingManager.rotateDrawing();
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
      return this.molecularInfoManager.getHeavyAtomCount();
  }

  /**
   * Returns the molecular formula of the loaded molecule as a string.
   *
   * @returns {String} The molecular formula.
   */
  getMolecularFormula(data: ParseTree | Graph | null = null): string {
      return this.molecularInfoManager.getMolecularFormula(data);
  }

  /**
   * Returns complete positioning and structural data for the loaded molecule.
   * This data includes everything needed to implement custom rendering algorithms:
   * vertices (atoms) with positions and angles, edges (bonds) with types and stereochemistry,
   * and ring information.
   *
   * The output format is versioned for stability. Version is derived from package.json major version.
   *
   * @returns {Object} An object containing:
   *   - version: Format version number (from package.json major version)
   *   - vertices: Array of vertex objects with positions, angles, and atom data
   *   - edges: Array of edge objects with bond types and stereochemistry
   *   - rings: Array of ring member arrays
   *   - metadata: Graph metadata (counts, mappings, flags)
   *
   * @example
   * const posData = drawer.getPositionData();
   * // posData.version === 2 (if package version is 2.x.x)
   * // posData.vertices[0].position === { x: 150.5, y: 200.3 }
   * // posData.edges[0].bondType === '='
   */
  getPositionData(): PositionData {
      if (!this.graph) {
          return {
              version: POSITION_DATA_VERSION,
              vertices: [],
              edges: [],
              rings: [],
              metadata: {
                  vertexCount: 0,
                  edgeCount: 0,
                  ringCount: 0,
                  isomeric: false
              }
          };
      }

      // Serialize vertices with comprehensive atom data
      const vertices = this.graph.vertices.map((v) => ({
          // Vertex topology
          id: v.id,
          parentVertexId: v.parentVertexId,
          children: v.children ? [...v.children] : [],
          spanningTreeChildren: v.spanningTreeChildren ? [...v.spanningTreeChildren] : [],
          edges: v.edges ? [...v.edges] : [],
          neighbours: v.neighbours ? [...v.neighbours] : [],
          neighbourCount: v.neighbourCount,

          // Positioning data
          position: v.position ? { x: v.position.x, y: v.position.y } : { x: 0, y: 0 },
          previousPosition: v.previousPosition ? { x: v.previousPosition.x, y: v.previousPosition.y } : { x: 0, y: 0 },
          positioned: v.positioned,
          forcePositioned: v.forcePositioned,
          angle: v.angle,
          dir: v.dir,

          // Atom data from v.value
          value: v.value ? {
              idx: v.value.idx,
              element: v.value.element,
              drawExplicit: v.value.drawExplicit,
              isDrawn: v.value.isDrawn,
              bondType: v.value.bondType,
              branchBond: v.value.branchBond,
              ringbonds: v.value.ringbonds ? [...v.value.ringbonds] : [],
              rings: v.value.rings ? [...v.value.rings] : [],
              bondCount: v.value.bondCount,
              class: v.value.class,
              neighbouringElements: v.value.neighbouringElements ? [...v.value.neighbouringElements] : [],

              // Ring membership
              isBridge: v.value.isBridge,
              isBridgeNode: v.value.isBridgeNode,
              bridgedRing: v.value.bridgedRing,
              originalRings: v.value.originalRings ? [...v.value.originalRings] : [],
              anchoredRings: v.value.anchoredRings ? [...v.value.anchoredRings] : [],
              isConnectedToRing: v.value.isConnectedToRing,
              isPartOfAromaticRing: v.value.isPartOfAromaticRing,

              // Bracket notation data
              bracket: v.value.bracket ? {
                  hcount: v.value.bracket.hcount,
                  charge: v.value.bracket.charge,
                  isotope: v.value.bracket.isotope,
                  class: v.value.bracket.class
              } : null,

              // Stereochemistry
              plane: v.value.plane,
              chirality: v.value.chirality,
              isStereoCenter: v.value.isStereoCenter,
              priority: v.value.priority,
              mainChain: v.value.mainChain,
              hydrogenDirection: v.value.hydrogenDirection,
              hasHydrogen: v.value.hasHydrogen,
              subtreeDepth: v.value.subtreeDepth,

              // Pseudo elements
              attachedPseudoElements: v.value.attachedPseudoElements ? { ...v.value.attachedPseudoElements } : {},
              hasAttachedPseudoElements: v.value.hasAttachedPseudoElements,

              // Custom annotations
              annotations: v.value.annotations ? v.value.annotations.toJSON() : {}
          } : null
      }));

      // Serialize edges with comprehensive bond data
      const edges = this.graph.edges.map((e) => ({
          id: e.id,
          sourceId: e.sourceId,
          targetId: e.targetId,
          weight: e.weight,
          bondType: e.bondType,
          isPartOfAromaticRing: e.isPartOfAromaticRing,
          center: e.center,
      wedge: e.wedge,
          stereoSymbol: e.stereoSymbol,
          stereoSourceId: e.stereoSourceId,
          cisTrans: e.cisTrans,
          cisTransNeighbours: Object.entries(e.cisTransNeighbours || {}).reduce((acc, [key, value]) => {
              acc[Number(key)] = { ...value };
              return acc;
          }, {} as Record<number, Record<number, CisTransOrientation>>),
          cisTransSource: e.cisTransSource ?? null,
          chiralDict: Object.entries(e.chiralDict || {}).reduce((acc, [key, value]) => {
              acc[Number(key)] = { ...value };
              return acc;
          }, {} as Record<number, Record<number, CisTransOrientation>>)
      }));

      // Serialize ring data
      const rings = this.rings ? this.rings.map((ring) => ({
          id: ring.id,
          members: ring.members ? [...ring.members] : [],
          isBridged: ring.isBridged,
          isPartOfBridged: ring.isPartOfBridged,
          isFused: ring.isFused,
          isSpiro: ring.isSpiro,
          neighbours: ring.neighbours ? [...ring.neighbours] : [],
          center: ring.center ? { x: ring.center.x, y: ring.center.y } : null
      })) : [];

      return {
          version: POSITION_DATA_VERSION,
          vertices: vertices,
          edges: edges,
          rings: rings,
          metadata: {
              vertexCount: this.graph.vertices.length,
              edgeCount: this.graph.edges.length,
              ringCount: this.rings ? this.rings.length : 0,
              atomIdxToVertexId: this.graph.atomIdxToVertexId ? [...this.graph.atomIdxToVertexId] : [],
              isomeric: this.graph.isomeric
          }
      };
  }

  registerAtomAnnotation(name: string, defaultValue: unknown = null): void {
      const clonedDefault = this.cloneAnnotationValue(defaultValue);
      this.atomAnnotationDefaults.set(name, clonedDefault);
      this.atomAnnotationNames.add(name);

      if (!this.graph) {
          return;
      }

      for (const vertex of this.graph.vertices) {
          if (!vertex || !vertex.value) {
              continue;
          }
          const annotations = vertex.value.annotations;
          if (!annotations.hasAnnotation(name)) {
              annotations.addAnnotation(name, this.cloneAnnotationValue(clonedDefault));
          }
      }
  }

  setAtomAnnotation(vertexId: number, name: string, value: unknown): void {
      if (!this.graph) {
          throw new Error('Cannot set atom annotation before a graph is initialized.');
      }

      const vertex = this.getVertexById(vertexId);
      if (!vertex || !vertex.value) {
          throw new Error(`Vertex with id ${vertexId} does not exist.`);
      }

      this.atomAnnotationNames.add(name);
      const annotations = vertex.value.annotations;

      if (!annotations.hasAnnotation(name)) {
          if (this.atomAnnotationDefaults.has(name)) {
              annotations.addAnnotation(name, this.cloneAnnotationValue(this.atomAnnotationDefaults.get(name)));
          } else {
              annotations.addAnnotation(name, null);
          }
      }

      annotations.setAnnotation(name, value);
  }

  getAtomAnnotation(vertexId: number, name: string): unknown {
      if (!this.graph) {
          return undefined;
      }

      const vertex = this.getVertexById(vertexId);
      if (!vertex || !vertex.value) {
          return undefined;
      }

      return vertex.value.annotations.getAnnotation(name);
  }

  setAtomAnnotationByAtomIndex(atomIdx: number, name: string, value: unknown): void {
      const vertexId = this.getVertexIdFromAtomIndex(atomIdx);
      if (vertexId === null) {
          throw new Error(`No vertex found for atom index ${atomIdx}.`);
      }
      this.setAtomAnnotation(vertexId, name, value);
  }

  getAtomAnnotationByAtomIndex(atomIdx: number, name: string): unknown {
      const vertexId = this.getVertexIdFromAtomIndex(atomIdx);
      if (vertexId === null) {
          return undefined;
      }
      return this.getAtomAnnotation(vertexId, name);
  }

  listAtomAnnotationNames(): string[] {
      return Array.from(this.atomAnnotationNames.values());
  }

  getAtomAnnotations(vertexId: number): Record<string, unknown> {
      if (!this.graph) {
          return {};
      }

      const vertex = this.getVertexById(vertexId);
      if (!vertex || !vertex.value) {
          return {};
      }

      return vertex.value.annotations.toJSON();
  }

  /**
   * Returns the type of the ringbond (e.g. '=' for a double bond). The ringbond represents the break in a ring introduced when creating the MST. If the two vertices supplied as arguments are not part of a common ringbond, the method returns null.
   *
   * @param {Vertex} vertexA A vertex.
   * @param {Vertex} vertexB A vertex.
   * @returns {(String|null)} Returns the ringbond type or null, if the two supplied vertices are not connected by a ringbond.
   */
  getRingbondType(vertexA: Vertex, vertexB: Vertex): BondType | null {
      return this.ringManager.getRingbondType(vertexA, vertexB);
  }

  initDraw(data: ParseTree, themeName: string, infoOnly: boolean, highlight_atoms: AtomHighlight[]): void {
      this.initializationManager.initDraw(data, themeName, infoOnly, highlight_atoms);
      this.applyAtomAnnotationDefaultsToGraph();
  }

  processGraph(): void {
      this.graphProcessingManager.processGraph();
  }

  /**
   * Initializes rings and ringbonds for the current molecule.
   */
  initRings(): void {
      this.ringManager.initRings();
  }

  initHydrogens(): void {
      this.initializationManager.initHydrogens();
  }

  /**
   * Returns all rings connected by bridged bonds starting from the ring with the supplied ring id.
   *
   * @param {Number} ringId A ring id.
   * @returns {Number[]} An array containing all ring ids of rings part of a bridged ring system.
   */
  getBridgedRingRings(ringId: number): number[] {
      return this.ringManager.bridgedRingHandler.getBridgedRingRings(ringId);
  }

  /**
   * Checks whether or not a ring is part of a bridged ring.
   *
   * @param {Number} ringId A ring id.
   * @returns {Boolean} A boolean indicating whether or not the supplied ring (by id) is part of a bridged ring system.
   */
  isPartOfBridgedRing(ringId: number): boolean {
      return this.ringManager.bridgedRingHandler.isPartOfBridgedRing(ringId);
  }

  /**
   * Creates a bridged ring.
   *
   * @param {Number[]} ringIds An array of ids of rings involved in the bridged ring.
   * @param {Number} sourceVertexId The vertex id to start the bridged ring discovery from.
   * @returns {Ring} The bridged ring.
   */
  createBridgedRing(ringIds: number[], sourceVertexId: number): Ring {
      return this.ringManager.bridgedRingHandler.createBridgedRing(ringIds, sourceVertexId);
  }

  /**
   * Checks whether or not two vertices are in the same ring.
   *
   * @param {Vertex} vertexA A vertex.
   * @param {Vertex} vertexB A vertex.
   * @returns {Boolean} A boolean indicating whether or not the two vertices are in the same ring.
   */
  areVerticesInSameRing(vertexA: Vertex, vertexB: Vertex): boolean {
      return this.ringManager.areVerticesInSameRing(vertexA, vertexB);
  }

  /**
   * Returns an array of ring ids shared by both vertices.
   *
   * @param {Vertex} vertexA A vertex.
   * @param {Vertex} vertexB A vertex.
   * @returns {Number[]} An array of ids of rings shared by the two vertices.
   */
  getCommonRings(vertexA: Vertex, vertexB: Vertex): number[] {
      return this.ringManager.getCommonRings(vertexA, vertexB);
  }

  /**
   * Returns the aromatic or largest ring shared by the two vertices.
   *
   * @param {Vertex} vertexA A vertex.
   * @param {Vertex} vertexB A vertex.
   * @returns {(Ring|null)} If an aromatic common ring exists, that ring, else the largest (non-aromatic) ring, else null.
   */
  getLargestOrAromaticCommonRing(vertexA: Vertex, vertexB: Vertex): Ring | null {
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
  getVerticesAt(position: Vector2, radius: number, excludeVertexId: number): number[] {
      return this.positioningManager.getVerticesAt(position, radius, excludeVertexId);
  }

  /**
   * Returns the closest vertex (connected as well as unconnected).
   *
   * @param {Vertex} vertex The vertex of which to find the closest other vertex.
   * @returns {Vertex} The closest vertex.
   */
  getClosestVertex(vertex: Vertex): Vertex {
      return this.positioningManager.getClosestVertex(vertex);
  }

  /**
   * Add a ring to this representation of a molecule.
   *
   * @param {Ring} ring A new ring.
   * @returns {Number} The ring id of the new ring.
   */
  addRing(ring: Ring): number {
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
  getRing(ringId: number): Ring | null {
      return this.ringManager.getRing(ringId);
  }

  /**
   * Add a ring connection to this representation of a molecule.
   *
   * @param {RingConnection} ringConnection A new ringConnection.
   * @returns {Number} The ring connection id of the new ring connection.
   */
  addRingConnection(ringConnection: RingConnection): number {
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
  getRingConnection(id: number): RingConnection | null {
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
  getOverlapScore(): OverlapScore {
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
  chooseSide(vertexA: Vertex, vertexB: Vertex, sides: Vector2[]): SideChoice {
      return this.overlapResolver.chooseSide(vertexA, vertexB, sides);
  }

  /**
   * Sets the center for a ring.
   *
   * @param {Ring} ring A ring.
   */
  setRingCenter(ring: Ring): void {
      this.ringManager.setRingCenter(ring);
  }

  /**
   * Gets the center of a ring contained within a bridged ring and containing a given vertex.
   *
   * @param {Ring} ring A bridged ring.
   * @param {Vertex} vertex A vertex.
   * @returns {Vector2} The center of the subring that containing the vertex.
   */
  getSubringCenter(ring: Ring, vertex: Vertex): Vector2 {
      return this.ringManager.getSubringCenter(ring, vertex);
  }

  /**
   * Draw the actual edges as bonds to the canvas.
   *
   * @param {Boolean} debug A boolean indicating whether or not to draw debug helpers.
   */
  drawEdges(debug: boolean): void {
      this.drawingManager.drawEdges(debug);
  }

  /**
   * Draw the an edge as a bonds to the canvas.
   *
   * @param {Number} edgeId An edge id.
   * @param {Boolean} debug A boolean indicating whether or not to draw debug helpers.
   */
  drawEdge(edgeId: number, debug: boolean): void {
      this.drawingManager.drawEdge(edgeId, debug);
  }

  /**
   * Draws the vertices representing atoms to the canvas.
   *
   * @param {Boolean} debug A boolean indicating whether or not to draw debug messages to the canvas.
   */
  drawVertices(debug: boolean): void {
      this.drawingManager.drawVertices(debug);
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
  createRing(ring: Ring, center: Vector2 | null = null, startVertex: Vertex | null = null, previousVertex: Vertex | null = null): void {
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
  rotateSubtree(vertexId: number, parentVertexId: number, angle: number, center: Vector2): void {
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
  getSubtreeOverlapScore(vertexId: number, parentVertexId: number, vertexOverlapScores: Float32Array): SubtreeOverlapScore {
      return this.overlapResolver.getSubtreeOverlapScore(vertexId, parentVertexId, vertexOverlapScores);
  }

  /**
   * Returns the current (positioned vertices so far) center of mass.
   *
   * @returns {Vector2} The current center of mass.
   */
  getCurrentCenterOfMass(): Vector2 {
      return this.overlapResolver.getCurrentCenterOfMass();
  }

  /**
   * Returns the current (positioned vertices so far) center of mass in the neighbourhood of a given position.
   *
   * @param {Vector2} vec The point at which to look for neighbours.
   * @param {Number} [r=currentBondLength*2.0] The radius of vertices to include.
   * @returns {Vector2} The current center of mass.
   */
  getCurrentCenterOfMassInNeigbourhood(vec: Vector2, r: number = this.opts.bondLength * 2.0): Vector2 {
      return this.overlapResolver.getCurrentCenterOfMassInNeigbourhood(vec, r);
  }

  /**
   * Resolve primary (exact) overlaps, such as two vertices that are connected to the same ring vertex.
   */
  resolvePrimaryOverlaps(): void {
      this.overlapResolver.resolvePrimaryOverlaps();
  }

  /**
   * Run the optional finetuning overlap resolution pass.
   */
  resolveFinetuneOverlaps(): void {
      this.overlapResolver.resolveFinetuneOverlaps();
  }

  /**
   * Resolve secondary overlaps. Those overlaps are due to the structure turning back on itself.
   *
   * @param {Object[]} scores An array of objects sorted descending by score.
   * @param {Number} scores[].id A vertex id.
   * @param {Number} scores[].score The overlap score associated with the vertex id.
   */
  resolveSecondaryOverlaps(scores: VertexOverlapScoreEntry[]): void {
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
  createNextBond(vertex: Vertex, previousVertex: Vertex | null = null, angle: number = 0.0, originShortest: boolean = false, skipPositioning: boolean = false): void {
      this.positioningManager.createNextBond(vertex, previousVertex, angle, originShortest, skipPositioning);
  }

  /**
   * Gets the vetex sharing the edge that is the common bond of two rings.
   *
   * @param {Vertex} vertex A vertex.
   * @returns {(Vertex|null)} The vertex sharing the edge that is the common bond of two rings with the vertex provided or null, if none.
   */
  getCommonRingbondNeighbour(vertex: Vertex): Vertex | null {
      return this.ringManager.getCommonRingbondNeighbour(vertex);
  }

  /**
   * Check if a vector is inside any ring.
   *
   * @param {Vector2} vec A vector.
   * @returns {Boolean} A boolean indicating whether or not the point (vector) is inside any of the rings associated with the current molecule.
   */
  isPointInRing(vec: Vector2): boolean {
      return this.ringManager.isPointInRing(vec);
  }

  /**
   * Check whether or not an edge is part of a ring.
   *
   * @param {Edge} edge An edge.
   * @returns {Boolean} A boolean indicating whether or not the edge is part of a ring.
   */
  isEdgeInRing(edge: Edge): boolean {
      return this.ringManager.isEdgeInRing(edge);
  }

  /**
   * Check whether or not an edge is rotatable.
   *
   * @param {Edge} edge An edge.
   * @returns {Boolean} A boolean indicating whether or not the edge is rotatable.
   */
  isEdgeRotatable(edge: Edge): boolean {
      return this.graphProcessingManager.isEdgeRotatable(edge);
  }

  /**
   * Check whether or not a ring is an implicitly defined aromatic ring (lower case smiles).
   *
   * @param {Ring} ring A ring.
   * @returns {Boolean} A boolean indicating whether or not a ring is implicitly defined as aromatic.
   */
  isRingAromatic(ring: Ring): boolean {
      return this.ringManager.isRingAromatic(ring);
  }

  getAromaticRings(): Ring[] {
      return this.ringManager.getAromaticRings();
  }

  /**
   * Get the normals of an edge.
   *
   * @param {Edge} edge An edge.
   * @returns {Vector2[]} An array containing two vectors, representing the normals.
   */
  getEdgeNormals(edge: Edge): Vector2[] {
      return this.drawingManager.getEdgeNormals(edge);
  }

  /**
   * Returns an array of vertices that are neighbouring a vertix but are not members of a ring (including bridges).
   *
   * @param {Number} vertexId A vertex id.
   * @returns {Vertex[]} An array of vertices.
   */
  getNonRingNeighbours(vertexId: number): Vertex[] {
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
  visitStereochemistry(vertexId: number, previousVertexId: number, visited: Uint8Array, priority: number[][], maxDepth: number, depth: number, parentAtomicNumber: number = 0): void {
      this.stereochemistryManager.visitStereochemistry(vertexId, previousVertexId, visited, priority, maxDepth, depth, parentAtomicNumber);
  }

  /**
   * Creates pseudo-elements (such as Et, Me, Ac, Bz, ...) at the position of the carbon sets
   * the involved atoms not to be displayed.
   */
  initPseudoElements(): void {
      this.pseudoElementManager.initPseudoElements();
  }

  private applyAtomAnnotationDefaultsToGraph(): void {
      if (!this.graph) {
          return;
      }

      for (const [name, defaultValue] of this.atomAnnotationDefaults.entries()) {
          this.atomAnnotationNames.add(name);
          for (const vertex of this.graph.vertices) {
              if (!vertex || !vertex.value) {
                  continue;
              }
              const annotations = vertex.value.annotations;
              if (!annotations.hasAnnotation(name)) {
                  annotations.addAnnotation(name, this.cloneAnnotationValue(defaultValue));
              }
          }
      }
  }

  private getVertexById(vertexId: number): Vertex | null {
      if (!this.graph) {
          return null;
      }

      if (vertexId < 0 || vertexId >= this.graph.vertices.length) {
          return null;
      }

      return this.graph.vertices[vertexId];
  }

  private getVertexIdFromAtomIndex(atomIdx: number): number | null {
      if (!this.graph || !this.graph.atomIdxToVertexId) {
          return null;
      }

      const vertexId = this.graph.atomIdxToVertexId[atomIdx];
      if (vertexId === undefined || vertexId === null) {
          return null;
      }

      return vertexId;
  }

  private cloneAnnotationValue<T>(value: T): T {
      if (value === null || typeof value !== 'object') {
          return value;
      }

      if (Array.isArray(value)) {
          return value.map((entry) => this.cloneAnnotationValue(entry)) as unknown as T;
      }

      return { ...(value as Record<string, unknown>) } as unknown as T;
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

    get rings(): Ring[] {
        return this.ringManager.rings;
    }

    set rings(value: Ring[]) {
        this.ringManager.rings = value;
    }

    get ringConnections(): RingConnection[] {
        return this.ringManager.ringConnections;
    }

    set ringConnections(value: RingConnection[]) {
        this.ringManager.ringConnections = value;
    }

    get originalRings(): Ring[] {
        return this.ringManager.originalRings;
    }

    set originalRings(value: Ring[]) {
        this.ringManager.originalRings = value;
    }

    get originalRingConnections(): RingConnection[] {
        return this.ringManager.originalRingConnections;
    }

    set originalRingConnections(value: RingConnection[]) {
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
    private drawingManager: DrawingManager;
    private pseudoElementManager: PseudoElementManager;
    private molecularInfoManager: MolecularInfoManager;
    private initializationManager: InitializationManager;
    private graphProcessingManager: GraphProcessingManager;
}

export = MolecularPreprocessor;
