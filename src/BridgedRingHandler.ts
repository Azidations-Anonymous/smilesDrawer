import RingManager = require("./RingManager");
import ArrayHelper = require("./ArrayHelper");
import RingConnection = require("./RingConnection");
import Ring = require("./Ring");

class BridgedRingHandler {
    private ringManager: RingManager;

    constructor(ringManager: RingManager) {
        this.ringManager = ringManager;
    }

    getBridgedRingRings(ringId: number): number[] {
        let involvedRings = Array();
        let that = this;

        let recurse = function (r) {
          let ring = that.ringManager.getRing(r);

          involvedRings.push(r);

          for (var i = 0; i < ring.neighbours.length; i++) {
            let n = ring.neighbours[i];

            if (involvedRings.indexOf(n) === -1 &&
              n !== r &&
              RingConnection.isBridge(that.ringManager.ringConnections, that.ringManager.drawer.graph.vertices, r, n)) {
              recurse(n);
            }
          }
        };

        recurse(ringId);

        return ArrayHelper.unique(involvedRings);
    }

    isPartOfBridgedRing(ringId: number): boolean {
        for (var i = 0; i < this.ringManager.ringConnections.length; i++) {
          if (this.ringManager.ringConnections[i].containsRing(ringId) &&
            this.ringManager.ringConnections[i].isBridge(this.ringManager.drawer.graph.vertices)) {
            return true;
          }
        }

        return false;
    }

    createBridgedRing(ringIds: number[], sourceVertexId: number): any {
        let ringMembers = new Set();
        let vertices = new Set();
        let neighbours = new Set();

        for (var i = 0; i < ringIds.length; i++) {
          let ring = this.ringManager.getRing(ringIds[i]);
          ring.isPartOfBridged = true;

          for (var j = 0; j < ring.members.length; j++) {
            vertices.add(ring.members[j]);
          }

          for (var j = 0; j < ring.neighbours.length; j++) {
            let id = ring.neighbours[j];

            if (ringIds.indexOf(id) === -1) {
              neighbours.add(ring.neighbours[j]);
            }
          }
        }

        // A vertex is part of the bridged ring if it only belongs to
        // one of the rings (or to another ring
        // which is not part of the bridged ring).
        let leftovers = new Set();

        for (let id of vertices) {
          let vertex = this.ringManager.drawer.graph.vertices[id as number];
          let intersection = ArrayHelper.intersection(ringIds, vertex.value.rings);

          if (vertex.value.rings.length === 1 || intersection.length === 1) {
            ringMembers.add(vertex.id);
          } else {
            leftovers.add(vertex.id);
          }
        }

        // Vertices can also be part of multiple rings and lay on the bridged ring,
        // however, they have to have at least two neighbours that are not part of
        // two rings
        let tmp = Array();
        let insideRing = Array();

        for (let id of leftovers) {
          let vertex = this.ringManager.drawer.graph.vertices[id as number];
          let onRing = false;

          for (let j = 0; j < vertex.edges.length; j++) {
            if (this.ringManager.edgeRingCount(vertex.edges[j]) === 1) {
              onRing = true;
            }
          }

          if (onRing) {
            vertex.value.isBridgeNode = true;
            ringMembers.add(vertex.id);
          } else {
            vertex.value.isBridge = true;
            ringMembers.add(vertex.id);
          }
        }

        // Create the ring
        let ring = new Ring([...ringMembers] as number[]);
        this.ringManager.addRing(ring);

        ring.isBridged = true;
        ring.neighbours = [...neighbours] as number[];

        for (var i = 0; i < ringIds.length; i++) {
          ring.rings.push(this.ringManager.getRing(ringIds[i]).clone());
        }

        for (var i = 0; i < ring.members.length; i++) {
          this.ringManager.drawer.graph.vertices[ring.members[i]].value.bridgedRing = ring.id;
        }

        // Atoms inside the ring are no longer part of a ring but are now
        // associated with the bridged ring
        for (var i = 0; i < insideRing.length; i++) {
          let vertex = this.ringManager.drawer.graph.vertices[insideRing[i]];
          vertex.value.rings = Array();
        }

        // Remove former rings from members of the bridged ring and add the bridged ring
        for (let id of ringMembers) {
          let vertex = this.ringManager.drawer.graph.vertices[id as number];
          vertex.value.rings = ArrayHelper.removeAll(vertex.value.rings, ringIds);
          vertex.value.rings.push(ring.id);
        }

        // Remove all the ring connections no longer used
        for (var i = 0; i < ringIds.length; i++) {
          for (var j = i + 1; j < ringIds.length; j++) {
            this.ringManager.removeRingConnectionsBetween(ringIds[i], ringIds[j]);
          }
        }

        // Update the ring connections and add this ring to the neighbours neighbours
        for (let id of neighbours) {
          let connections = this.ringManager.getRingConnections(id as number, ringIds);

          for (var j = 0; j < connections.length; j++) {
            this.ringManager.getRingConnection(connections[j]).updateOther(ring.id, id);
          }

          this.ringManager.getRing(id as number).neighbours.push(ring.id);
        }

        return ring;
    }

    processBridgedRingsInInitRings(): void {
        while (this.ringManager.rings.length > 0) {
          let id = -1;
          for (var i = 0; i < this.ringManager.rings.length; i++) {
            let ring = this.ringManager.rings[i];

            if (this.isPartOfBridgedRing(ring.id) && !ring.isBridged) {
              id = ring.id;
            }
          }

          if (id === -1) {
            break;
          }

          let ring = this.ringManager.getRing(id);

          let involvedRings = this.getBridgedRingRings(ring.id);

          this.ringManager.bridgedRing = true;
          this.createBridgedRing(involvedRings, ring.members[0]);
          this.ringManager.bridgedRing = false;

          for (var i = 0; i < involvedRings.length; i++) {
            this.ringManager.removeRing(involvedRings[i]);
          }
        }
    }
}

export = BridgedRingHandler;
