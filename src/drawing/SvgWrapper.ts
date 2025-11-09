import SvgConversionHelper = require('./helpers/SvgConversionHelper');
import SvgTextHelper = require('./helpers/SvgTextHelper');
import Line = require('../graph/Line');
import Vertex = require('../graph/Vertex');
import SvgUnicodeHelper = require('./helpers/SvgUnicodeHelper');
import Vector2 = require('../graph/Vector2');
import MathHelper = require('../utils/MathHelper');
import { IMoleculeOptions, AttachedPseudoElements } from '../config/IOptions';
import ThemeManager = require('../config/ThemeManager');
import { TextDirection } from '../types/CommonTypes';
import IDrawingSurface = require('./renderers/IDrawingSurface');
function makeid(length: number): string {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

class SvgWrapper implements IDrawingSurface {
  svg: SVGElement;
  container: SVGElement | null;
  opts: IMoleculeOptions;
  uid: string;
  gradientId: number;
  backgroundItems: SVGElement[];
  paths: SVGElement[];
  vertices: SVGElement[];
  gradients: SVGElement[];
  highlights: SVGElement[];
  drawingWidth: number;
  drawingHeight: number;
  halfBondThickness: number;
  themeManager: ThemeManager;
  maskElements: SVGElement[];
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  style: SVGStyleElement;

  constructor(themeManager: ThemeManager, target: string | SVGElement, options: IMoleculeOptions, clear: boolean = true) {
    if (typeof target === 'string') {
      this.svg = document.getElementById(target) as unknown as SVGElement;
    } else {
      this.svg = target;
    }

    this.container = null;
    this.opts = options;
    this.uid = makeid(5);
    this.gradientId = 0;

    // maintain a list of line elements and their corresponding gradients
    // maintain a list of vertex elements
    // maintain a list of highlighting elements
    this.backgroundItems = []
    this.paths = [];
    this.vertices = [];
    this.gradients = [];
    this.highlights = [];

    // maintain the dimensions
    this.drawingWidth = 0;
    this.drawingHeight = 0;
    this.halfBondThickness = this.opts.bondThickness / 2.0;

    // for managing color schemes
    this.themeManager = themeManager;

    // create the mask
    this.maskElements = [];

    // min and max values of the coordinates
    this.maxX = -Number.MAX_VALUE;
    this.maxY = -Number.MAX_VALUE;
    this.minX = Number.MAX_VALUE;
    this.minY = Number.MAX_VALUE;

    // clear the svg element
    if (clear) {
      while (this.svg.firstChild) {
        this.svg.removeChild(this.svg.firstChild);
      }
    }

    // Create styles here as text measurement is done before constructSvg
    this.style = document.createElementNS('http://www.w3.org/2000/svg', 'style');

    // create the css styles
    this.style.appendChild(document.createTextNode(`
                .element {
                    font: ${this.opts.fontSizeLarge}pt ${this.opts.fontFamily};
                }
                .sub {
                    font: ${this.opts.fontSizeSmall}pt ${this.opts.fontFamily};
                }
                .annotation {
                    font: ${this.opts.atomAnnotationFontSize}pt ${this.opts.fontFamily};
                    text-anchor: middle;
                    dominant-baseline: text-after-edge;
                }
            `));

    if (this.svg) {
      this.svg.appendChild(this.style);
    } else {
      this.container = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      this.container.appendChild(this.style);
    }
  }

  constructSvg(): SVGElement | null {
    // TODO: add the defs element to put gradients in
    let defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'),
      masks = document.createElementNS('http://www.w3.org/2000/svg', 'mask'),
      background = document.createElementNS('http://www.w3.org/2000/svg', 'g'),
      highlights = document.createElementNS('http://www.w3.org/2000/svg', 'g'),
      paths = document.createElementNS('http://www.w3.org/2000/svg', 'g'),
      vertices = document.createElementNS('http://www.w3.org/2000/svg', 'g'),
      pathChildNodes = this.paths;


    let mask = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    mask.setAttributeNS(null, 'x', this.minX.toString());
    mask.setAttributeNS(null, 'y', this.minY.toString());
    mask.setAttributeNS(null, 'width', (this.maxX - this.minX).toString());
    mask.setAttributeNS(null, 'height', (this.maxY - this.minY).toString());
    mask.setAttributeNS(null, 'fill', 'white');

    masks.appendChild(mask);

    // give the mask an id
    masks.setAttributeNS(null, 'id', this.uid + '-text-mask');

    for (let path of pathChildNodes) {
      paths.appendChild(path);
    }

    for (let backgroundItem of this.backgroundItems) {
      background.appendChild(backgroundItem)
    }
    for (let highlight of this.highlights) {
      highlights.appendChild(highlight)
    }
    for (let vertex of this.vertices) {
      vertices.appendChild(vertex);
    }
    for (let mask of this.maskElements) {
      masks.appendChild(mask);
    }
    for (let gradient of this.gradients) {
      defs.appendChild(gradient);
    }

    paths.setAttributeNS(null, 'mask', 'url(#' + this.uid + '-text-mask)');

    this.updateViewbox(this.opts.scale);

    // Position the background
    background.setAttributeNS(null, 'style', `transform: translateX(${this.minX}px) translateY(${this.minY}px)`);

    if (this.svg) {
      this.svg.appendChild(defs);
      this.svg.appendChild(masks);
      this.svg.appendChild(background);
      this.svg.appendChild(highlights);
      this.svg.appendChild(paths);
      this.svg.appendChild(vertices);
    } else {
      this.container.appendChild(defs);
      this.container.appendChild(masks);
      this.container.appendChild(background);
      this.container.appendChild(paths);
      this.container.appendChild(vertices);
      return this.container;
    }
  }

  finalize(): void {
    this.constructSvg();
  }

  /**
   * Add a background to the svg.
   */
  addLayer(svg: SVGElement): void {
    this.backgroundItems.push(svg.firstChild as SVGElement);
  }

  /**
   * Create a linear gradient to apply to a line
   *
   * @param {Line} line the line to apply the gradiation to.
   */
  createGradient(line: Line): string {
    // create the gradient and add it
    let gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient'),
      gradientUrl = this.uid + `-line-${this.gradientId++}`,
      l = line.getLeftVector(),
      r = line.getRightVector(),
      fromX = l.x,
      fromY = l.y,
      toX = r.x,
      toY = r.y;

    gradient.setAttributeNS(null, 'id', gradientUrl);
    gradient.setAttributeNS(null, 'gradientUnits', 'userSpaceOnUse');
    gradient.setAttributeNS(null, 'x1', fromX.toString());
    gradient.setAttributeNS(null, 'y1', fromY.toString());
    gradient.setAttributeNS(null, 'x2', toX.toString());
    gradient.setAttributeNS(null, 'y2', toY.toString());

    let firstStop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    firstStop.setAttributeNS(null, 'stop-color', this.themeManager.getColor(line.getLeftElement()) || this.themeManager.getColor('C'));
    firstStop.setAttributeNS(null, 'offset', '20%');

    let secondStop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    secondStop.setAttributeNS(null, 'stop-color', this.themeManager.getColor(line.getRightElement() || this.themeManager.getColor('C')));
    secondStop.setAttributeNS(null, 'offset', '100%');

    gradient.appendChild(firstStop);
    gradient.appendChild(secondStop);

    this.gradients.push(gradient);

    return gradientUrl;
  }

  /**
   * Create a tspan element for sub or super scripts that styles the text
   * appropriately as one of those text types.
   *
   * @param {String} text the actual text
   * @param {String} shift the type of text, either 'sub', or 'super'
   */
  createSubSuperScripts(text: string, shift: string): SVGElement {
    let elem = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    elem.setAttributeNS(null, 'baseline-shift', shift);
    elem.appendChild(document.createTextNode(text));
    elem.setAttributeNS(null, 'class', 'sub');

    return elem;
  }

  /**
   * Determine drawing dimensiosn based on vertex positions.
   *
   * @param {Vertex[]} vertices An array of vertices containing the vertices associated with the current molecule.
   */
  determineDimensions(vertices: Vertex[]): void {
    for (var i = 0; i < vertices.length; i++) {
      if (!vertices[i].value.isDrawn) {
        continue;
      }

      let p = vertices[i].position;

      if (this.maxX < p.x) this.maxX = p.x;
      if (this.maxY < p.y) this.maxY = p.y;
      if (this.minX > p.x) this.minX = p.x;
      if (this.minY > p.y) this.minY = p.y;
    }

    // Add padding
    let padding = this.opts.padding;
    this.maxX += padding;
    this.maxY += padding;
    this.minX -= padding;
    this.minY -= padding;

    this.drawingWidth = this.maxX - this.minX;
    this.drawingHeight = this.maxY - this.minY;
  }

  getBounds(): IDrawingSurface.Bounds {
    return {
      minX: this.minX,
      minY: this.minY,
      maxX: this.maxX,
      maxY: this.maxY,
      width: this.drawingWidth,
      height: this.drawingHeight
    };
  }

  updateViewbox(scale: number): void {
    let x = this.minX;
    let y = this.minY;
    let width = this.maxX - this.minX;
    let height = this.maxY - this.minY;

    if (scale <= 0.0) {
      if (width > height) {
        let diff = width - height;
        height = width;
        y -= diff / 2.0;
      } else {
        let diff = height - width;
        width = height;
        x -= diff / 2.0;
      }
    } else {
      if (this.svg) {
        this.svg.style.width = scale * width + 'px';
        this.svg.style.height = scale * height + 'px';
      }
    }

    this.svg.setAttributeNS(null, 'viewBox', `${x} ${y} ${width} ${height}`);
  }

  /**
   * Draw an svg ellipse as a ball.
   *
   * @param {Number} x The x position of the text.
   * @param {Number} y The y position of the text.
   * @param {String} elementName The name of the element (single-letter).
   */
  drawBall(x: number, y: number, elementName: string): void {
    let r = this.opts.bondLength / 4.5;

    if (x - r < this.minX) {
      this.minX = x - r;
    }

    if (x + r > this.maxX) {
      this.maxX = x + r;
    }

    if (y - r < this.minY) {
      this.minY = y - r;
    }

    if (y + r > this.maxY) {
      this.maxY = y + r;
    }

    let ball = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ball.setAttributeNS(null, 'cx', x.toString());
    ball.setAttributeNS(null, 'cy', y.toString());
    ball.setAttributeNS(null, 'r', r.toString());
    ball.setAttributeNS(null, 'fill', this.themeManager.getColor(elementName));

    this.vertices.push(ball);
  }

  /**
   * @param {Line} line the line object to create the wedge from
   */
  drawWedge(line: Line): void {
    let l = line.getLeftVector().clone(),
      r = line.getRightVector().clone();

    let normals = Vector2.normals(l, r);

    normals[0].normalize();
    normals[1].normalize();

    let isRightChiralCenter = line.getRightChiral();

    let start = l,
      end = r;

    if (isRightChiralCenter) {
      start = r;
      end = l;
    }

    let t = Vector2.add(start, Vector2.multiplyScalar(normals[0], this.halfBondThickness)),
      u = Vector2.add(end, Vector2.multiplyScalar(normals[0], 3.0 + this.opts.fontSizeLarge / 4.0)),
      v = Vector2.add(end, Vector2.multiplyScalar(normals[1], 3.0 + this.opts.fontSizeLarge / 4.0)),
      w = Vector2.add(start, Vector2.multiplyScalar(normals[1], this.halfBondThickness));

    let polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon'),
      gradient = this.createGradient(line);
    polygon.setAttributeNS(null, 'points', `${t.x},${t.y} ${u.x},${u.y} ${v.x},${v.y} ${w.x},${w.y}`);
    polygon.setAttributeNS(null, 'fill', `url('#${gradient}')`);
    this.paths.push(polygon);
  }

  /* Draw a highlight for an atom
   *
   *  @param {Number} x The x position of the highlight
   *  @param {Number} y The y position of the highlight
   *  @param {string} color The color of the highlight, default #03fc9d
   */
  drawAtomHighlight(x: number, y: number, color: string = "#03fc9d"): void {
    let ball = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ball.setAttributeNS(null, 'cx', x.toString());
    ball.setAttributeNS(null, 'cy', y.toString());
    ball.setAttributeNS(null, 'r', (this.opts.bondLength / 3).toString());
    ball.setAttributeNS(null, 'fill', color);

    this.highlights.push(ball);
  }

  /**
   * Draw a dashed wedge on the canvas.
   *
   * @param {Line} line A line.
   */
  drawDashedWedge(line: Line): void {
    if (isNaN(line.from.x) || isNaN(line.from.y) ||
      isNaN(line.to.x) || isNaN(line.to.y)) {
      return;
    }

    let l = line.getLeftVector().clone(),
      r = line.getRightVector().clone(),
      normals = Vector2.normals(l, r);

    normals[0].normalize();
    normals[1].normalize();

    let isRightChiralCenter = line.getRightChiral(),
      start,
      end;

    if (isRightChiralCenter) {
      start = r;
      end = l;
    } else {
      start = l;
      end = r;
    }

    let dir = Vector2.subtract(end, start).normalize(),
      length = line.getLength(),
      step = 1.25 / (length / (this.opts.bondLength / 10.0)),
      changed = false;

    let gradient = this.createGradient(line);

    for (let t = 0.0; t < 1.0; t += step) {
      let to = Vector2.multiplyScalar(dir, t * length),
        startDash = Vector2.add(start, to),
        width = this.opts.fontSizeLarge / 2.0 * t,
        dashOffset = Vector2.multiplyScalar(normals[0], width);

      startDash.subtract(dashOffset);
      let endDash = startDash.clone();
      endDash.add(Vector2.multiplyScalar(dashOffset, 2.0));

      this.drawLine(new Line(startDash, endDash), null, gradient);
    }
  }

  /**
   * Draws a debug dot at a given coordinate and adds text.
   *
   * @param {Number} x The x coordinate.
   * @param {Number} y The y coordindate.
   * @param {String} [debugText=''] A string.
   * @param {String} [color='#f00'] A color in hex form.
   */
  drawDebugPoint(x: number, y: number, debugText: string = '', color: string = '#f00'): void {
    let point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    point.setAttributeNS(null, 'cx', x.toString());
    point.setAttributeNS(null, 'cy', y.toString());
    point.setAttributeNS(null, 'r', '2');
    point.setAttributeNS(null, 'fill', '#f00');
    this.vertices.push(point);
    this.drawDebugText(x, y, debugText);
  }

  /**
   * Draws a debug text message at a given position
   *
   * @param {Number} x The x coordinate.
   * @param {Number} y The y coordinate.
   * @param {String} text The debug text.
   */
  drawDebugText(x: number, y: number, text: string): void {
    let textElem = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textElem.setAttributeNS(null, 'x', x.toString());
    textElem.setAttributeNS(null, 'y', y.toString());
    textElem.setAttributeNS(null, 'class', 'debug');
    textElem.setAttributeNS(null, 'fill', '#ff0000');
    textElem.setAttributeNS(null, 'style', `
                font: 5px Droid Sans, sans-serif;
            `);
    textElem.appendChild(document.createTextNode(text));

    this.vertices.push(textElem);
  }

  drawAnnotation(x: number, y: number, text: string, options?: { fontSize?: number; color?: string }): void {
    const annotation = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    const fontSize = options?.fontSize ?? this.opts.atomAnnotationFontSize;
    annotation.setAttributeNS(null, 'x', x.toString());
    annotation.setAttributeNS(null, 'y', y.toString());
    annotation.setAttributeNS(null, 'class', 'annotation');
    annotation.setAttributeNS(null, 'text-anchor', 'middle');
    annotation.setAttributeNS(null, 'fill', options?.color ?? this.themeManager.getColor(null));
    annotation.setAttributeNS(null, 'font-size', `${fontSize}`);

    const lines = text.split('\n');
    lines.forEach((line, index) => {
      const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      if (index > 0) {
        tspan.setAttributeNS(null, 'x', x.toString());
        tspan.setAttributeNS(null, 'dy', `${fontSize}`);
      }
      tspan.textContent = line;
      annotation.appendChild(tspan);
    });

    this.vertices.push(annotation);
  }


  /**
   * Draws a ring.
   *
   * @param {x} x The x coordinate of the ring.
   * @param {y} r The y coordinate of the ring.
   * @param {s} s The size of the ring.
   */
  drawRing(x: number, y: number, s: number): void {
    let circleElem = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    let radius = MathHelper.apothemFromSideLength(this.opts.bondLength, s);
    circleElem.setAttributeNS(null, 'cx', x.toString());
    circleElem.setAttributeNS(null, 'cy', y.toString());
    circleElem.setAttributeNS(null, 'r', (radius - this.opts.bondSpacing).toString());
    circleElem.setAttributeNS(null, 'stroke', this.themeManager.getColor('C'));
    circleElem.setAttributeNS(null, 'stroke-width', this.opts.bondThickness.toString());
    circleElem.setAttributeNS(null, 'fill', 'none');
    this.paths.push(circleElem);
  }


  /**
   * Draws a line.
   *
   * @param {Line} line A line.
   * @param {Boolean} dashed defaults to false.
   * @param {String} gradient gradient url. Defaults to null.
   */
  drawLine(line: Line, dashed: boolean = false, gradient: string | null = null, linecap: string = 'round'): void {
    let opts = this.opts,
      stylesArr = [
        ['stroke-width', this.opts.bondThickness],
        ['stroke-linecap', linecap],
        ['stroke-dasharray', dashed ? '3,2' : 'none'],
      ],
      l = line.getLeftVector(),
      r = line.getRightVector(),
      fromX = l.x,
      fromY = l.y,
      toX = r.x,
      toY = r.y;

    let styles = stylesArr.map(sub => sub.join(':')).join(';'),
      lineElem = document.createElementNS('http://www.w3.org/2000/svg', 'line');

    lineElem.setAttributeNS(null, 'x1', fromX.toString());
    lineElem.setAttributeNS(null, 'y1', fromY.toString());
    lineElem.setAttributeNS(null, 'x2', toX.toString());
    lineElem.setAttributeNS(null, 'y2', toY.toString());
    lineElem.setAttributeNS(null, 'style', styles);
    this.paths.push(lineElem);

    if (gradient == null) {
      gradient = this.createGradient(line);
    }
    lineElem.setAttributeNS(null, 'stroke', `url('#${gradient}')`);
  }

  /**
   * Draw a point.
   *
   * @param {Number} x The x position of the point.
   * @param {Number} y The y position of the point.
   * @param {String} elementName The name of the element (single-letter).
   */
  drawPoint(x: number, y: number, elementName: string): void {
    let r = 0.75;

    if (x - r < this.minX) {
      this.minX = x - r;
    }

    if (x + r > this.maxX) {
      this.maxX = x + r;
    }

    if (y - r < this.minY) {
      this.minY = y - r;
    }

    if (y + r > this.maxY) {
      this.maxY = y + r;
    }

    // first create a mask
    let mask = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    mask.setAttributeNS(null, 'cx', x.toString());
    mask.setAttributeNS(null, 'cy', y.toString());
    mask.setAttributeNS(null, 'r', '1.5');
    mask.setAttributeNS(null, 'fill', 'black');
    this.maskElements.push(mask);

    // now create the point
    let point = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    point.setAttributeNS(null, 'cx', x.toString());
    point.setAttributeNS(null, 'cy', y.toString());
    point.setAttributeNS(null, 'r', r.toString());
    point.setAttributeNS(null, 'fill', this.themeManager.getColor(elementName));
    this.vertices.push(point);
  }

  drawDashedPolygon(points: Vector2[], color?: string): void {
    if (!points || points.length < 2) {
      return;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const segments = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`);
    path.setAttributeNS(null, 'd', `${segments.join(' ')} Z`);
    path.setAttributeNS(null, 'fill', 'none');
    path.setAttributeNS(null, 'stroke', color || this.themeManager.getColor('C'));
    path.setAttributeNS(null, 'stroke-width', (this.opts.bondThickness / 1.5).toString());
    path.setAttributeNS(null, 'stroke-linecap', 'round');
    path.setAttributeNS(null, 'stroke-linejoin', 'round');
    path.setAttributeNS(null, 'stroke-dasharray', '3,2');
    this.paths.push(path);
  }


  /**
   * Draw a text to the canvas.
   *
   * @param {Number} x The x position of the text.
   * @param {Number} y The y position of the text.
   * @param {String} elementName The name of the element (single-letter).
   * @param {Number} hydrogens The number of hydrogen atoms.
   * @param {String} direction The direction of the text in relation to the associated vertex.
   * @param {Boolean} isTerminal A boolean indicating whether or not the vertex is terminal.
   * @param {Number} charge The charge of the atom.
   * @param {Number} isotope The isotope number.
   * @param {Number} totalVertices The total number of vertices in the graph.
   * @param {Object} attachedPseudoElement A map with containing information for pseudo elements or concatinated elements. The key is comprised of the element symbol and the hydrogen count.
   * @param {String} attachedPseudoElement.element The element symbol.
   * @param {Number} attachedPseudoElement.count The number of occurences that match the key.
   * @param {Number} attachedPseudoElement.hyrogenCount The number of hydrogens attached to each atom matching the key.
   */
  drawText(x: number, y: number, elementName: string, hydrogens: number, direction: TextDirection, isTerminal: boolean, charge: number, isotope: number, totalVertices: number, attachedPseudoElement: AttachedPseudoElements = {}): void {
    let text = [];
    let display = elementName;

    if (charge !== 0 && charge !== null) {
      display += SvgUnicodeHelper.createUnicodeCharge(charge);
    }

    if (isotope !== 0 && isotope !== null) {
      display = SvgUnicodeHelper.createUnicodeSuperscript(isotope) + display;
    }

    text.push([display, elementName]);

    if (hydrogens === 1) {
      text.push(['H', 'H'])
    } else if (hydrogens > 1) {
      text.push(['H' + SvgUnicodeHelper.createUnicodeSubscript(hydrogens), 'H'])
    }

    // TODO: Better handle exceptions
    // Exception for nitro (draw nitro as NO2 instead of N+O-O)
    if (charge === 1 && elementName === 'N' && attachedPseudoElement.hasOwnProperty('0O') &&
      attachedPseudoElement.hasOwnProperty('0O-1')) {
      attachedPseudoElement = { '0O': { element: 'O', count: 2, hydrogenCount: 0, previousElement: 'C', charge: 0 } }
      charge = 0;
    }

    for (let key in attachedPseudoElement) {
      if (!attachedPseudoElement.hasOwnProperty(key)) {
        continue;
      }

      let pe = attachedPseudoElement[key];
      let display = pe.element;

      if (pe.count > 1) {
        display += SvgUnicodeHelper.createUnicodeSubscript(pe.count);
      }

      if (pe.charge !== 0) {
        display += SvgUnicodeHelper.createUnicodeCharge(pe.charge);
      }

      text.push([display, pe.element]);

      if (pe.hydrogenCount === 1) {
        text.push(['H', 'H'])
      } else if (pe.hydrogenCount > 1) {
        text.push(['H' + SvgUnicodeHelper.createUnicodeSubscript(pe.hydrogenCount), 'H'])
      }
    }

    this.write(text, direction, x, y, totalVertices === 1);
  }

  write(text: [string, string][], direction: TextDirection, x: number, y: number, singleVertex: boolean): void {
    // Measure element name only, without charge or isotope ...
    let bbox = SvgTextHelper.measureText(text[0][1], this.opts.fontSizeLarge, this.opts.fontFamily);

    // ... but for direction left move to the right to 
    if (direction === 'left' && text[0][0] !== text[0][1]) {
      bbox.width *= 2.0;
    }

    // Get the approximate width and height of text and add update max/min
    // to allow for narrower paddings
    if (singleVertex) {
      if (x + bbox.width * text.length > this.maxX) {
        this.maxX = x + bbox.width * text.length;
      }
      if (x - bbox.width / 2.0 < this.minX) {
        this.minX = x - bbox.width / 2.0;
      }
      if (y - bbox.height < this.minY) {
        this.minY = y - bbox.height;
      }
      if (y + bbox.height > this.maxY) {
        this.maxY = y + bbox.height;
      }
    } else {
      if (direction !== 'right') {
        if (x + bbox.width * text.length > this.maxX) {
          this.maxX = x + bbox.width * text.length;
        }
        if (x - bbox.width * text.length < this.minX) {
          this.minX = x - bbox.width * text.length;
        }
      } else {
        if (x + bbox.width * text.length > this.maxX) {
          this.maxX = x + bbox.width * text.length;
        }
        if (x - bbox.width / 2.0 < this.minX) {
          this.minX = x - bbox.width / 2.0;
        }
      }

      if (y - bbox.height < this.minY) {
        this.minY = y - bbox.height;
      }

      if (y + bbox.height > this.maxY) {
        this.maxY = y + bbox.height;
      }

      if (direction === 'down') {
        if (y + 0.8 * bbox.height * text.length > this.maxY) {
          this.maxY = y + 0.8 * bbox.height * text.length;
        }
      }

      if (direction === 'up') {
        if (y - 0.8 * bbox.height * text.length < this.minY) {
          this.minY = y - 0.8 * bbox.height * text.length;
        }
      }
    }

    let cx = x;
    let cy = y;

    // Draw the text
    let textElem = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textElem.setAttributeNS(null, 'class', 'element');
    let g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    textElem.setAttributeNS(null, 'fill', '#ffffff');

    if (direction === 'left') {
      text = text.reverse();
    }

    if (direction === 'right' || direction === 'down' || direction === 'up') {
      x -= bbox.width / 2.0;
    }

    if (direction === 'left') {
      x += bbox.width / 2.0;
    }

    text.forEach((part, i) => {
      const display = part[0];
      const elementName = part[1];
      let tspanElem = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspanElem.setAttributeNS(null, 'fill', this.themeManager.getColor(elementName));
      tspanElem.textContent = display;

      if (direction === 'up' || direction === 'down') {
        tspanElem.setAttributeNS(null, 'x', '0px')
        if (direction === 'up') {
          tspanElem.setAttributeNS(null, 'y', `-${0.9 * i}em`);
        } else {
          tspanElem.setAttributeNS(null, 'y', `${0.9 * i}em`);
        }
      }

      textElem.appendChild(tspanElem);
    })

    textElem.setAttributeNS(null, 'data-direction', direction);

    if (direction === 'left' || direction === 'right') {
      textElem.setAttributeNS(null, 'dominant-baseline', 'alphabetic');
      textElem.setAttributeNS(null, 'y', '0.36em');
    } else {
      textElem.setAttributeNS(null, 'dominant-baseline', 'central');
    }

    if (direction === 'left') {
      textElem.setAttributeNS(null, 'text-anchor', 'end');
    }

    g.appendChild(textElem)

    g.setAttributeNS(null, 'style', `transform: translateX(${x}px) translateY(${y}px)`);

    let maskRadius = this.opts.fontSizeLarge * 0.75;
    if (text[0][1].length > 1) {
      maskRadius = this.opts.fontSizeLarge * 1.1;
    }

    let mask = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    mask.setAttributeNS(null, 'cx', cx.toString());
    mask.setAttributeNS(null, 'cy', cy.toString());
    mask.setAttributeNS(null, 'r', maskRadius.toString());
    mask.setAttributeNS(null, 'fill', 'black');

    this.maskElements.push(mask);

    this.vertices.push(g);
  }

  /**
   * Draw the wrapped SVG to a canvas.
   * @param {HTMLCanvasElement} canvas The canvas element to draw the svg to.
   */
  toCanvas(canvas: string | HTMLCanvasElement, width: number, height: number): void {
    if (typeof canvas === 'string') {
      canvas = document.getElementById(canvas) as HTMLCanvasElement;
    }

    let image = new Image();

    image.onload = function () {
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(image, 0, 0, width, height);
    };

    image.src = 'data:image/svg+xml;charset-utf-8,' + encodeURIComponent(this.svg.outerHTML);
  }
}

export = SvgWrapper;
