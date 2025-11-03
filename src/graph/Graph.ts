import MathHelper = require('../utils/MathHelper');
import GraphMatrixOperations = require('./GraphMatrixOperations');
import GraphAlgorithms = require('./GraphAlgorithms');
import KamadaKawaiLayout = require('../algorithms/KamadaKawaiLayout');
import Vector2 = require('./Vector2');
import Vertex = require('./Vertex');
import Edge = require('./Edge');
import Ring = require('./Ring');
import Atom = require('./Atom');

type ParseTree = any;

/**
 * A class representing the molecular graph. 
 * 
 * @property {Vertex[]} vertices The vertices of the graph.
 * @property {Edge[]} edges The edges of this graph.
 * @property {Number[]} atomIdxToVertexId A map mapping atom indices to vertex ids.
 * @property {Object} vertexIdsToEdgeId A map mapping vertex ids to the edge between the two vertices. The key is defined as vertexAId + '_' + vertexBId.
 * @property {Boolean} isometric A boolean indicating whether or not the SMILES associated with this graph is isometric.
 */
class Graph {
  vertices: Vertex[];
  edges: Edge[];
  atomIdxToVertexId: number[];
  vertexIdsToEdgeId: Record<string, number>;
  isomeric: boolean;
  _atomIdx: number;
  _time: number;
  matrixOps: GraphMatrixOperations;
  algorithms: GraphAlgorithms;
  layout: KamadaKawaiLayout;

  /**
   * The constructor of the class Graph.
   *
   * @param {Object} parseTree A SMILES parse tree.
   * @param {Boolean} [isomeric=false] A boolean specifying whether or not the SMILES is isomeric.
   */
  constructor(parseTree: ParseTree, isomeric: boolean = false) {
    this.vertices = Array();
    this.edges = Array();
    this.atomIdxToVertexId = Array();
    this.vertexIdsToEdgeId = {};
    this.isomeric = isomeric;

    // Used to assign indices to the heavy atoms.
    this._atomIdx = 0;

    // Used for the bridge detection algorithm
    this._time = 0;
    this._init(parseTree);
      this.matrixOps = new GraphMatrixOperations(this);
      this.algorithms = new GraphAlgorithms(this);
      this.layout = new KamadaKawaiLayout(this);
  }

  /**
   * PRIVATE FUNCTION. Initializing the graph from the parse tree.
   *
   * @param {Object} node The current node in the parse tree.
   * @param {?Number} parentVertexId=null The id of the previous vertex.
   * @param {Boolean} isBranch=false Whether or not the bond leading to this vertex is a branch bond. Branches are represented by parentheses in smiles (e.g. CC(O)C).
   */
  _init(node: ParseTree, order: number = 0, parentVertexId: number | null = null, isBranch: boolean = false): void {
    // Create a new vertex object
    const element = node.atom.element ? node.atom.element : node.atom;
    let atom = new Atom(element, node.bond);

    if (element !== 'H' || (!node.hasNext && parentVertexId === null)) {
      atom.idx = this._atomIdx;
      this._atomIdx++;
    }

    atom.branchBond = node.branchBond;
    atom.ringbonds = node.ringbonds;
    atom.bracket = node.atom.element ? node.atom : null;
    atom.class = node.atom.class

    let vertex = new Vertex(atom);
    let parentVertex = this.vertices[parentVertexId];

    this.addVertex(vertex);

    if (atom.idx !== null) {
      this.atomIdxToVertexId.push(vertex.id);
    }

    // Add the id of this node to the parent as child
    if (parentVertexId !== null) {
      vertex.setParentVertexId(parentVertexId);
      vertex.value.addNeighbouringElement(parentVertex.value.element);
      parentVertex.addChild(vertex.id);
      parentVertex.value.addNeighbouringElement(atom.element);

      // In addition create a spanningTreeChildren property, which later will
      // not contain the children added through ringbonds
      parentVertex.spanningTreeChildren.push(vertex.id);

      // Add edge between this node and its parent
      let edge = new Edge(parentVertexId, vertex.id, 1);
      let vertexId = null;

      if (isBranch) {
        edge.setBondType(vertex.value.branchBond || '-');
        vertexId = vertex.id;
        edge.setBondType(vertex.value.branchBond || '-');
        vertexId = vertex.id;
      } else {
        edge.setBondType(parentVertex.value.bondType || '-');
        vertexId = parentVertex.id;
      }

      let edgeId = this.addEdge(edge);
    }

    let offset = node.ringbondCount + 1;

    if (atom.bracket) {
      offset += atom.bracket.hcount;
    }

    let stereoHydrogens = 0;
    if (atom.bracket && atom.bracket.chirality) {
      atom.isStereoCenter = true;
      stereoHydrogens = atom.bracket.hcount;
      for (var i = 0; i < stereoHydrogens; i++) {
        this._init({
          atom: 'H',
          isBracket: 'false',
          branches: Array(),
          branchCount: 0,
          ringbonds: Array(),
          ringbondCount: false,
          next: null,
          hasNext: false,
          bond: '-'
        }, i, vertex.id, true);
      }
    }

    for (var i = 0; i < node.branchCount; i++) {
      this._init(node.branches[i], i + offset, vertex.id, true);
    }

    if (node.hasNext) {
      this._init(node.next, node.branchCount + offset, vertex.id);
    }
  }

  /**
   * Clears all the elements in this graph (edges and vertices).
   */
  clear(): void {
    this.vertices = Array();
    this.edges = Array();
    this.vertexIdsToEdgeId = {};
  }

  /**
   * Add a vertex to the graph.
   *
   * @param {Vertex} vertex A new vertex.
   * @returns {Number} The vertex id of the new vertex.
   */
  addVertex(vertex: Vertex): number {
    vertex.id = this.vertices.length;
    this.vertices.push(vertex);

    return vertex.id;
  }

  /**
   * Add an edge to the graph.
   *
   * @param {Edge} edge A new edge.
   * @returns {Number} The edge id of the new edge.
   */
  addEdge(edge: Edge): number {
    let source = this.vertices[edge.sourceId];
    let target = this.vertices[edge.targetId];

    edge.id = this.edges.length;
    this.edges.push(edge);

    this.vertexIdsToEdgeId[edge.sourceId + '_' + edge.targetId] = edge.id;
    this.vertexIdsToEdgeId[edge.targetId + '_' + edge.sourceId] = edge.id;
    edge.isPartOfAromaticRing = source.value.isPartOfAromaticRing && target.value.isPartOfAromaticRing;

    source.value.bondCount += edge.weight;
    target.value.bondCount += edge.weight;

    source.edges.push(edge.id);
    target.edges.push(edge.id);

    return edge.id;
  }

  /**
   * Returns the edge between two given vertices.
   *
   * @param {Number} vertexIdA A vertex id.
   * @param {Number} vertexIdB A vertex id.
   * @returns {(Edge|null)} The edge or, if no edge can be found, null.
   */
  getEdge(vertexIdA: number, vertexIdB: number): Edge | null {
    let edgeId = this.vertexIdsToEdgeId[vertexIdA + '_' + vertexIdB];

    return edgeId === undefined ? null : this.edges[edgeId];
  }

  /**
   * Returns the ids of edges connected to a vertex.
   *
   * @param {Number} vertexId A vertex id.
   * @returns {Number[]} An array containing the ids of edges connected to the vertex.
   */
  getEdges(vertexId: number): number[] {
    let edgeIds = Array();
    let vertex = this.vertices[vertexId];

    for (var i = 0; i < vertex.neighbours.length; i++) {
      edgeIds.push(this.vertexIdsToEdgeId[vertexId + '_' + vertex.neighbours[i]]);
    }

    return edgeIds;
  }


  /**
   * Check whether or not two vertices are connected by an edge.
   *
   * @param {Number} vertexIdA A vertex id.
   * @param {Number} vertexIdB A vertex id.
   * @returns {Boolean} A boolean indicating whether or not two vertices are connected by an edge.
   */
  hasEdge(vertexIdA: number, vertexIdB: number): boolean {
    return this.vertexIdsToEdgeId[vertexIdA + '_' + vertexIdB] !== undefined
  }

  /**
   * Returns an array containing the vertex ids of this graph.
   *
   * @returns {Number[]} An array containing all vertex ids of this graph.
   */
  getVertexList(): number[] {
    let arr = [this.vertices.length];

    for (var i = 0; i < this.vertices.length; i++) {
      arr[i] = this.vertices[i].id;
    }

    return arr;
  }

  /**
   * Returns an array containing source, target arrays of this graphs edges.
   *
   * @returns {Array[]} An array containing source, target arrays of this graphs edges. Example: [ [ 2, 5 ], [ 6, 9 ] ].
   */
  getEdgeList(): number[][] {
    let arr = Array(this.edges.length);

    for (var i = 0; i < this.edges.length; i++) {
      arr[i] = [this.edges[i].sourceId, this.edges[i].targetId];
    }

    return arr;
  }

  /**
   * Get the adjacency matrix of the graph.
   *
   * @returns {Array[]} The adjancency matrix of the molecular graph.
   */
  getAdjacencyMatrix(): number[][] {
      return this.matrixOps.getAdjacencyMatrix();
  }

  /**
   * Get the adjacency matrix of the graph with all bridges removed (thus the components). Thus the remaining vertices are all part of ring systems.
   *
   * @returns {Array[]} The adjancency matrix of the molecular graph with all bridges removed.
   */
  getComponentsAdjacencyMatrix(): number[][] {
      return this.matrixOps.getComponentsAdjacencyMatrix();
  }

  /**
   * Get the adjacency matrix of a subgraph.
   *
   * @param {Number[]} vertexIds An array containing the vertex ids contained within the subgraph.
   * @returns {Array[]} The adjancency matrix of the subgraph.
   */
  getSubgraphAdjacencyMatrix(vertexIds: number[]): number[][] {
      return this.matrixOps.getSubgraphAdjacencyMatrix(vertexIds);
  }

  /**
   * Get the distance matrix of the graph.
   *
   * @returns {Array[]} The distance matrix of the graph.
   */
  getDistanceMatrix(): number[][] {
      return this.matrixOps.getDistanceMatrix();
  }

  /**
   * Get the distance matrix of a subgraph.
   *
   * @param {Number[]} vertexIds An array containing the vertex ids contained within the subgraph.
   * @returns {Array[]} The distance matrix of the subgraph.
   */
  getSubgraphDistanceMatrix(vertexIds: number[]): number[][] {
      return this.matrixOps.getSubgraphDistanceMatrix(vertexIds);
  }

  /**
   * Get the adjacency list of the graph.
   *
   * @returns {Array[]} The adjancency list of the graph.
   */
  getAdjacencyList(): number[][] {
      return this.matrixOps.getAdjacencyList();
  }

  /**
   * Get the adjacency list of a subgraph.
   *
   * @param {Number[]} vertexIds An array containing the vertex ids contained within the subgraph.
   * @returns {Array[]} The adjancency list of the subgraph.
   */
  getSubgraphAdjacencyList(vertexIds: number[]): number[][] {
      return this.matrixOps.getSubgraphAdjacencyList(vertexIds);
  }

  /**
   * Returns an array containing the edge ids of bridges. A bridge splits the graph into multiple components when removed.
   *
   * @returns {Number[]} An array containing the edge ids of the bridges.
   */
  getBridges(): number[][] {
      return this.algorithms.getBridges();
  }

  /**
   * Traverses the graph in breadth-first order.
   *
   * @param {Number} startVertexId The id of the starting vertex.
   * @param {Function} callback The callback function to be called on every vertex.
   */
  traverseBF(startVertexId: number, callback: (vertex: Vertex) => void): void {
      return this.algorithms.traverseBF(startVertexId, callback);
  }

  /**
   * Get the depth of a subtree in the direction opposite to the vertex specified as the parent vertex.
   *
   * @param {Number} vertexId A vertex id.
   * @param {Number} parentVertexId The id of a neighbouring vertex.
   * @returns {Number} The depth of the sub-tree.
   */
  getTreeDepth(vertexId: number | null, parentVertexId: number | null): number {
      return this.algorithms.getTreeDepth(vertexId, parentVertexId);
  }

  /**
   * Traverse a sub-tree in the graph.
   *
   * @param {Number} vertexId A vertex id.
   * @param {Number} parentVertexId A neighbouring vertex.
   * @param {Function} callback The callback function that is called with each visited as an argument.
   * @param {Number} [maxDepth=999999] The maximum depth of the recursion.
   * @param {Boolean} [ignoreFirst=false] Whether or not to ignore the starting vertex supplied as vertexId in the callback.
   * @param {Number} [depth=1] The current depth in the tree.
   * @param {Uint8Array} [visited=null] An array holding a flag on whether or not a node has been visited.
   */
  traverseTree(vertexId: number, parentVertexId: number, callback: (vertex: Vertex) => void, maxDepth: number = 999999, ignoreFirst: boolean = false, depth: number = 1, visited: Uint8Array | null = null): void {
      return this.algorithms.traverseTree(vertexId, parentVertexId, callback, maxDepth, ignoreFirst, depth, visited);
  }

  /**
   * Positiones the (sub)graph using Kamada and Kawais algorithm for drawing general undirected graphs. https://pdfs.semanticscholar.org/b8d3/bca50ccc573c5cb99f7d201e8acce6618f04.pdf
   * There are undocumented layout parameters. They are undocumented for a reason, so be very careful.
   * 
   * @param {Number[]} vertexIds An array containing vertexIds to be placed using the force based layout.
   * @param {Vector2} center The center of the layout.
   * @param {Number} startVertexId A vertex id. Should be the starting vertex - e.g. the first to be positioned and connected to a previously place vertex.
   * @param {Ring} ring The bridged ring associated with this force-based layout.
   */
  kkLayout(vertexIds: number[], center: Vector2, startVertexId: number, ring: Ring, bondLength: number,
    threshold: number = 0.1, innerThreshold: number = 0.1, maxIteration: number = 2000,
    maxInnerIteration: number = 50, maxEnergy: number = 1e9): void {
      return this.layout.layout(vertexIds, center, startVertexId, ring, bondLength, threshold, innerThreshold, maxIteration, maxInnerIteration, maxEnergy);
  }

  /**
   * Returns the connected components of the graph.
   * 
   * @param {Array[]} adjacencyMatrix An adjacency matrix.
   * @returns {Set[]} Connected components as sets.
   */
  static getConnectedComponents(adjacencyMatrix) {
      return GraphAlgorithms.getConnectedComponents(adjacencyMatrix);
  }

  /**
   * Returns the number of connected components for the graph. 
   * 
   * @param {Array[]} adjacencyMatrix An adjacency matrix.
   * @returns {Number} The number of connected components of the supplied graph.
   */
  static getConnectedComponentCount(adjacencyMatrix) {
      return GraphAlgorithms.getConnectedComponentCount(adjacencyMatrix);
  }
}

export = Graph