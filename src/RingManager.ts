import MolecularPreprocessor = require("./MolecularPreprocessor");
import MathHelper = require("./MathHelper");
import ArrayHelper = require("./ArrayHelper");
import Vector2 = require("./Vector2");
import Edge = require("./Edge");
import Ring = require("./Ring");
import RingConnection = require("./RingConnection");
import SSSR = require("./SSSR");

import BridgedRingHandler = require("./BridgedRingHandler");
class RingManager {
    public drawer: MolecularPreprocessor;
    public ringIdCounter: number = 0;
    public ringConnectionIdCounter: number = 0;
    public rings: any[] = [];
    public ringConnections: any[] = [];
    public originalRings: any[] = [];
    public originalRingConnections: any[] = [];
    public bridgedRing: boolean = false;
    public bridgedRingHandler: BridgedRingHandler;

    constructor(drawer: MolecularPreprocessor) {
        this.drawer = drawer;
        this.bridgedRingHandler = new BridgedRingHandler(this);
    }

    edgeRingCount(edgeId: number): number {
        let edge = this.drawer.graph.edges[edgeId];
        let a = this.drawer.graph.vertices[edge.sourceId];
        let b = this.drawer.graph.vertices[edge.targetId];

        return Math.min(a.value.rings.length, b.value.rings.length);
    }

    getBridgedRings(): any[] {
        let bridgedRings = Array();

        for (var i = 0; i < this.rings.length; i++) {
          if (this.rings[i].isBridged) {
            bridgedRings.push(this.rings[i]);
          }
        }

        return bridgedRings;
    }

    getFusedRings(): any[] {
        let fusedRings = Array();

        for (var i = 0; i < this.rings.length; i++) {
          if (this.rings[i].isFused) {
            fusedRings.push(this.rings[i]);
          }
        }

        return fusedRings;
    }

    getSpiros(): any[] {
        let spiros = Array();

        for (var i = 0; i < this.rings.length; i++) {
          if (this.rings[i].isSpiro) {
            spiros.push(this.rings[i]);
          }
        }

        return spiros;
    }

    printRingInfo(): string {
        let result = '';
        for (var i = 0; i < this.rings.length; i++) {
          const ring = this.rings[i];

          result += ring.id + ';';
          result += ring.members.length + ';';
          result += ring.neighbours.length + ';';
          result += ring.isSpiro ? 'true;' : 'false;'
          result += ring.isFused ? 'true;' : 'false;'
          result += ring.isBridged ? 'true;' : 'false;'
          result += ring.rings.length + ';';
          result += '\n';
        }

        return result;
    }

    getRingCount(): number {
        return this.rings.length;
    }

    hasBridgedRing(): boolean {
        return this.bridgedRing;
    }

    getRingbondType(vertexA: any, vertexB: any): string {
        // Checks whether the two vertices are the ones connecting the ring
        // and what the bond type should be.
        if (vertexA.value.getRingbondCount() < 1 || vertexB.value.getRingbondCount() < 1) {
          return null;
        }

        for (var i = 0; i < vertexA.value.ringbonds.length; i++) {
          for (var j = 0; j < vertexB.value.ringbonds.length; j++) {
            // if(i != j) continue;
            if (vertexA.value.ringbonds[i].id === vertexB.value.ringbonds[j].id) {
              // If the bonds are equal, it doesn't matter which bond is returned.
              // if they are not equal, return the one that is not the default ("-")
              if (vertexA.value.ringbonds[i].bondType === '-') {
                return vertexB.value.ringbonds[j].bond;
              } else {
                return vertexA.value.ringbonds[i].bond;
              }
            }
          }
        }

        return null;
    }

    initRings(): void {
        let openBonds = new Map();

        // Close the open ring bonds (spanning tree -> graph)
        for (var i = this.drawer.graph.vertices.length - 1; i >= 0; i--) {
          let vertex = this.drawer.graph.vertices[i];

          if (vertex.value.ringbonds.length === 0) {
            continue;
          }

          for (var j = 0; j < vertex.value.ringbonds.length; j++) {
            let ringbondId = vertex.value.ringbonds[j].id;
            let ringbondBond = vertex.value.ringbonds[j].bond;

            // If the other ringbond id has not been discovered,
            // add it to the open bonds map and continue.
            // if the other ringbond id has already been discovered,
            // create a bond between the two atoms.
            if (!openBonds.has(ringbondId)) {
              openBonds.set(ringbondId, [vertex.id, ringbondBond]);
            } else {
              let sourceVertexId = vertex.id;
              let targetVertexId = openBonds.get(ringbondId)[0];
              let targetRingbondBond = openBonds.get(ringbondId)[1];
              let edge = new Edge(sourceVertexId, targetVertexId, 1);
              edge.setBondType(targetRingbondBond || ringbondBond || '-');
              let edgeId = this.drawer.graph.addEdge(edge);
              let targetVertex = this.drawer.graph.vertices[targetVertexId];

              vertex.addRingbondChild(targetVertexId, j);
              vertex.value.addNeighbouringElement(targetVertex.value.element);
              targetVertex.addRingbondChild(sourceVertexId, j);
              targetVertex.value.addNeighbouringElement(vertex.value.element);
              vertex.edges.push(edgeId);
              targetVertex.edges.push(edgeId);

              openBonds.delete(ringbondId);
            }
          }
        }

        // Get the rings in the graph (the SSSR)
        let rings = SSSR.getRings(this.drawer.graph, this.drawer.opts.experimentalSSSR);

        if (rings === null) {
          return;
        }

        for (var i = 0; i < rings.length; i++) {
          let ringVertices = [...rings[i]];
          let ringId = this.addRing(new Ring(ringVertices));

          // Add the ring to the atoms
          for (var j = 0; j < ringVertices.length; j++) {
            this.drawer.graph.vertices[ringVertices[j]].value.rings.push(ringId);
          }
        }

        // Find connection between rings
        // Check for common vertices and create ring connections. This is a bit
        // ugly, but the ringcount is always fairly low (< 100)
        for (var i = 0; i < this.rings.length - 1; i++) {
          for (var j = i + 1; j < this.rings.length; j++) {
            let a = this.rings[i];
            let b = this.rings[j];
            let ringConnection = new RingConnection(a, b);

            // If there are no vertices in the ring connection, then there
            // is no ring connection
            if (ringConnection.vertices.size > 0) {
              this.addRingConnection(ringConnection);
            }
          }
        }

        // Add neighbours to the rings
        for (var i = 0; i < this.rings.length; i++) {
          let ring = this.rings[i];
          ring.neighbours = RingConnection.getNeighbours(this.ringConnections, ring.id);
        }

        // Anchor the ring to one of it's members, so that the ring center will always
        // be tied to a single vertex when doing repositionings
        for (var i = 0; i < this.rings.length; i++) {
          let ring = this.rings[i];
          this.drawer.graph.vertices[ring.members[0]].value.addAnchoredRing(ring.id);
        }

        // Backup the ring information to restore after placing the bridged ring.
        // This is needed in order to identify aromatic rings and stuff like this in
        // rings that are member of the superring.
        this.backupRingInformation();


        // Replace rings contained by a larger bridged ring with a bridged ring
                this.bridgedRingHandler.processBridgedRingsInInitRings();
    }

    areVerticesInSameRing(vertexA: any, vertexB: any): boolean {
        // This is a little bit lighter (without the array and push) than
        // getCommonRings().length > 0
        for (var i = 0; i < vertexA.value.rings.length; i++) {
          for (var j = 0; j < vertexB.value.rings.length; j++) {
            if (vertexA.value.rings[i] === vertexB.value.rings[j]) {
              return true;
            }
          }
        }

        return false;
    }

    getCommonRings(vertexA: any, vertexB: any): number[] {
        let commonRings = Array();

        for (var i = 0; i < vertexA.value.rings.length; i++) {
          for (var j = 0; j < vertexB.value.rings.length; j++) {
            if (vertexA.value.rings[i] == vertexB.value.rings[j]) {
              commonRings.push(vertexA.value.rings[i]);
            }
          }
        }

        return commonRings;
    }

    getLargestOrAromaticCommonRing(vertexA: any, vertexB: any): any {
        let commonRings = this.getCommonRings(vertexA, vertexB);
        let maxSize = 0;
        let largestCommonRing = null;

        for (var i = 0; i < commonRings.length; i++) {
          let ring = this.getRing(commonRings[i]);
          let size = ring.getSize();

          if (ring.isBenzeneLike(this.drawer.graph.vertices)) {
            return ring;
          } else if (size > maxSize) {
            maxSize = size;
            largestCommonRing = ring;
          }
        }

        return largestCommonRing;
    }

    addRing(ring: any): number {
        ring.id = this.ringIdCounter++;
        this.rings.push(ring);

        return ring.id;
    }

    removeRing(ringId: number): void {
        this.rings = this.rings.filter(function (item) {
          return item.id !== ringId;
        });

        // Also remove ring connections involving this ring
        this.ringConnections = this.ringConnections.filter(function (item) {
          return item.firstRingId !== ringId && item.secondRingId !== ringId;
        });

        // Remove the ring as neighbour of other rings
        for (var i = 0; i < this.rings.length; i++) {
          let r = this.rings[i];
          r.neighbours = r.neighbours.filter(function (item) {
            return item !== ringId;
          });
        }
    }

    getRing(ringId: number): any {
        for (var i = 0; i < this.rings.length; i++) {
          if (this.rings[i].id == ringId) {
            return this.rings[i];
          }
        }
    }

    addRingConnection(ringConnection: any): number {
        ringConnection.id = this.ringConnectionIdCounter++;
        this.ringConnections.push(ringConnection);

        return ringConnection.id;
    }

    removeRingConnection(ringConnectionId: number): void {
        this.ringConnections = this.ringConnections.filter(function (item) {
          return item.id !== ringConnectionId;
        });
    }

    removeRingConnectionsBetween(vertexIdA: number, vertexIdB: number): void {
        let toRemove = Array();
        for (var i = 0; i < this.ringConnections.length; i++) {
          let ringConnection = this.ringConnections[i];

          if (ringConnection.firstRingId === vertexIdA && ringConnection.secondRingId === vertexIdB ||
            ringConnection.firstRingId === vertexIdB && ringConnection.secondRingId === vertexIdA) {
            toRemove.push(ringConnection.id);
          }
        }

        for (var i = 0; i < toRemove.length; i++) {
          this.removeRingConnection(toRemove[i]);
        }
    }

    getRingConnection(id: number): any {
        for (var i = 0; i < this.ringConnections.length; i++) {
          if (this.ringConnections[i].id == id) {
            return this.ringConnections[i];
          }
        }
    }

    getRingConnections(ringId: number, ringIds: number[]): number[] {
        let ringConnections = Array();

        for (var i = 0; i < this.ringConnections.length; i++) {
          let rc = this.ringConnections[i];

          for (var j = 0; j < ringIds.length; j++) {
            let id = ringIds[j];

            if (rc.firstRingId === ringId && rc.secondRingId === id ||
              rc.firstRingId === id && rc.secondRingId === ringId) {
              ringConnections.push(rc.id);
            }
          }
        }

        return ringConnections;
    }

    setRingCenter(ring: any): void {
        let ringSize = ring.getSize();
        let total = new Vector2(0, 0);

        for (var i = 0; i < ringSize; i++) {
          total.add(this.drawer.graph.vertices[ring.members[i]].position);
        }

        ring.center = total.divide(ringSize);
    }

    getSubringCenter(ring: any, vertex: any): any {
        let rings = vertex.value.originalRings;
        let center = ring.center;
        let smallest = Number.MAX_VALUE;

        // Always get the smallest ring.
        for (var i = 0; i < rings.length; i++) {
          for (var j = 0; j < ring.rings.length; j++) {
            if (rings[i] === ring.rings[j].id) {
              if (ring.rings[j].getSize() < smallest) {
                center = ring.rings[j].center;
                smallest = ring.rings[j].getSize();
              }
            }
          }
        }

        return center;
    }

    backupRingInformation(): void {
        this.originalRings = Array();
        this.originalRingConnections = Array();

        for (var i = 0; i < this.rings.length; i++) {
          this.originalRings.push(this.rings[i]);
        }

        for (var i = 0; i < this.ringConnections.length; i++) {
          this.originalRingConnections.push(this.ringConnections[i]);
        }

        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          this.drawer.graph.vertices[i].value.backupRings();
        }
    }

    restoreRingInformation(): void {
        // Get the subring centers from the bridged rings
        let bridgedRings = this.getBridgedRings();

        this.rings = Array();
        this.ringConnections = Array();

        for (var i = 0; i < bridgedRings.length; i++) {
          let bridgedRing = bridgedRings[i];

          for (var j = 0; j < bridgedRing.rings.length; j++) {
            let ring = bridgedRing.rings[j];
            this.originalRings[ring.id].center = ring.center;
          }
        }

        for (var i = 0; i < this.originalRings.length; i++) {
          this.rings.push(this.originalRings[i]);
        }

        for (var i = 0; i < this.originalRingConnections.length; i++) {
          this.ringConnections.push(this.originalRingConnections[i]);
        }

        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          this.drawer.graph.vertices[i].value.restoreRings();
        }
    }

    createRing(ring: any, center: any = null, startVertex: any = null, previousVertex: any = null): void {
        if (ring.positioned) {
          return;
        }

        center = center ? center : new Vector2(0, 0);

        let orderedNeighbours = ring.getOrderedNeighbours(this.ringConnections);
        let startingAngle = startVertex ? Vector2.subtract(startVertex.position, center).angle() : 0;

        let radius = MathHelper.polyCircumradius(this.drawer.opts.bondLength, ring.getSize());
        let angle = MathHelper.centralAngle(ring.getSize());

        ring.centralAngle = angle;

        let a = startingAngle;
        let that = this;
        let startVertexId = (startVertex) ? startVertex.id : null;

        if (ring.members.indexOf(startVertexId) === -1) {
          if (startVertex) {
            startVertex.positioned = false;
          }

          startVertexId = ring.members[0];
        }

        // If the ring is bridged, then draw the vertices inside the ring
        // using a force based approach
        if (ring.isBridged) {
          this.drawer.graph.kkLayout(ring.members.slice(), center, startVertex.id, ring, this.drawer.opts.bondLength,
            this.drawer.opts.kkThreshold, this.drawer.opts.kkInnerThreshold, this.drawer.opts.kkMaxIteration,
            this.drawer.opts.kkMaxInnerIteration, this.drawer.opts.kkMaxEnergy);
          ring.positioned = true;

          // Update the center of the bridged ring
          this.setRingCenter(ring);
          center = ring.center;

          // Setting the centers for the subrings
          for (var i = 0; i < ring.rings.length; i++) {
            this.setRingCenter(ring.rings[i]);
          }
        } else {
          ring.eachMember(this.drawer.graph.vertices, function (v) {
            let vertex = that.drawer.graph.vertices[v];

            if (!vertex.positioned) {
              vertex.setPosition(center.x + Math.cos(a) * radius, center.y + Math.sin(a) * radius);
            }

            a += angle;

            if (!ring.isBridged || ring.rings.length < 3) {
              vertex.angle = a;
              vertex.positioned = true;
            }
          }, startVertexId, (previousVertex) ? previousVertex.id : null);
        }

        ring.positioned = true;
        ring.center = center;

        // Draw neighbours in decreasing order of connectivity
        for (var i = 0; i < orderedNeighbours.length; i++) {
          let neighbour = this.getRing(orderedNeighbours[i].neighbour);

          if (neighbour.positioned) {
            continue;
          }

          let vertices = RingConnection.getVertices(this.ringConnections, ring.id, neighbour.id);

          if (vertices.length === 2) {
            // This ring is a fused ring
            ring.isFused = true;
            neighbour.isFused = true;

            let vertexA = this.drawer.graph.vertices[vertices[0]];
            let vertexB = this.drawer.graph.vertices[vertices[1]];

            // Get middle between vertex A and B
            let midpoint = Vector2.midpoint(vertexA.position, vertexB.position);

            // Get the normals to the line between A and B
            let normals = Vector2.normals(vertexA.position, vertexB.position);

            // Normalize the normals
            normals[0].normalize();
            normals[1].normalize();

            // Set length from middle of side to center (the apothem)
            let r = MathHelper.polyCircumradius(this.drawer.opts.bondLength, neighbour.getSize());
            let apothem = MathHelper.apothem(r, neighbour.getSize());

            normals[0].multiplyScalar(apothem).add(midpoint);
            normals[1].multiplyScalar(apothem).add(midpoint);

            // Pick the normal which results in a larger distance to the previous center
            // Also check whether it's inside another ring
            let nextCenter = normals[0];
            if (Vector2.subtract(center, normals[1]).lengthSq() > Vector2.subtract(center, normals[0]).lengthSq()) {
              nextCenter = normals[1];
            }

            // Get the vertex (A or B) which is in clock-wise direction of the other
            let posA = Vector2.subtract(vertexA.position, nextCenter);
            let posB = Vector2.subtract(vertexB.position, nextCenter);

            if (posA.clockwise(posB) === -1) {
              if (!neighbour.positioned) {
                this.createRing(neighbour, nextCenter, vertexA, vertexB);
              }
            } else {
              if (!neighbour.positioned) {
                this.createRing(neighbour, nextCenter, vertexB, vertexA);
              }
            }
          } else if (vertices.length === 1) {
            // This ring is a spiro
            ring.isSpiro = true;
            neighbour.isSpiro = true;

            let vertexA = this.drawer.graph.vertices[vertices[0]];

            // Get the vector pointing from the shared vertex to the new centpositioner
            let nextCenter = Vector2.subtract(center, vertexA.position);

            nextCenter.invert();
            nextCenter.normalize();

            // Get the distance from the vertex to the center
            let r = MathHelper.polyCircumradius(this.drawer.opts.bondLength, neighbour.getSize());

            nextCenter.multiplyScalar(r);
            nextCenter.add(vertexA.position);

            if (!neighbour.positioned) {
              this.createRing(neighbour, nextCenter, vertexA);
            }
          }
        }

        // Next, draw atoms that are not part of a ring that are directly attached to this ring
        for (var i = 0; i < ring.members.length; i++) {
          let ringMember = this.drawer.graph.vertices[ring.members[i]];
          let ringMemberNeighbours = ringMember.neighbours;

          // If there are multiple, the ovlerap will be resolved in the appropriate step
          for (var j = 0; j < ringMemberNeighbours.length; j++) {
            let v = this.drawer.graph.vertices[ringMemberNeighbours[j]];

            if (v.positioned) {
              continue;
            }

            v.value.isConnectedToRing = true;
            this.drawer.createNextBond(v, ringMember, 0.0);
          }
        }
    }

    getCommonRingbondNeighbour(vertex: any): any {
        let neighbours = vertex.neighbours;

        for (var i = 0; i < neighbours.length; i++) {
          let neighbour = this.drawer.graph.vertices[neighbours[i]];

          if (ArrayHelper.containsAll(neighbour.value.rings, vertex.value.rings)) {
            return neighbour;
          }
        }

        return null;
    }

    isPointInRing(vec: any): boolean {
        for (var i = 0; i < this.rings.length; i++) {
          let ring = this.rings[i];

          if (!ring.positioned) {
            continue;
          }

          let radius = MathHelper.polyCircumradius(this.drawer.opts.bondLength, ring.getSize());
          let radiusSq = radius * radius;

          if (vec.distanceSq(ring.center) < radiusSq) {
            return true;
          }
        }

        return false;
    }

    isEdgeInRing(edge: any): boolean {
        let source = this.drawer.graph.vertices[edge.sourceId];
        let target = this.drawer.graph.vertices[edge.targetId];

        return this.areVerticesInSameRing(source, target);
    }

    isRingAromatic(ring: any): boolean {
        for (var i = 0; i < ring.members.length; i++) {
          let vertex = this.drawer.graph.vertices[ring.members[i]];

          if (!vertex.value.isPartOfAromaticRing) {
            return false;
          }
        }

        return true;
    }
}
export = RingManager;
