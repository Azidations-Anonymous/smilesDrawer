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

    if (!preprocessor.bridgedRing) {
      this.drawAromaticPolygons();
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
    const isAromaticEdge = edge.isAromatic;

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

    if (edge.bondType === '=' || preprocessor.getRingbondType(vertexA, vertexB) === '=' || isAromaticEdge) {
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
        renderer.drawLine(line, isAromaticEdge);

        renderer.drawLine(new Line(a, b, elementA, elementB));
      } else if ((edge.center || vertexA.isTerminal() && vertexB.isTerminal()) ||
        (s.anCount == 0 && s.bnCount > 1 || s.bnCount == 0 && s.anCount > 1)) {
        this.multiplyNormals(normals, opts.halfBondSpacing);

        let lineA = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB),
          lineB = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

        renderer.drawLine(lineA, isAromaticEdge);
        renderer.drawLine(lineB, isAromaticEdge);
      } else if ((s.sideCount[0] > s.sideCount[1]) ||
        (s.totalSideCount[0] > s.totalSideCount[1])) {
        this.multiplyNormals(normals, opts.bondSpacing);

        let line = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);

        line.shorten(opts.bondLength - opts.shortBondLength * opts.bondLength);

        renderer.drawLine(line, isAromaticEdge);
        renderer.drawLine(new Line(a, b, elementA, elementB));
      } else if ((s.sideCount[0] < s.sideCount[1]) ||
        (s.totalSideCount[0] <= s.totalSideCount[1])) {
        this.multiplyNormals(normals, opts.bondSpacing);

        let line = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

        line.shorten(opts.bondLength - opts.shortBondLength * opts.bondLength);
        renderer.drawLine(line, isAromaticEdge);
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

  private drawAromaticPolygons(): void {
    const renderer = this.drawer.getRenderer();
    if (!renderer.drawDashedPolygon) {
      return;
    }

    const aromaticRings = this.drawer.preprocessor.getAromaticRings();
    for (const ring of aromaticRings) {
      const polygon = this.computeAromaticPolygon(ring);
      if (polygon.length < 2) {
        continue;
      }
      renderer.drawDashedPolygon(polygon);
    }
  }

  private computeAromaticPolygon(ring: Ring): Vector2[] {
    const polygon: Vector2[] = [];
    const center = ring.center;
    if (!center || !ring.members || ring.members.length === 0) {
      return polygon;
    }

    const offset = Math.max(1, this.drawer.preprocessor.opts.bondSpacing * this.drawer.preprocessor.opts.bondLength * 0.5);
    for (const memberId of ring.members) {
      const vertex = this.drawer.preprocessor.graph.vertices[memberId];
      if (!vertex || !vertex.position) {
        continue;
      }

      const toVertex = vertex.position.clone().subtract(center);
      const distance = toVertex.length();
      if (distance < 1e-3) {
        continue;
      }

      const inset = Math.min(offset, distance * 0.5);
      const insetVector = toVertex.clone().normalize().multiplyScalar(inset);
      polygon.push(vertex.position.clone().subtract(insetVector));
    }

    return polygon;
  }

}

export = SvgEdgeDrawer;
