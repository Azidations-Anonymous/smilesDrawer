import MolecularPreprocessor from "./MolecularPreprocessor";
import MathHelper = require("../utils/MathHelper");
import { WedgeType, Chirality } from '../types/CommonTypes';

class StereochemistryManager {
    private drawer: MolecularPreprocessor;

    constructor(drawer: MolecularPreprocessor) {
        this.drawer = drawer;
    }

    annotateStereochemistry(): void {
        let maxDepth = 10;

        // For each stereo-center
        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          let vertex = this.drawer.graph.vertices[i];

          if (!vertex.value.isStereoCenter) {
            continue;
          }

          let neighbours = vertex.getNeighbours();
          let nNeighbours = neighbours.length;
          let priorities = Array(nNeighbours);

          for (var j = 0; j < nNeighbours; j++) {
            let visited = new Uint8Array(this.drawer.graph.vertices.length);
            let priority = Array(Array());
            visited[vertex.id] = 1;

            this.visitStereochemistry(neighbours[j], vertex.id, visited, priority, maxDepth, 0);

            // Sort each level according to atomic number
            for (var k = 0; k < priority.length; k++) {
              priority[k].sort(function (a, b) {
                return b - a
              });
            }

            priorities[j] = [j, priority];
          }

          let maxLevels = 0;
          let maxEntries = 0;
          for (var j = 0; j < priorities.length; j++) {
            if (priorities[j][1].length > maxLevels) {
              maxLevels = priorities[j][1].length;
            }

            for (var k = 0; k < priorities[j][1].length; k++) {
              if (priorities[j][1][k].length > maxEntries) {
                maxEntries = priorities[j][1][k].length;
              }
            }
          }

          for (var j = 0; j < priorities.length; j++) {
            let diff = maxLevels - priorities[j][1].length;
            for (var k = 0; k < diff; k++) {
              priorities[j][1].push([]);
            }

            // Break ties by the position in the SMILES string as per specification
            priorities[j][1].push([neighbours[j]]);

            // Make all same length. Fill with zeroes.
            for (var k = 0; k < priorities[j][1].length; k++) {
              let diff = maxEntries - priorities[j][1][k].length;

              for (var l = 0; l < diff; l++) {
                priorities[j][1][k].push(0);
              }
            }
          }

          priorities.sort(function (a, b) {
            for (var j = 0; j < a[1].length; j++) {
              for (var k = 0; k < a[1][j].length; k++) {
                if (a[1][j][k] > b[1][j][k]) {
                  return -1;
                } else if (a[1][j][k] < b[1][j][k]) {
                  return 1;
                }
              }
            }

            return 0;
          });

          let order = new Uint8Array(nNeighbours);
          for (var j = 0; j < nNeighbours; j++) {
            order[j] = priorities[j][0];
            vertex.value.priority = j;
          }

          // Check the angles between elements 0 and 1, and 0 and 2 to determine whether they are
          // drawn cw or ccw
          // TODO: OC(Cl)=[C@]=C(C)F currently fails here, however this is, IMHO, not a valid SMILES.
          let posA = this.drawer.graph.vertices[neighbours[order[0]]].position;
          let posB = this.drawer.graph.vertices[neighbours[order[1]]].position;
          let posC = this.drawer.graph.vertices[neighbours[order[2]]].position;

          let cwA = posA.relativeClockwise(posB, vertex.position);
          let cwB = posA.relativeClockwise(posC, vertex.position);

          // If the second priority is clockwise from the first, the ligands are drawn clockwise, since
          // The hydrogen can be drawn on either side
          let isCw = cwA === -1;

          let rotation = vertex.value.bracket.chirality === '@' ? -1 : 1;
          let rs: Chirality = MathHelper.parityOfPermutation(order) * rotation === 1 ? 'R' : 'S';

          // Flip the hydrogen direction when the drawing doesn't match the chirality.
          let wedgeA: WedgeType = 'down';
          let wedgeB: WedgeType = 'up';
          if (isCw && rs !== 'R' || !isCw && rs !== 'S') {
            vertex.value.hydrogenDirection = 'up';
            wedgeA = 'up';
            wedgeB = 'down';
          }

          if (vertex.value.hasHydrogen) {
            this.drawer.graph.getEdge(vertex.id, neighbours[order[order.length - 1]]).wedge = wedgeA;
          }

          // Get the shortest subtree to flip up / down. Ignore lowest priority
          // The rules are following:
          // 1. Do not draw wedge between two stereocenters
          // 2. Heteroatoms
          // 3. Draw outside ring
          // 4. Shortest subtree

          let wedgeOrder = new Array(neighbours.length - 1);
          let showHydrogen = vertex.value.rings.length > 1 && vertex.value.hasHydrogen;
          let offset = vertex.value.hasHydrogen ? 1 : 0;

          for (var j = 0; j < order.length - offset; j++) {
            wedgeOrder[j] = new Uint32Array(2);
            let neighbour = this.drawer.graph.vertices[neighbours[order[j]]];
            wedgeOrder[j][0] += neighbour.value.isStereoCenter ? 0 : 100000;
            // wedgeOrder[j][0] += neighbour.value.rings.length > 0 ? 0 : 10000;
            // Only add if in same ring, unlike above
            wedgeOrder[j][0] += this.drawer.areVerticesInSameRing(neighbour, vertex) ? 0 : 10000;
            wedgeOrder[j][0] += neighbour.value.isHeteroAtom() ? 1000 : 0;
            wedgeOrder[j][0] -= neighbour.value.subtreeDepth === 0 ? 1000 : 0;
            wedgeOrder[j][0] += 1000 - neighbour.value.subtreeDepth;
            wedgeOrder[j][1] = neighbours[order[j]];
          }


          wedgeOrder.sort(function (a, b) {
            if (a[0] > b[0]) {
              return -1;
            } else if (a[0] < b[0]) {
              return 1;
            }
            return 0;
          });

          // If all neighbours are in a ring, do not draw wedge, the hydrogen will be drawn.
          if (!showHydrogen) {
            let wedgeId = wedgeOrder[0][1];

            if (vertex.value.hasHydrogen) {
              this.drawer.graph.getEdge(vertex.id, wedgeId).wedge = wedgeB;
            } else {
              let wedge: WedgeType = wedgeB;

              for (var j = order.length - 1; j >= 0; j--) {
                if (wedge === wedgeA) {
                  wedge = wedgeB;
                } else {
                  wedge = wedgeA;
                }
                if (neighbours[order[j]] === wedgeId) {
                  break;
                }
              }

              this.drawer.graph.getEdge(vertex.id, wedgeId).wedge = wedge;
            }
          }

          vertex.value.chirality = rs;
        }
    }

    visitStereochemistry(vertexId: number, previousVertexId: number, visited: Uint8Array<ArrayBufferLike>, priority: number[][], maxDepth: number, depth: number, parentAtomicNumber: number = 0): void {
        visited[vertexId] = 1;
        let vertex = this.drawer.graph.vertices[vertexId];
        let atomicNumber = vertex.value.getAtomicNumber();

        if (priority.length <= depth) {
          priority.push(Array());
        }

        for (var i = 0; i < this.drawer.graph.getEdge(vertexId, previousVertexId).weight; i++) {
          priority[depth].push(parentAtomicNumber * 1000 + atomicNumber);
        }

        let neighbours = this.drawer.graph.vertices[vertexId].neighbours;

        for (var i = 0; i < neighbours.length; i++) {
          if (visited[neighbours[i]] !== 1 && depth < maxDepth - 1) {
            this.visitStereochemistry(neighbours[i], vertexId, visited.slice(), priority, maxDepth, depth + 1, atomicNumber);
          }
        }

        // Valences are filled with hydrogens and passed to the next level.
        if (depth < maxDepth - 1) {
          let bonds = 0;

          for (var i = 0; i < neighbours.length; i++) {
            bonds += this.drawer.graph.getEdge(vertexId, neighbours[i]).weight;
          }

          for (var i = 0; i < vertex.value.getMaxBonds() - bonds; i++) {
            if (priority.length <= depth + 1) {
              priority.push(Array());
            }

            priority[depth + 1].push(atomicNumber * 1000 + 1);
          }
        }
    }
}
export = StereochemistryManager;
