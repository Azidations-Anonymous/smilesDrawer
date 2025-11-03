import Graph = require('./Graph');
import Vertex = require('./Vertex');

/**
 * A class providing graph algorithms including bridge detection,
 * graph traversal, and connected component analysis.
 */
class GraphAlgorithms {
    constructor(private readonly graph: Graph) {
    }

    public getBridges(): number[][] {
        let length = this.graph.vertices.length;
        let visited = new Array(length);
        let disc = new Array(length);
        let low = new Array(length);
        let parent = new Array(length);
        let adj = this.graph.getAdjacencyList();
        let outBridges = Array();

        visited.fill(false);
        parent.fill(null);
        this.graph._time = 0;

        for (var i = 0; i < length; i++) {
          if (!visited[i]) {
            this._bridgeDfs(i, visited, disc, low, parent, adj, outBridges);
          }
        }

        return outBridges;
    }

    public traverseBF(startVertexId: number, callback: (vertex: import("/Users/ch/Develop/smilesDrawer/src/graph/Vertex")) => void): void {
        let length = this.graph.vertices.length;
        let visited = new Array(length);

        visited.fill(false);

        var queue = [startVertexId];

        while (queue.length > 0) {
          // JavaScripts shift() is O(n) ... bad JavaScript, bad!
          let u = queue.shift();
          let vertex = this.graph.vertices[u];

          callback(vertex);

          for (var i = 0; i < vertex.neighbours.length; i++) {
            let v = vertex.neighbours[i]
            if (!visited[v]) {
              visited[v] = true;
              queue.push(v);
            }
          }
        }
    }

    public getTreeDepth(vertexId: number, parentVertexId: number): number {
        if (vertexId === null || parentVertexId === null) {
          return 0;
        }

        let neighbours = this.graph.vertices[vertexId].getSpanningTreeNeighbours(parentVertexId);
        let max = 0;

        for (var i = 0; i < neighbours.length; i++) {
          let childId = neighbours[i];
          let d = this.getTreeDepth(childId, vertexId);

          if (d > max) {
            max = d;
          }
        }

        return max + 1;
    }

    public traverseTree(vertexId: number, parentVertexId: number, callback: (vertex: import("/Users/ch/Develop/smilesDrawer/src/graph/Vertex")) => void, maxDepth: number, ignoreFirst: boolean, depth: number, visited: Uint8Array<ArrayBufferLike>): void {
        if (visited === null) {
          visited = new Uint8Array(this.graph.vertices.length);
        }

        if (depth > maxDepth + 1 || visited[vertexId] === 1) {
          return;
        }

        visited[vertexId] = 1;

        let vertex = this.graph.vertices[vertexId];
        let neighbours = vertex.getNeighbours(parentVertexId);

        if (!ignoreFirst || depth > 1) {
          callback(vertex);
        }

        for (var i = 0; i < neighbours.length; i++) {
          this.traverseTree(neighbours[i], vertexId, callback, maxDepth, ignoreFirst, depth + 1, visited);
        }
    }

    private _bridgeDfs(u: number, visited: boolean[], disc: number[], low: number[], parent: number[], adj: number[][], outBridges: number[][]): void {
        visited[u] = true;
        disc[u] = low[u] = ++this.graph._time;

        for (var i = 0; i < adj[u].length; i++) {
          let v = adj[u][i];

          if (!visited[v]) {
            parent[v] = u;

            this._bridgeDfs(v, visited, disc, low, parent, adj, outBridges);

            low[u] = Math.min(low[u], low[v]);

            // If low > disc, we have a bridge
            if (low[v] > disc[u]) {
              outBridges.push([u, v]);
            }
          } else if (v !== parent[u]) {
            low[u] = Math.min(low[u], disc[v]);
          }
        }
    }

    public static getConnectedComponents(adjacencyMatrix: any) {
        let length = adjacencyMatrix.length;
        let visited = new Array(length);
        let components = new Array();
        let count = 0;

        visited.fill(false);

        for (var u = 0; u < length; u++) {
          if (!visited[u]) {
            let component = Array();
            visited[u] = true;
            component.push(u);
            count++;
            GraphAlgorithms._ccGetDfs(u, visited, adjacencyMatrix, component);
            if (component.length > 1) {
              components.push(component);
            }
          }
        }

        return components;
    }

    public static getConnectedComponentCount(adjacencyMatrix: any) {
        let length = adjacencyMatrix.length;
        let visited = new Array(length);
        let count = 0;

        visited.fill(false);

        for (var u = 0; u < length; u++) {
          if (!visited[u]) {
            visited[u] = true;
            count++;
            GraphAlgorithms._ccCountDfs(u, visited, adjacencyMatrix);
          }
        }

        return count;
    }

    private static _ccCountDfs(u: any, visited: any, adjacencyMatrix: any) {
        for (var v = 0; v < adjacencyMatrix[u].length; v++) {
          let c = adjacencyMatrix[u][v];

          if (!c || visited[v] || u === v) {
            continue;
          }

          visited[v] = true;
          GraphAlgorithms._ccCountDfs(v, visited, adjacencyMatrix);
        }
    }

    private static _ccGetDfs(u: any, visited: any, adjacencyMatrix: any, component: any) {
        for (var v = 0; v < adjacencyMatrix[u].length; v++) {
          let c = adjacencyMatrix[u][v];

          if (!c || visited[v] || u === v) {
            continue;
          }

          visited[v] = true;
          component.push(v);
          GraphAlgorithms._ccGetDfs(v, visited, adjacencyMatrix, component);
        }
    }
}

export = GraphAlgorithms;
