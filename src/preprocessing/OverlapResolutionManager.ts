import MolecularPreprocessor from "./MolecularPreprocessor";
import Vector2 = require("../graph/Vector2");
import Vertex = require('../graph/Vertex');
import Edge = require('../graph/Edge');
import ArrayHelper = require("../utils/ArrayHelper");
import MathHelper = require("../utils/MathHelper");
import { SideChoice, OverlapScore, SubtreeOverlapScore, VertexOverlapScoreEntry } from './MolecularDataTypes';

class OverlapResolutionManager {
    private drawer: MolecularPreprocessor;

    constructor(drawer: MolecularPreprocessor) {
        this.drawer = drawer;
    }

    getOverlapScore(): OverlapScore {
        let total = 0.0;
        let overlapScores = new Float32Array(this.drawer.graph.vertices.length);

        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          overlapScores[i] = 0;
        }

        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          var j = this.drawer.graph.vertices.length;
          while (--j > i) {
            let a = this.drawer.graph.vertices[i];
            let b = this.drawer.graph.vertices[j];

            if (!a.value.isDrawn || !b.value.isDrawn) {
              continue;
            }

            let dist = Vector2.subtract(a.position, b.position).lengthSq();

            if (dist < this.drawer.opts.bondLengthSq) {
              let weighted = (this.drawer.opts.bondLength - Math.sqrt(dist)) / this.drawer.opts.bondLength;
              total += weighted;
              overlapScores[i] += weighted;
              overlapScores[j] += weighted;
            }
          }
        }

        let sortable = Array();

        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          sortable.push({
            id: i,
            score: overlapScores[i]
          });
        }

        sortable.sort(function (a, b) {
          return b.score - a.score;
        });

        return {
          total: total,
          scores: sortable,
          vertexScores: overlapScores
        };
    }

    chooseSide(vertexA: Vertex, vertexB: Vertex, sides: Vector2[]): SideChoice {
        // Check which side has more vertices
        // Get all the vertices connected to the both ends
        let an = vertexA.getNeighbours(vertexB.id);
        let bn = vertexB.getNeighbours(vertexA.id);
        let anCount = an.length;
        let bnCount = bn.length;

        // All vertices connected to the edge vertexA to vertexB
        let tn = ArrayHelper.merge(an, bn);

        // Only considering the connected vertices
        let sideCount = [0, 0];

        for (var i = 0; i < tn.length; i++) {
          let v = this.drawer.graph.vertices[tn[i] as number].position;

          if (v.sameSideAs(vertexA.position, vertexB.position, sides[0])) {
            sideCount[0]++;
          } else {
            sideCount[1]++;
          }
        }

        // Considering all vertices in the graph, this is to resolve ties
        // from the above side counts
        let totalSideCount = [0, 0];

        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          let v = this.drawer.graph.vertices[i].position;

          if (v.sameSideAs(vertexA.position, vertexB.position, sides[0])) {
            totalSideCount[0]++;
          } else {
            totalSideCount[1]++;
          }
        }

        return {
          totalSideCount: totalSideCount,
          totalPosition: totalSideCount[0] > totalSideCount[1] ? 0 : 1,
          sideCount: sideCount,
          position: sideCount[0] > sideCount[1] ? 0 : 1,
          anCount: anCount,
          bnCount: bnCount
        };
    }

    resolvePrimaryOverlaps(): void {
        let overlaps = Array();
        let done = Array(this.drawer.graph.vertices.length);

        // Looking for overlaps created by two bonds coming out of a ring atom, which both point straight
        // away from the ring and are thus perfectly overlapping.
        for (var i = 0; i < this.drawer.rings.length; i++) {
          let ring = this.drawer.rings[i];

          for (var j = 0; j < ring.members.length; j++) {
            let vertex = this.drawer.graph.vertices[ring.members[j]];

            if (done[vertex.id]) {
              continue;
            }

            done[vertex.id] = true;

            let nonRingNeighbours = this.drawer.getNonRingNeighbours(vertex.id);

            if (nonRingNeighbours.length > 1) {
              // Look for rings where there are atoms with two bonds outside the ring (overlaps)
              let rings = Array();

              for (var k = 0; k < vertex.value.rings.length; k++) {
                rings.push(vertex.value.rings[k]);
              }

              overlaps.push({
                common: vertex,
                rings: rings,
                vertices: nonRingNeighbours
              });
            } else if (nonRingNeighbours.length === 1 && vertex.value.rings.length === 2) {
              // Look for bonds coming out of joined rings to adjust the angle, an example is: C1=CC(=CC=C1)[C@]12SCCN1CC1=CC=CC=C21
              // where the angle has to be adjusted to account for fused ring
              let rings = Array();

              for (var k = 0; k < vertex.value.rings.length; k++) {
                rings.push(vertex.value.rings[k]);
              }

              overlaps.push({
                common: vertex,
                rings: rings,
                vertices: nonRingNeighbours
              });
            }
          }
        }

        for (var i = 0; i < overlaps.length; i++) {
          let overlap = overlaps[i];

          if (overlap.vertices.length === 2) {
            let a = overlap.vertices[0];
            let b = overlap.vertices[1];

            if (!a.value.isDrawn || !b.value.isDrawn) {
              continue;
            }

            let angle = (2 * Math.PI - this.drawer.getRing(overlap.rings[0]).getAngle()) / 6.0;

            this.rotateSubtree(a.id, overlap.common.id, angle, overlap.common.position);
            this.rotateSubtree(b.id, overlap.common.id, -angle, overlap.common.position);

            // Decide which way to rotate the vertices depending on the effect it has on the overlap score
            let overlapScore = this.getOverlapScore();
            let subTreeOverlapA = this.getSubtreeOverlapScore(a.id, overlap.common.id, overlapScore.vertexScores);
            let subTreeOverlapB = this.getSubtreeOverlapScore(b.id, overlap.common.id, overlapScore.vertexScores);
            let total = subTreeOverlapA.value + subTreeOverlapB.value;

            this.rotateSubtree(a.id, overlap.common.id, -2.0 * angle, overlap.common.position);
            this.rotateSubtree(b.id, overlap.common.id, 2.0 * angle, overlap.common.position);

            overlapScore = this.getOverlapScore();
            subTreeOverlapA = this.getSubtreeOverlapScore(a.id, overlap.common.id, overlapScore.vertexScores);
            subTreeOverlapB = this.getSubtreeOverlapScore(b.id, overlap.common.id, overlapScore.vertexScores);

            if (subTreeOverlapA.value + subTreeOverlapB.value > total) {
              this.rotateSubtree(a.id, overlap.common.id, 2.0 * angle, overlap.common.position);
              this.rotateSubtree(b.id, overlap.common.id, -2.0 * angle, overlap.common.position);
            }
          } else if (overlap.vertices.length === 1) {
            if (overlap.rings.length === 2) {
              // TODO: Implement for more overlap resolution
              // console.log(overlap);
            }
          }
        }
    }

    resolveFinetuneOverlaps(): void {
        if (!this.drawer.opts.finetuneOverlap) {
          return;
        }

        if (this.drawer.totalOverlapScore <= this.drawer.opts.overlapSensitivity) {
          return;
        }

        const bondLengthSq = this.drawer.opts.bondLengthSq !== undefined
          ? this.drawer.opts.bondLengthSq
          : this.drawer.opts.bondLength * this.drawer.opts.bondLength;
        const threshold = 0.8 * bondLengthSq;
        const clashingPairs = this.findClashingVertices(threshold);

        if (clashingPairs.length === 0) {
          return;
        }

        const candidateEdgeIds = new Set<number>();

        for (const [vertexA, vertexB] of clashingPairs) {
          if (vertexA.id === null || vertexB.id === null) {
            continue;
          }

          const path = this.findShortestPath(vertexA.id, vertexB.id);
          if (path.length === 0) {
            continue;
          }

          const averageDistance = path.length / 2.0;
          let bestEdge: Edge | null = null;
          let bestMetric = Number.POSITIVE_INFINITY;

          for (let i = 0; i < path.length; i++) {
            const edge = path[i];
            if (!this.drawer.isEdgeRotatable(edge)) {
              continue;
            }

            const distance1 = i;
            const distance2 = path.length - i;
            const distanceMetric = Math.abs(averageDistance - distance1) + Math.abs(averageDistance - distance2);

            if (distanceMetric < bestMetric) {
              bestMetric = distanceMetric;
              bestEdge = edge;
            }
          }

          if (bestEdge && bestEdge.id !== null) {
            candidateEdgeIds.add(bestEdge.id);
          }
        }

        if (candidateEdgeIds.size === 0) {
          return;
        }

        const stepAngle = MathHelper.toRad(30);

        for (const edgeId of candidateEdgeIds) {
          if (this.drawer.totalOverlapScore <= this.drawer.opts.overlapSensitivity) {
            break;
          }

          const edge = this.drawer.graph.edges[edgeId];

          if (!edge) {
            continue;
          }

          const sourceId = edge.sourceId;
          const targetId = edge.targetId;

          const subtreeSizeSource = this.getSubgraphSize(sourceId, new Set<number>([targetId]));
          const subtreeSizeTarget = this.getSubgraphSize(targetId, new Set<number>([sourceId]));

          let rotatingId = sourceId;
          let parentId = targetId;

          if (subtreeSizeSource >= subtreeSizeTarget) {
            rotatingId = targetId;
            parentId = sourceId;
          }

          const parentVertex = this.drawer.graph.vertices[parentId];
          const rotatingVertex = this.drawer.graph.vertices[rotatingId];

          if (!parentVertex || !rotatingVertex || !rotatingVertex.value.isDrawn) {
            continue;
          }

          const currentScore = this.getOverlapScore().total;
          let bestScore = currentScore;
          let bestStep = 0;

          for (let step = 0; step < 12; step++) {
            this.rotateSubtree(rotatingId, parentId, stepAngle, parentVertex.position);
            const candidateScore = this.getOverlapScore().total;

            if (candidateScore < bestScore) {
              bestScore = candidateScore;
              bestStep = step + 1;
            }
          }

          this.rotateSubtree(rotatingId, parentId, -stepAngle * 12, parentVertex.position);

          const finalAngle = MathHelper.toRad(30 * bestStep + 1);
          this.rotateSubtree(rotatingId, parentId, finalAngle, parentVertex.position);

          const finalScore = this.getOverlapScore();
          this.drawer.totalOverlapScore = finalScore.total;
        }
    }

    resolveSecondaryOverlaps(scores: VertexOverlapScoreEntry[]): void {
        for (var i = 0; i < scores.length; i++) {
          if (scores[i].score > this.drawer.opts.overlapSensitivity) {
            let vertex = this.drawer.graph.vertices[scores[i].id];

            if (vertex.isTerminal()) {
              let closest = this.drawer.getClosestVertex(vertex);

              if (closest) {
                // If one of the vertices is the first one, the previous vertex is not the central vertex but the dummy
                // so take the next rather than the previous, which is vertex 1
                let closestPosition = null;

                if (closest.isTerminal()) {
                  closestPosition = closest.id === 0 ? this.drawer.graph.vertices[1].position : closest.previousPosition
                } else {
                  closestPosition = closest.id === 0 ? this.drawer.graph.vertices[1].position : closest.position
                }

                let vertexPreviousPosition = vertex.id === 0 ? this.drawer.graph.vertices[1].position : vertex.previousPosition;

                vertex.position.rotateAwayFrom(closestPosition, vertexPreviousPosition, MathHelper.toRad(20));
              }
            }
          }
        }
    }

    rotateSubtree(vertexId: number, parentVertexId: number, angle: number, center: Vector2): void {
        let that = this;
        const centerVertexId = parentVertexId;

        this.drawer.graph.traverseTree(vertexId, parentVertexId, function (vertex) {
          if (vertex.id === centerVertexId) {
            return;
          }
          vertex.position.rotateAround(angle, center);

          for (var i = 0; i < vertex.value.anchoredRings.length; i++) {
            let ring = that.drawer.rings[vertex.value.anchoredRings[i]];

            if (ring) {
              ring.center.rotateAround(angle, center);
            }
          }
        });
    }

    getSubtreeOverlapScore(vertexId: number, parentVertexId: number, vertexOverlapScores: Float32Array): SubtreeOverlapScore {
        let that = this;
        let score = 0;
        let center = new Vector2(0, 0);
        let count = 0;

        this.drawer.graph.traverseTree(vertexId, parentVertexId, function (vertex) {
          if (!vertex.value.isDrawn) {
            return;
          }

          let s = vertexOverlapScores[vertex.id];
          if (s > that.drawer.opts.overlapSensitivity) {
            score += s;
            count++;
          }

          let position = that.drawer.graph.vertices[vertex.id].position.clone();
          position.multiplyScalar(s)
          center.add(position);
        });

        center.divide(score);

        return {
          value: score / count,
          center: center
        };
    }

    getCurrentCenterOfMass(): Vector2 {
        let total = new Vector2(0, 0);
        let count = 0;

        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          let vertex = this.drawer.graph.vertices[i];

          if (vertex.positioned) {
            total.add(vertex.position);
            count++;
          }
        }

        return total.divide(count);
    }

    getCurrentCenterOfMassInNeigbourhood(vec: Vector2, r: number = this.drawer.opts.bondLength * 2.0): Vector2 {
        let total = new Vector2(0, 0);
        let count = 0;
        let rSq = r * r;

        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          let vertex = this.drawer.graph.vertices[i];

          if (vertex.positioned && vec.distanceSq(vertex.position) < rSq) {
            total.add(vertex.position);
            count++;
          }
        }

        return total.divide(count);
    }

    private findClashingVertices(threshold: number): Array<[Vertex, Vertex]> {
        const clashing: Array<[Vertex, Vertex]> = [];
        const vertices = this.drawer.graph.vertices;

        for (let i = 0; i < vertices.length; i++) {
          const vertexA = vertices[i];
          if (!vertexA.value.isDrawn) {
            continue;
          }

          for (let j = i + 1; j < vertices.length; j++) {
            const vertexB = vertices[j];
            if (!vertexB.value.isDrawn) {
              continue;
            }

            if (vertexA.id === null || vertexB.id === null) {
              continue;
            }

            if (this.drawer.graph.hasEdge(vertexA.id, vertexB.id)) {
              continue;
            }

            const distanceSq = vertexA.position.distanceSq(vertexB.position);

            if (distanceSq < threshold) {
              clashing.push([vertexA, vertexB]);
            }
          }
        }

        return clashing;
    }

    private findShortestPath(startId: number, targetId: number): Edge[] {
        if (startId === targetId) {
          return [];
        }

        const graph = this.drawer.graph;
        const visited = new Set<number>();
        const previous = new Map<number, number | null>();
        const queue: number[] = [startId];
        let front = 0;

        visited.add(startId);
        previous.set(startId, null);

        while (front < queue.length) {
          const current = queue[front++];

          if (current === targetId) {
            break;
          }

          const neighbours = graph.vertices[current].getNeighbours();

          for (const neighbour of neighbours) {
            if (!visited.has(neighbour)) {
              visited.add(neighbour);
              previous.set(neighbour, current);
              queue.push(neighbour);
            }
          }
        }

        if (!visited.has(targetId)) {
          return [];
        }

        const path: Edge[] = [];
        let current = targetId;

        while (previous.has(current) && previous.get(current) !== null) {
          const parent = previous.get(current)!;
          const edge = graph.getEdge(parent, current);

          if (edge) {
            path.unshift(edge);
          }

          current = parent;
        }

        return path;
    }

    private getSubgraphSize(vertexId: number, masked: Set<number>): number {
        const visited = new Set<number>(masked);
        const startSize = visited.size;
        const stack: number[] = [vertexId];

        while (stack.length > 0) {
          const current = stack.pop()!;

          if (visited.has(current)) {
            continue;
          }

          visited.add(current);

          const neighbours = this.drawer.graph.vertices[current].getDrawnNeighbours(this.drawer.graph.vertices);

          for (const neighbour of neighbours) {
            if (!visited.has(neighbour)) {
              stack.push(neighbour);
            }
          }
        }

        return visited.size - startSize;
    }
}
export = OverlapResolutionManager;
