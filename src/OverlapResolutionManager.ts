import DrawerBase from "./DrawerBase";
import Vector2 = require("./Vector2");
import ArrayHelper = require("./ArrayHelper");
import MathHelper = require("./MathHelper");

class OverlapResolutionManager {
    private drawer: DrawerBase;

    constructor(drawer: DrawerBase) {
        this.drawer = drawer;
    }

    getOverlapScore(): any {
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

    chooseSide(vertexA: any, vertexB: any, sides: any[]): any {
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

    resolveSecondaryOverlaps(scores: any[]): void {
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

    rotateSubtree(vertexId: number, parentVertexId: number, angle: number, center: any): void {
        let that = this;

        this.drawer.graph.traverseTree(vertexId, parentVertexId, function (vertex) {
          vertex.position.rotateAround(angle, center);

          for (var i = 0; i < vertex.value.anchoredRings.length; i++) {
            let ring = that.drawer.rings[vertex.value.anchoredRings[i]];

            if (ring) {
              ring.center.rotateAround(angle, center);
            }
          }
        });
    }

    getSubtreeOverlapScore(vertexId: number, parentVertexId: number, vertexOverlapScores: any): any {
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

    getCurrentCenterOfMass(): any {
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

    getCurrentCenterOfMassInNeigbourhood(vec: any, r: number = this.drawer.opts.bondLength * 2.0): any {
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
}
export = OverlapResolutionManager;
