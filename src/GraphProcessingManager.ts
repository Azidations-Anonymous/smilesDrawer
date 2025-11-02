import MathHelper = require('./MathHelper');

class GraphProcessingManager {
    private drawer: any;

    constructor(drawer: any) {
        this.drawer = drawer;
    }

    processGraph(): void {
        this.drawer.position();

        // Restore the ring information (removes bridged rings and replaces them with the original, multiple, rings)
        this.drawer.restoreRingInformation();

        // Atoms bonded to the same ring atom
        this.drawer.resolvePrimaryOverlaps();

        let overlapScore = this.drawer.getOverlapScore();

        this.drawer.totalOverlapScore = this.drawer.getOverlapScore().total;

        for (var o = 0; o < this.drawer.opts.overlapResolutionIterations; o++) {
          for (var i = 0; i < this.drawer.graph.edges.length; i++) {
            let edge = this.drawer.graph.edges[i];
            if (this.drawer.isEdgeRotatable(edge)) {
              let subTreeDepthA = this.drawer.graph.getTreeDepth(edge.sourceId, edge.targetId);
              let subTreeDepthB = this.drawer.graph.getTreeDepth(edge.targetId, edge.sourceId);

              // Only rotate the shorter subtree
              let a = edge.targetId;
              let b = edge.sourceId;

              if (subTreeDepthA > subTreeDepthB) {
                a = edge.sourceId;
                b = edge.targetId;
              }

              let subTreeOverlap = this.drawer.getSubtreeOverlapScore(b, a, overlapScore.vertexScores);
              if (subTreeOverlap.value > this.drawer.opts.overlapSensitivity) {
                let vertexA = this.drawer.graph.vertices[a];
                let vertexB = this.drawer.graph.vertices[b];
                let neighboursB = vertexB.getNeighbours(a);

                if (neighboursB.length === 1) {
                  let neighbour = this.drawer.graph.vertices[neighboursB[0]];
                  let angle = neighbour.position.getRotateAwayFromAngle(vertexA.position, vertexB.position, MathHelper.toRad(120));

                  this.drawer.rotateSubtree(neighbour.id, vertexB.id, angle, vertexB.position);
                  // If the new overlap is bigger, undo change
                  let newTotalOverlapScore = this.drawer.getOverlapScore().total;

                  if (newTotalOverlapScore > this.drawer.totalOverlapScore) {
                    this.drawer.rotateSubtree(neighbour.id, vertexB.id, -angle, vertexB.position);
                  } else {
                    this.drawer.totalOverlapScore = newTotalOverlapScore;
                  }
                } else if (neighboursB.length === 2) {
                  // Switch places / sides
                  // If vertex a is in a ring, do nothing
                  if (vertexB.value.rings.length !== 0 && vertexA.value.rings.length !== 0) {
                    continue;
                  }

                  let neighbourA = this.drawer.graph.vertices[neighboursB[0]];
                  let neighbourB = this.drawer.graph.vertices[neighboursB[1]];

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

                    this.drawer.rotateSubtree(neighbourA.id, vertexB.id, angleA, vertexB.position);
                    this.drawer.rotateSubtree(neighbourB.id, vertexB.id, angleB, vertexB.position);

                    let newTotalOverlapScore = this.drawer.getOverlapScore().total;

                    if (newTotalOverlapScore > this.drawer.totalOverlapScore) {
                      this.drawer.rotateSubtree(neighbourA.id, vertexB.id, -angleA, vertexB.position);
                      this.drawer.rotateSubtree(neighbourB.id, vertexB.id, -angleB, vertexB.position);
                    } else {
                      this.drawer.totalOverlapScore = newTotalOverlapScore;
                    }
                  }
                }

                overlapScore = this.drawer.getOverlapScore();
              }
            }
          }
        }

        this.drawer.resolveSecondaryOverlaps(overlapScore.scores);

        if (this.drawer.opts.isomeric) {
          this.drawer.annotateStereochemistry();
        }

        // Initialize pseudo elements or shortcuts
        if (this.drawer.opts.compactDrawing && this.drawer.opts.atomVisualization === 'default') {
          this.drawer.initPseudoElements();
        }

        this.drawer.rotateDrawing();
    }

    isEdgeRotatable(edge: any): boolean {
        let vertexA = this.drawer.graph.vertices[edge.sourceId];
        let vertexB = this.drawer.graph.vertices[edge.targetId];

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
          this.drawer.areVerticesInSameRing(vertexA, vertexB)) {
          return false;
        }

        return true;
    }
}

export = GraphProcessingManager;
