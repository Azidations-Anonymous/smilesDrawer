import DrawerBase from "./DrawerBase";

import Vector2 = require("./Vector2");
import ArrayHelper = require("./ArrayHelper");
import Line = require("./Line");
import Edge = require("./Edge");
import ThemeManager = require("./ThemeManager");
import CanvasWrapper = require("./CanvasWrapper");
import Atom = require("./Atom");
class DrawingManager {
    private drawer: DrawerBase;

    constructor(drawer: DrawerBase) {
        this.drawer = drawer;
    }

    draw(data: any, target: any, themeName: string = 'light', infoOnly: boolean = false): void {
        this.drawer.initDraw(data, themeName, infoOnly, null);

        if (!this.drawer.infoOnly) {
          this.drawer.themeManager = new ThemeManager(this.drawer.opts.themes, themeName);
          this.drawer.canvasWrapper = new CanvasWrapper(target, this.drawer.themeManager, this.drawer.opts);
        }

        if (!infoOnly) {
          this.drawer.processGraph();

          // Set the canvas to the appropriate size
          this.drawer.canvasWrapper.scale(this.drawer.graph.vertices);

          // Do the actual drawing
          this.drawEdges(this.drawer.opts.debug);
          this.drawVertices(this.drawer.opts.debug);
          this.drawer.canvasWrapper.reset();

          if (this.drawer.opts.debug) {
            console.log(this.drawer.graph);
            console.log(this.drawer.rings);
            console.log(this.drawer.ringConnections);
          }
        }
    }

    drawEdges(debug: boolean): void {
        let that = this;
        let drawn = Array(this.drawer.graph.edges.length);
        drawn.fill(false);

        this.drawer.graph.traverseBF(0, function (vertex) {
          let edges = that.drawer.graph.getEdges(vertex.id);
          for (var i = 0; i < edges.length; i++) {
            let edgeId = edges[i];
            if (!drawn[edgeId]) {
              drawn[edgeId] = true;
              that.drawEdge(edgeId, debug);
            }
          }
        });

        // Draw ring for implicitly defined aromatic rings
        if (!this.drawer.bridgedRing) {
          for (var i = 0; i < this.drawer.rings.length; i++) {
            let ring = this.drawer.rings[i];

            if (this.drawer.isRingAromatic(ring)) {
              this.drawer.canvasWrapper.drawAromaticityRing(ring);
            }
          }
        }
    }

    drawEdge(edgeId: number, debug: boolean): void {
        let that = this;
        let edge = this.drawer.graph.edges[edgeId];
        let vertexA = this.drawer.graph.vertices[edge.sourceId];
        let vertexB = this.drawer.graph.vertices[edge.targetId];
        let elementA = vertexA.value.element;
        let elementB = vertexB.value.element;

        if ((!vertexA.value.isDrawn || !vertexB.value.isDrawn) && this.drawer.opts.atomVisualization === 'default') {
          return;
        }

        let a = vertexA.position;
        let b = vertexB.position;
        let normals = this.getEdgeNormals(edge);

        // Create a point on each side of the line
        let sides = ArrayHelper.clone(normals) as any[];

        sides[0].multiplyScalar(10).add(a);
        sides[1].multiplyScalar(10).add(a);

        if (edge.bondType === '=' || this.drawer.getRingbondType(vertexA, vertexB) === '=' ||
          (edge.isPartOfAromaticRing && this.drawer.bridgedRing)) {
          // Always draw double bonds inside the ring
          let inRing = this.drawer.areVerticesInSameRing(vertexA, vertexB);
          let s = this.drawer.chooseSide(vertexA, vertexB, sides);

          if (inRing) {
            // Always draw double bonds inside a ring
            // if the bond is shared by two rings, it is drawn in the larger
            // problem: smaller ring is aromatic, bond is still drawn in larger -> fix this
            let lcr = this.drawer.getLargestOrAromaticCommonRing(vertexA, vertexB);
            let center = lcr.center;

            normals[0].multiplyScalar(that.drawer.opts.bondSpacing);
            normals[1].multiplyScalar(that.drawer.opts.bondSpacing);

            // Choose the normal that is on the same side as the center
            let line = null;

            if (center.sameSideAs(vertexA.position, vertexB.position, Vector2.add(a, normals[0]))) {
              line = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);
            } else {
              line = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);
            }

            line.shorten(this.drawer.opts.bondLength - this.drawer.opts.shortBondLength * this.drawer.opts.bondLength);

            // The shortened edge
            if (edge.isPartOfAromaticRing) {
              this.drawer.canvasWrapper.drawLine(line, true);
            } else {
              this.drawer.canvasWrapper.drawLine(line);
            }

            // The normal edge
            this.drawer.canvasWrapper.drawLine(new Line(a, b, elementA, elementB));
          } else if (edge.center || vertexA.isTerminal() && vertexB.isTerminal()) {
            normals[0].multiplyScalar(that.drawer.opts.halfBondSpacing);
            normals[1].multiplyScalar(that.drawer.opts.halfBondSpacing);

            let lineA = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);
            let lineB = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

            this.drawer.canvasWrapper.drawLine(lineA);
            this.drawer.canvasWrapper.drawLine(lineB);
          } else if (s.anCount == 0 && s.bnCount > 1 || s.bnCount == 0 && s.anCount > 1) {
            // Both lines are the same length here
            // Add the spacing to the edges (which are of unit length)
            normals[0].multiplyScalar(that.drawer.opts.halfBondSpacing);
            normals[1].multiplyScalar(that.drawer.opts.halfBondSpacing);

            let lineA = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);
            let lineB = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

            this.drawer.canvasWrapper.drawLine(lineA);
            this.drawer.canvasWrapper.drawLine(lineB);
          } else if (s.sideCount[0] > s.sideCount[1]) {
            normals[0].multiplyScalar(that.drawer.opts.bondSpacing);
            normals[1].multiplyScalar(that.drawer.opts.bondSpacing);

            let line = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);

            line.shorten(this.drawer.opts.bondLength - this.drawer.opts.shortBondLength * this.drawer.opts.bondLength);
            this.drawer.canvasWrapper.drawLine(line);
            this.drawer.canvasWrapper.drawLine(new Line(a, b, elementA, elementB));
          } else if (s.sideCount[0] < s.sideCount[1]) {
            normals[0].multiplyScalar(that.drawer.opts.bondSpacing);
            normals[1].multiplyScalar(that.drawer.opts.bondSpacing);

            let line = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

            line.shorten(this.drawer.opts.bondLength - this.drawer.opts.shortBondLength * this.drawer.opts.bondLength);
            this.drawer.canvasWrapper.drawLine(line);
            this.drawer.canvasWrapper.drawLine(new Line(a, b, elementA, elementB));
          } else if (s.totalSideCount[0] > s.totalSideCount[1]) {
            normals[0].multiplyScalar(that.drawer.opts.bondSpacing);
            normals[1].multiplyScalar(that.drawer.opts.bondSpacing);

            let line = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);

            line.shorten(this.drawer.opts.bondLength - this.drawer.opts.shortBondLength * this.drawer.opts.bondLength);
            this.drawer.canvasWrapper.drawLine(line);
            this.drawer.canvasWrapper.drawLine(new Line(a, b, elementA, elementB));
          } else if (s.totalSideCount[0] <= s.totalSideCount[1]) {
            normals[0].multiplyScalar(that.drawer.opts.bondSpacing);
            normals[1].multiplyScalar(that.drawer.opts.bondSpacing);

            let line = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

            line.shorten(this.drawer.opts.bondLength - this.drawer.opts.shortBondLength * this.drawer.opts.bondLength);
            this.drawer.canvasWrapper.drawLine(line);
            this.drawer.canvasWrapper.drawLine(new Line(a, b, elementA, elementB));
          } else {

          }
        } else if (edge.bondType === '#') {
          normals[0].multiplyScalar(that.drawer.opts.bondSpacing / 1.5);
          normals[1].multiplyScalar(that.drawer.opts.bondSpacing / 1.5);

          let lineA = new Line(Vector2.add(a, normals[0]), Vector2.add(b, normals[0]), elementA, elementB);
          let lineB = new Line(Vector2.add(a, normals[1]), Vector2.add(b, normals[1]), elementA, elementB);

          this.drawer.canvasWrapper.drawLine(lineA);
          this.drawer.canvasWrapper.drawLine(lineB);

          this.drawer.canvasWrapper.drawLine(new Line(a, b, elementA, elementB));
        } else if (edge.bondType === '.') {
          // TODO: Something... maybe... version 2?
        } else {
          let isChiralCenterA = vertexA.value.isStereoCenter;
          let isChiralCenterB = vertexB.value.isStereoCenter;

          if (edge.wedge === 'up') {
            this.drawer.canvasWrapper.drawWedge(new Line(a, b, elementA, elementB, isChiralCenterA, isChiralCenterB));
          } else if (edge.wedge === 'down') {
            this.drawer.canvasWrapper.drawDashedWedge(new Line(a, b, elementA, elementB, isChiralCenterA, isChiralCenterB));
          } else {
            this.drawer.canvasWrapper.drawLine(new Line(a, b, elementA, elementB, isChiralCenterA, isChiralCenterB));
          }
        }

        if (debug) {
          let midpoint = Vector2.midpoint(a, b);
          this.drawer.canvasWrapper.drawDebugText(midpoint.x, midpoint.y, 'e: ' + edgeId);
        }
    }

    drawVertices(debug: boolean): void {
        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          let vertex = this.drawer.graph.vertices[i];
          let atom = vertex.value;
          let charge = 0;
          let isotope = 0;
          let bondCount = vertex.value.bondCount;
          let element = atom.element;
          let hydrogens = Atom.maxBonds[element] - bondCount;
          let dir = vertex.getTextDirection(this.drawer.graph.vertices);
          let isTerminal = this.drawer.opts.terminalCarbons || element !== 'C' || atom.hasAttachedPseudoElements ? vertex.isTerminal() : false;
          let isCarbon = atom.element === 'C';
          // This is a HACK to remove all hydrogens from nitrogens in aromatic rings, as this
          // should be the most common state. This has to be fixed by kekulization
          if (atom.element === 'N' && atom.isPartOfAromaticRing) {
            hydrogens = 0;
          }

          if (atom.bracket) {
            hydrogens = atom.bracket.hcount;
            charge = atom.bracket.charge;
            isotope = atom.bracket.isotope;
          }

          // If the molecule has less than 3 elements, always write the "C" for carbon
          // Likewise, if the carbon has a charge or an isotope, always draw it
          if (charge || isotope || this.drawer.graph.vertices.length < 3) {
            isCarbon = false;
          }

          if (this.drawer.opts.atomVisualization === 'allballs') {
            this.drawer.canvasWrapper.drawBall(vertex.position.x, vertex.position.y, element);
          } else if ((atom.isDrawn && (!isCarbon || atom.drawExplicit || isTerminal || atom.hasAttachedPseudoElements)) || this.drawer.graph.vertices.length === 1) {
            if (this.drawer.opts.atomVisualization === 'default') {
              this.drawer.canvasWrapper.drawText(vertex.position.x, vertex.position.y,
                element, hydrogens, dir, isTerminal, charge, isotope, this.drawer.graph.vertices.length, atom.getAttachedPseudoElements());
            } else if (this.drawer.opts.atomVisualization === 'balls') {
              this.drawer.canvasWrapper.drawBall(vertex.position.x, vertex.position.y, element);
            }
          } else if (vertex.getNeighbourCount() === 2 && vertex.forcePositioned == true) {
            // If there is a carbon which bonds are in a straight line, draw a dot
            let a = this.drawer.graph.vertices[vertex.neighbours[0]].position;
            let b = this.drawer.graph.vertices[vertex.neighbours[1]].position;
            let angle = Vector2.threePointangle(vertex.position, a, b);

            if (Math.abs(Math.PI - angle) < 0.1) {
              this.drawer.canvasWrapper.drawPoint(vertex.position.x, vertex.position.y, element);
            }
          }

          if (debug) {
            let value = 'v: ' + vertex.id + ' ' + ArrayHelper.print(atom.ringbonds);
            this.drawer.canvasWrapper.drawDebugText(vertex.position.x, vertex.position.y, value);
          } else {
            // this.drawer.canvasWrapper.drawDebugText(vertex.position.x, vertex.position.y, vertex.value.chirality);
          }
        }

        // Draw the ring centers for debug purposes
        if (this.drawer.opts.debug) {
          for (var j = 0; j < this.drawer.rings.length; j++) {
            let center = this.drawer.rings[j].center;
            this.drawer.canvasWrapper.drawDebugPoint(center.x, center.y, 'r: ' + this.drawer.rings[j].id);
          }
        }
    }

    rotateDrawing(): void {
        // Rotate the vertices to make the molecule align horizontally
        // Find the longest distance
        let a = 0;
        let b = 0;
        let maxDist = 0;
        for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
          let vertexA = this.drawer.graph.vertices[i];

          if (!vertexA.value.isDrawn) {
            continue;
          }

          for (var j = i + 1; j < this.drawer.graph.vertices.length; j++) {
            let vertexB = this.drawer.graph.vertices[j];

            if (!vertexB.value.isDrawn) {
              continue;
            }

            let dist = vertexA.position.distanceSq(vertexB.position);

            if (dist > maxDist) {
              maxDist = dist;
              a = i;
              b = j;
            }
          }
        }

        let angle = -Vector2.subtract(this.drawer.graph.vertices[a].position, this.drawer.graph.vertices[b].position).angle();

        if (!isNaN(angle)) {
          // Round to 30 degrees
          let remainder = angle % 0.523599;

          // Round either up or down in 30 degree steps
          if (remainder < 0.2617995) {
            angle = angle - remainder;
          } else {
            angle += 0.523599 - remainder;
          }

          // Finally, rotate everything
          for (var i = 0; i < this.drawer.graph.vertices.length; i++) {
            if (i === b) {
              continue;
            }

            this.drawer.graph.vertices[i].position.rotateAround(angle, this.drawer.graph.vertices[b].position);
          }

          for (var i = 0; i < this.drawer.rings.length; i++) {
            this.drawer.rings[i].center.rotateAround(angle, this.drawer.graph.vertices[b].position);
          }
        }
    }

    getEdgeNormals(edge: any): any[] {
        let v1 = this.drawer.graph.vertices[edge.sourceId].position;
        let v2 = this.drawer.graph.vertices[edge.targetId].position;

        // Get the normalized normals for the edge
        let normals = Vector2.units(v1, v2);

        return normals;
    }
}
export = DrawingManager;
