import ArrayHelper = require('../../utils/ArrayHelper');
import Vector2 = require('../../graph/Vector2');
import Ring = require('../../graph/Ring');
import Line = require('../../graph/Line');
import SvgDrawer = require('../SvgDrawer');

class SvgEdgeDrawer {
  constructor(private drawer: SvgDrawer) {}



  /**
   * Draws a ring inside a provided ring, indicating aromaticity.
   *
   * @param {Ring} ring A ring.
   */
  drawAromaticityRing(ring: Ring): void {
    let renderer = this.drawer.getRenderer();
    renderer.drawRing(ring.center.x, ring.center.y, ring.getSize());
  }



  /**
   * Draw the actual edges as bonds.
   *
   * @param {Boolean} debug A boolean indicating whether or not to draw debug helpers.
   */
  drawEdges(debug: boolean): void {
    let preprocessor = this.drawer.preprocessor,
      graph = preprocessor.graph,
      drawn = Array(this.drawer.preprocessor.graph.edges.length);

    drawn.fill(false);

    graph.traverseBF(0, vertex => {
      let edges = graph.getEdges(vertex.id);
      for (var i = 0; i < edges.length; i++) {
        let edgeId = edges[i];
        if (!drawn[edgeId]) {
          drawn[edgeId] = true;
          this.drawEdge(edgeId, debug);
        }
      }
    });

    // Draw ring for implicitly defined aromatic rings
    if (!this.drawer.bridgedRing) {
      const aromaticRings = preprocessor.getAromaticRings();
      for (const ring of aromaticRings) {
        this.drawAromaticityRing(ring);
      }
    }
  }



  /**
   * Draw the an edge as a bond.
   *
   * @param {Number} edgeId An edge id.
   * @param {Boolean} debug A boolean indicating whether or not to draw debug helpers.
   */
  drawEdge(edgeId: number, debug: boolean): void {
    let preprocessor = this.drawer.preprocessor,
      opts = preprocessor.opts,
      renderer = this.drawer.getRenderer(),
      edge = preprocessor.graph.edges[edgeId],
      vertexA = preprocessor.graph.vertices[edge.sourceId],
      vertexB = preprocessor.graph.vertices[edge.targetId],
      elementA = vertexA.value.element,
      elementB = vertexB.value.element;

    if ((!vertexA.value.isDrawn || !vertexB.value.isDrawn) && preprocessor.opts.atomVisualization === 'default') {
      return;
    }

    let a = vertexA.position,
      b = vertexB.position,
      normals = preprocessor.getEdgeNormals(edge),
      // Create a point on each side of the line
      sides = ArrayHelper.clone(normals) as import('../../graph/Vector2')[];

    sides[0].multiplyScalar(10).add(a);
    sides[1].multiplyScalar(10).add(a);

    if (edge.bondType === '=' || preprocessor.getRingbondType(vertexA, vertexB) === '=' ||
      (edge.isPartOfAromaticRing && preprocessor.bridgedRing)) {
      // Always draw double bonds inside the ring
      let inRing = preprocessor.areVerticesInSameRing(vertexA, vertexB);
      let s = preprocessor.chooseSide(vertexA, vertexB, sides);

      if (inRing) {
        // Always draw double bonds inside a ring
        // if the bond is shared by two rings, it is drawn in the larger
        // problem: smaller ring is aromatic, bond is still drawn in larger -> fix this
        let lcr = preprocessor.getLargestOrAromaticCommonRing(vertexA, vertexB);
        let center = lcr.center;

        normals[0].multiplyScalar(opts.bondSpacing);
        normals[1].multiplyScalar(opts.bondSpacing);

        // Choose the normal that is on the same side as the center
        let line = null;

        if (center.sameSideAs(vertexA.position, vertexB.position, Vector2.add(a, normals[0]))) {
          line = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);
        } else {
          line = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);
        }

        line.shorten(opts.bondLength - opts.shortBondLength * opts.bondLength);

        // The shortened edge
        if (edge.isPartOfAromaticRing) {
          renderer.drawLine(line, true);
        } else {
          renderer.drawLine(line);
        }

        renderer.drawLine(new Line(a, b, elementA, elementB));
      } else if ((edge.center || vertexA.isTerminal() && vertexB.isTerminal()) ||
        (s.anCount == 0 && s.bnCount > 1 || s.bnCount == 0 && s.anCount > 1)) {
        this.multiplyNormals(normals, opts.halfBondSpacing);

        let lineA = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB),
          lineB = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

        renderer.drawLine(lineA);
        renderer.drawLine(lineB);
      } else if ((s.sideCount[0] > s.sideCount[1]) ||
        (s.totalSideCount[0] > s.totalSideCount[1])) {
        this.multiplyNormals(normals, opts.bondSpacing);

        let line = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);

        line.shorten(opts.bondLength - opts.shortBondLength * opts.bondLength);

        renderer.drawLine(line);
        renderer.drawLine(new Line(a, b, elementA, elementB));
      } else if ((s.sideCount[0] < s.sideCount[1]) ||
        (s.totalSideCount[0] <= s.totalSideCount[1])) {
        this.multiplyNormals(normals, opts.bondSpacing);

        let line = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

        line.shorten(opts.bondLength - opts.shortBondLength * opts.bondLength);
        renderer.drawLine(line);
        renderer.drawLine(new Line(a, b, elementA, elementB));
      }
    } else if (edge.bondType === '#') {
      normals[0].multiplyScalar(opts.bondSpacing / 1.5);
      normals[1].multiplyScalar(opts.bondSpacing / 1.5);

      let lineA = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);
      let lineB = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

      renderer.drawLine(lineA);
      renderer.drawLine(lineB);
      renderer.drawLine(new Line(a, b, elementA, elementB));
    } else if (edge.bondType === '.') {
      // TODO: Something... maybe... version 2?
    } else {
      let isChiralCenterA = vertexA.value.isStereoCenter;
      let isChiralCenterB = vertexB.value.isStereoCenter;

      if (edge.wedge === 'up') {
        renderer.drawWedge(new Line(a, b, elementA, elementB, isChiralCenterA, isChiralCenterB));
      } else if (edge.wedge === 'down') {
        renderer.drawDashedWedge(new Line(a, b, elementA, elementB, isChiralCenterA, isChiralCenterB));
      } else {
        renderer.drawLine(new Line(a, b, elementA, elementB, isChiralCenterA, isChiralCenterB));
      }
    }

    if (debug) {
      let midpoint = Vector2.midpoint(a, b);
      renderer.drawDebugText(midpoint.x, midpoint.y, 'e: ' + edgeId);
    }
  }



  /**
   * @param {Array} normals list of normals to multiply
   * @param {Number} spacing value to multiply normals by
   */
  multiplyNormals(normals: Vector2[], spacing: number): void {
    normals[0].multiplyScalar(spacing);
    normals[1].multiplyScalar(spacing);
  }
}

export = SvgEdgeDrawer;
