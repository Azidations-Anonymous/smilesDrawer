import DrawerBase from "./DrawerBase";

import Vector2 = require("./Vector2");
import ArrayHelper = require("./ArrayHelper");
import MathHelper = require("./MathHelper");
class PositioningManager {
    private drawer: DrawerBase;

    constructor(drawer: DrawerBase) {
        this.drawer = drawer;
    }

    position(): void {
        let startVertex = null;

        // Always start drawing at a bridged ring if there is one
        // If not, start with a ring
        // else, start with 0
        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          if (this.drawer.graph.vertices[i].value.bridgedRing !== null) {
            startVertex = this.drawer.graph.vertices[i];
            break;
          }
        }

        for (var i = 0; i < this.drawer.rings.length; i++) {
          if (this.drawer.rings[i].isBridged) {
            startVertex = this.drawer.graph.vertices[this.drawer.rings[i].members[0]];
          }
        }

        if (this.drawer.rings.length > 0 && startVertex === null) {
          startVertex = this.drawer.graph.vertices[this.drawer.rings[0].members[0]];
        }

        if (startVertex === null) {
          startVertex = this.drawer.graph.vertices[0];
        }

        this.createNextBond(startVertex, null, 0.0);
    }

    createNextBond(vertex: any, previousVertex: any = null, angle: number = 0.0, originShortest: boolean = false, skipPositioning: boolean = false): void {
        if (vertex.positioned && !skipPositioning) {
          return;
        }

        // If the double bond config was set on this vertex, do not check later
        let doubleBondConfigSet = false;

        // Keeping track of configurations around double bonds
        if (previousVertex) {
          let edge = this.drawer.graph.getEdge(vertex.id, previousVertex.id);

          if ((edge.bondType === '/' || edge.bondType === '\\') && ++this.drawer.doubleBondConfigCount % 2 === 1) {
            if (this.drawer.doubleBondConfig === null) {
              this.drawer.doubleBondConfig = edge.bondType;
              doubleBondConfigSet = true;

              // Switch if the bond is a branch bond and previous vertex is the first
              // TODO: Why is it different with the first vertex?
              if (previousVertex.parentVertexId === null && vertex.value.branchBond) {
                if (this.drawer.doubleBondConfig === '/') {
                  this.drawer.doubleBondConfig = '\\';
                } else if (this.drawer.doubleBondConfig === '\\') {
                  this.drawer.doubleBondConfig = '/';
                }
              }
            }
          }
        }

        // If the current node is the member of one ring, then point straight away
        // from the center of the ring. However, if the current node is a member of
        // two rings, point away from the middle of the centers of the two rings
        if (!skipPositioning) {
          if (!previousVertex) {
            // Add a (dummy) previous position if there is no previous vertex defined
            // Since the first vertex is at (0, 0), create a vector at (bondLength, 0)
            // and rotate it by 90°

            let dummy = new Vector2(this.drawer.opts.bondLength, 0);
            dummy.rotate(MathHelper.toRad(-60));

            vertex.previousPosition = dummy;
            vertex.setPosition(this.drawer.opts.bondLength, 0);
            vertex.angle = MathHelper.toRad(-60);

            // Do not position the vertex if it belongs to a bridged ring that is positioned using a layout algorithm.
            if (vertex.value.bridgedRing === null) {
              vertex.positioned = true;
            }
          } else if (previousVertex.value.rings.length > 0) {
            let neighbours = previousVertex.neighbours;
            let joinedVertex = null;
            let pos = new Vector2(0.0, 0.0);

            if (previousVertex.value.bridgedRing === null && previousVertex.value.rings.length > 1) {
              for (var i = 0; i < neighbours.length; i++) {
                let neighbour = this.drawer.graph.vertices[neighbours[i]];
                if (ArrayHelper.containsAll(neighbour.value.rings, previousVertex.value.rings)) {
                  joinedVertex = neighbour;
                  break;
                }
              }
            }

            if (joinedVertex === null) {
              for (var i = 0; i < neighbours.length; i++) {
                let v = this.drawer.graph.vertices[neighbours[i]];

                if (v.positioned && this.drawer.areVerticesInSameRing(v, previousVertex)) {
                  pos.add(Vector2.subtract(v.position, previousVertex.position));
                }
              }

              pos.invert().normalize().multiplyScalar(this.drawer.opts.bondLength).add(previousVertex.position);
            } else {
              pos = joinedVertex.position.clone().rotateAround(Math.PI, previousVertex.position);
            }

            vertex.previousPosition = previousVertex.position;
            vertex.setPositionFromVector(pos);
            vertex.positioned = true;
          } else {
            // If the previous vertex was not part of a ring, draw a bond based
            // on the global angle of the previous bond
            let v = new Vector2(this.drawer.opts.bondLength, 0);

            v.rotate(angle);
            v.add(previousVertex.position);

            vertex.setPositionFromVector(v);
            vertex.previousPosition = previousVertex.position;
            vertex.positioned = true;
          }
        }

        // Go to next vertex
        // If two rings are connected by a bond ...
        if (vertex.value.bridgedRing !== null) {
          let nextRing = this.drawer.getRing(vertex.value.bridgedRing);

          if (!nextRing.positioned) {
            let nextCenter = Vector2.subtract(vertex.previousPosition, vertex.position);

            nextCenter.invert();
            nextCenter.normalize();

            let r = MathHelper.polyCircumradius(this.drawer.opts.bondLength, nextRing.members.length);
            nextCenter.multiplyScalar(r);
            nextCenter.add(vertex.position);

            this.drawer.createRing(nextRing, nextCenter, vertex);
          }
        } else if (vertex.value.rings.length > 0) {
          let nextRing = this.drawer.getRing(vertex.value.rings[0]);

          if (!nextRing.positioned) {
            let nextCenter = Vector2.subtract(vertex.previousPosition, vertex.position);

            nextCenter.invert();
            nextCenter.normalize();

            let r = MathHelper.polyCircumradius(this.drawer.opts.bondLength, nextRing.getSize());

            nextCenter.multiplyScalar(r);
            nextCenter.add(vertex.position);

            this.drawer.createRing(nextRing, nextCenter, vertex);
          }
        } else {
          // Draw the non-ring vertices connected to this one  
          let isStereoCenter = vertex.value.isStereoCenter;
          let tmpNeighbours = vertex.getNeighbours();
          let neighbours = Array();

          // Remove neighbours that are not drawn
          for (var i = 0; i < tmpNeighbours.length; i++) {
            if (this.drawer.graph.vertices[tmpNeighbours[i]].value.isDrawn) {
              neighbours.push(tmpNeighbours[i]);
            }
          }

          // Remove the previous vertex (which has already been drawn)
          if (previousVertex) {
            neighbours = ArrayHelper.remove(neighbours, previousVertex.id);
          }

          let previousAngle = vertex.getAngle();

          if (neighbours.length === 1) {
            let nextVertex = this.drawer.graph.vertices[neighbours[0]];

            let prevEdge = previousVertex ? this.drawer.graph.getEdge(vertex.id, previousVertex.id) : null;
            let nextEdge = this.drawer.graph.getEdge(vertex.id, nextVertex.id);

            // Make a single chain always cis except when there's a tribble (yes, this is a Star Trek reference) bond
            // or if there are successive double bonds (or some other bond-heavy combo).
            if (prevEdge && nextEdge && prevEdge.weight + nextEdge.weight >= 4) {
              prevEdge.center = true;
              nextEdge.center = true;

              // TODO: One of these is on value, but the other isn't?
              vertex.value.drawExplicit = false;
              nextVertex.drawExplicit = true;
              nextVertex.angle = 0.0;

              this.createNextBond(nextVertex, vertex, previousAngle + nextVertex.angle);
            } else if (previousVertex && previousVertex.value.rings.length > 0) {
              // If coming out of a ring, always draw away from the center of mass
              let proposedAngleA = MathHelper.toRad(60);
              let proposedAngleB = -proposedAngleA;

              let proposedVectorA = new Vector2(this.drawer.opts.bondLength, 0);
              let proposedVectorB = new Vector2(this.drawer.opts.bondLength, 0);

              proposedVectorA.rotate(proposedAngleA).add(vertex.position);
              proposedVectorB.rotate(proposedAngleB).add(vertex.position);

              // let centerOfMass = this.drawer.getCurrentCenterOfMassInNeigbourhood(vertex.position, 100);
              let centerOfMass = this.drawer.getCurrentCenterOfMass();
              let distanceA = proposedVectorA.distanceSq(centerOfMass);
              let distanceB = proposedVectorB.distanceSq(centerOfMass);

              nextVertex.angle = distanceA < distanceB ? proposedAngleB : proposedAngleA;

              this.createNextBond(nextVertex, vertex, previousAngle + nextVertex.angle);
            } else {
              let a = vertex.angle;
              // Take the min and max if the previous angle was in a 4-neighbourhood (90° angles)
              // TODO: If a is null or zero, it should be checked whether or not this one should go cis or trans, that is,
              //       it should go into the oposite direction of the last non-null or 0 previous vertex / angle.
              if (previousVertex && previousVertex.neighbours.length > 3) {
                if (a > 0) {
                  a = Math.min(1.0472, a);
                } else if (a < 0) {
                  a = Math.max(-1.0472, a);
                } else {
                  a = 1.0472;
                }
              } else if (!a) {
                a = this.getLastAngle(vertex.id);
                if (!a) {
                  a = 1.0472;
                }
              }

              // Handle configuration around double bonds
              if (previousVertex && !doubleBondConfigSet) {
                let bondType = this.drawer.graph.getEdge(vertex.id, nextVertex.id).bondType;

                if (bondType === '/') {
                  if (this.drawer.doubleBondConfig === '/') {
                    // Nothing to do since it will be trans per default
                  } else if (this.drawer.doubleBondConfig === '\\') {
                    a = -a;
                  }
                  this.drawer.doubleBondConfig = null;
                } else if (bondType === '\\') {
                  if (this.drawer.doubleBondConfig === '/') {
                    a = -a;
                  } else if (this.drawer.doubleBondConfig === '\\') {
                    // Nothing to do since it will be trans per default
                  }
                  this.drawer.doubleBondConfig = null;
                }
              }

              if (originShortest) {
                nextVertex.angle = a;
              } else {
                nextVertex.angle = -a;
              }

              this.createNextBond(nextVertex, vertex, previousAngle + nextVertex.angle);
            }
          } else if (neighbours.length === 2) {
            // If the previous vertex comes out of a ring, it doesn't have an angle set
            let a = vertex.angle;
            if (!a) {
              a = 1.0472;
            }

            // Check for the longer subtree - always go with cis for the longer subtree
            let subTreeDepthA = this.drawer.graph.getTreeDepth(neighbours[0], vertex.id);
            let subTreeDepthB = this.drawer.graph.getTreeDepth(neighbours[1], vertex.id);

            let l = this.drawer.graph.vertices[neighbours[0]];
            let r = this.drawer.graph.vertices[neighbours[1]];

            l.value.subtreeDepth = subTreeDepthA;
            r.value.subtreeDepth = subTreeDepthB;

            // Also get the subtree for the previous direction (this is important when
            // the previous vertex is the shortest path)
            let subTreeDepthC = this.drawer.graph.getTreeDepth(previousVertex ? previousVertex.id : null, vertex.id);
            if (previousVertex) {
              previousVertex.value.subtreeDepth = subTreeDepthC;
            }

            let cis = 0;
            let trans = 1;

            // Carbons go always cis
            if (r.value.element === 'C' && l.value.element !== 'C' && subTreeDepthB > 1 && subTreeDepthA < 5) {
              cis = 1;
              trans = 0;
            } else if (r.value.element !== 'C' && l.value.element === 'C' && subTreeDepthA > 1 && subTreeDepthB < 5) {
              cis = 0;
              trans = 1;
            } else if (subTreeDepthB > subTreeDepthA) {
              cis = 1;
              trans = 0;
            }

            let cisVertex = this.drawer.graph.vertices[neighbours[cis]];
            let transVertex = this.drawer.graph.vertices[neighbours[trans]];

            let edgeCis = this.drawer.graph.getEdge(vertex.id, cisVertex.id);
            let edgeTrans = this.drawer.graph.getEdge(vertex.id, transVertex.id);

            // If the origin tree is the shortest, make them the main chain
            let originShortest = false;
            if (subTreeDepthC < subTreeDepthA && subTreeDepthC < subTreeDepthB) {
              originShortest = true;
            }

            transVertex.angle = a;
            cisVertex.angle = -a;

            if (this.drawer.doubleBondConfig === '\\') {
              if (transVertex.value.branchBond === '\\') {
                transVertex.angle = -a;
                cisVertex.angle = a;
              }
            } else if (this.drawer.doubleBondConfig === '/') {
              if (transVertex.value.branchBond === '/') {
                transVertex.angle = -a;
                cisVertex.angle = a;
              }
            }

            this.createNextBond(transVertex, vertex, previousAngle + transVertex.angle, originShortest);
            this.createNextBond(cisVertex, vertex, previousAngle + cisVertex.angle, originShortest);
          }
          else if (neighbours.length > 0) {
            // Create vertices for all drawn neighbors...
            const vertices = neighbours.map(neighbour => {
              let newvertex    = this.drawer.graph.vertices[neighbour];
              let subtreedepth = this.drawer.graph.getTreeDepth(neighbour, vertex.id);
              newvertex.value.subtreeDepth = subtreedepth;
              return newvertex;
            })

            // This puts all the longest subtrees on the far side...
            // TODO: Maybe try to balance this better?
            // KNOWN BUG: Sort comparator returns boolean instead of number.
            // JavaScript coerces false->0, true->1, effectively sorting in ascending order
            // (shortest subtrees first), opposite of what the comment suggests.
            // Correct would be: (a, b) => b.value.subtreeDepth - a.value.subtreeDepth
            // Preserving buggy behavior for backward compatibility during TypeScript migration.
            vertices.sort((a, b) => (a.value.subtreeDepth < b.value.subtreeDepth) as any)

            if (neighbours.length === 3 &&
              previousVertex &&
              previousVertex.value.rings.length < 1 &&
              vertices[2].value.rings.length < 1 &&
              vertices[1].value.rings.length < 1 &&
              vertices[0].value.rings.length < 1 &&
              vertices[2].value.subtreeDepth === 1 &&
              vertices[1].value.subtreeDepth === 1 &&
              vertices[0].value.subtreeDepth > 1)
            {
              // Special logic for adding pinched crosses...
              vertices[0].angle = -vertex.angle;
              if (vertex.angle >= 0) {
                vertices[1].angle = MathHelper.toRad(30);
                vertices[2].angle = MathHelper.toRad(90);
              } else {
                vertices[1].angle = -MathHelper.toRad(30);
                vertices[2].angle = -MathHelper.toRad(90);
              }

              this.createNextBond(vertices[0], vertex, previousAngle + vertices[0].angle);
              this.createNextBond(vertices[1], vertex, previousAngle + vertices[1].angle);
              this.createNextBond(vertices[2], vertex, previousAngle + vertices[2].angle);
            }
            else {
              // Divide the remaining space evenly among all neighbors...
              const totalNeighbors = neighbours.length + (previousVertex? 1 : 0);
              const angleDelta = 2 * Math.PI / totalNeighbors;
              let angle = angleDelta;
              let index = 0;

              if (neighbours.length % 2 !== 0) {
                // If there are an even number, the longest neighbor goes directly across.
                vertices[0].angle = 0.0;
                this.createNextBond(vertices[0], vertex, previousAngle);
                index = 1;
              }
              else {
                // Otherwise, the two longest neighbors split the difference.
                angle /= 2;
              }

              while (index < neighbours.length) {
                vertices[index + 0].angle =  angle;
                vertices[index + 1].angle = -angle;
                this.createNextBond(vertices[index + 0], vertex, previousAngle + angle);
                this.createNextBond(vertices[index + 1], vertex, previousAngle - angle);
                angle += angleDelta;
                index += 2;
              }
            }
          }
        }
    }

    getLastAngle(vertexId: number): number {
        while (vertexId) {
          let vertex = this.drawer.graph.vertices[vertexId];
          if (vertex.value.rings.length > 0) {
            // Angles from rings aren't useful to us...
            return 0;
          }
          if (vertex.angle) {
            return vertex.angle;
          }

          vertexId = vertex.parentVertexId;
        }

        return 0;
    }

    getVerticesAt(position: any, radius: number, excludeVertexId: number): number[] {
        let locals = Array();

        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          let vertex = this.drawer.graph.vertices[i];

          if (vertex.id === excludeVertexId || !vertex.positioned) {
            continue;
          }

          let distance = position.distanceSq(vertex.position);

          if (distance <= radius * radius) {
            locals.push(vertex.id);
          }
        }

        return locals;
    }

    getClosestVertex(vertex: any): any {
        let minDist = 99999;
        let minVertex = null;

        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          let v = this.drawer.graph.vertices[i];

          if (v.id === vertex.id) {
            continue;
          }

          let distSq = vertex.position.distanceSq(v.position);

          if (distSq < minDist) {
            minDist = distSq;
            minVertex = v;
          }
        }

        return minVertex;
    }

    getNonRingNeighbours(vertexId: number): any[] {
        let nrneighbours = Array();
        let vertex = this.drawer.graph.vertices[vertexId];
        let neighbours = vertex.neighbours;

        for (var i = 0; i < neighbours.length; i++) {
          let neighbour = this.drawer.graph.vertices[neighbours[i]];
          let nIntersections = ArrayHelper.intersection(vertex.value.rings, neighbour.value.rings).length;

          if (nIntersections === 0 && neighbour.value.isBridge == false) {
            nrneighbours.push(neighbour);
          }
        }

        return nrneighbours;
    }
}
export = PositioningManager;
