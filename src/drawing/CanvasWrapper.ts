//@ts-check
import MathHelper = require('../utils/MathHelper');
import Vector2 = require('../graph/Vector2');
import Line = require('../graph/Line');
import Vertex = require('../graph/Vertex');
import Ring = require('../graph/Ring');
import CanvasWedgeDrawer = require('./draw/CanvasWedgeDrawer');
import CanvasPrimitiveDrawer = require('./draw/CanvasPrimitiveDrawer');
import CanvasTextRenderer = require('./draw/CanvasTextRenderer');

/**
 * A class wrapping a canvas element.
 *
 * @property {HTMLElement} canvas The HTML element for the canvas associated with this CanvasWrapper instance.
 * @property {CanvasRenderingContext2D} ctx The CanvasRenderingContext2D of the canvas associated with this CanvasWrapper instance.
 * @property {Object} colors The colors object as defined in the SmilesDrawer options.
 * @property {Object} opts The SmilesDrawer options.
 * @property {Number} drawingWidth The width of the canvas.
 * @property {Number} drawingHeight The height of the canvas.
 * @property {Number} offsetX The horizontal offset required for centering the drawing.
 * @property {Number} offsetY The vertical offset required for centering the drawing.
 * @property {Number} fontLarge The large font size in pt.
 * @property {Number} fontSmall The small font size in pt.
 */
class CanvasWrapper {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D | null;
    themeManager: any;
    opts: any;
    drawingWidth: number;
    drawingHeight: number;
    offsetX: number;
    offsetY: number;
    fontLarge: string;
    fontSmall: string;
    hydrogenWidth: number;
    halfHydrogenWidth: number;
    halfBondThickness: number;
    devicePixelRatio: number;
    backingStoreRatio: number;
    ratio: number;
    colors: any;
    private wedgeDrawer: CanvasWedgeDrawer;
    private primitiveDrawer: CanvasPrimitiveDrawer;
    private textRenderer: CanvasTextRenderer;

    /**
     * The constructor for the class CanvasWrapper.
     *
     * @param {(String|HTMLElement)} target The canvas id or the canvas HTMLElement.
     * @param {ThemeManager} themeManager Theme manager for setting proper colors.
     * @param {Object} options The smiles drawer options object.
     */
    constructor(target: string | HTMLCanvasElement, themeManager: any, options: any) {
        if (typeof target === 'string') {
            this.canvas = document.getElementById(target) as HTMLCanvasElement;
        } else {
            this.canvas = target;
        }

        this.ctx = this.canvas.getContext('2d');
        this.themeManager = themeManager;
        this.opts = options;
        this.drawingWidth = 0.0;
        this.drawingHeight = 0.0;
        this.offsetX = 0.0;
        this.offsetY = 0.0;

        this.fontLarge = this.opts.fontSizeLarge + 'pt Helvetica, Arial, sans-serif';
        this.fontSmall = this.opts.fontSizeSmall + 'pt Helvetica, Arial, sans-serif';

        this.updateSize(this.opts.width, this.opts.height);

        this.ctx.font = this.fontLarge;
        this.hydrogenWidth = this.ctx.measureText('H').width;
        this.halfHydrogenWidth = this.hydrogenWidth / 2.0;
        this.halfBondThickness = this.opts.bondThickness / 2.0;

                this.wedgeDrawer = new CanvasWedgeDrawer(this);
                this.primitiveDrawer = new CanvasPrimitiveDrawer(this);
                this.textRenderer = new CanvasTextRenderer(this);
    }

    /**
     * Update the width and height of the canvas
     *
     * @param {Number} width
     * @param {Number} height
     */
    updateSize(width: number, height: number): void {
        this.devicePixelRatio = window.devicePixelRatio || 1;
        // @ts-ignore - Vendor-specific canvas properties not in TypeScript definitions
        this.backingStoreRatio = this.ctx.webkitBackingStorePixelRatio || this.ctx.mozBackingStorePixelRatio || this.ctx.msBackingStorePixelRatio || this.ctx.oBackingStorePixelRatio || this.ctx.backingStorePixelRatio || 1;
        this.ratio = this.devicePixelRatio / this.backingStoreRatio;

        if (this.ratio !== 1) {
            this.canvas.width = width * this.ratio;
            this.canvas.height = height * this.ratio;
            this.canvas.style.width = width + 'px';
            this.canvas.style.height = height + 'px';
            this.ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
        } else {
            this.canvas.width = width * this.ratio;
            this.canvas.height = height * this.ratio;
        }
    }

    /**
     * Sets a provided theme.
     *
     * @param {Object} theme A theme from the smiles drawer options.
     */
    setTheme(theme: any): void {
        this.colors = theme;
    }

    /**
     * Scale the canvas based on vertex positions.
     *
     * @param {Vertex[]} vertices An array of vertices containing the vertices associated with the current molecule.
     */
    scale(vertices: any[]): void {
        // Figure out the final size of the image
        let maxX = -Number.MAX_VALUE;
        let maxY = -Number.MAX_VALUE;
        let minX = Number.MAX_VALUE;
        let minY = Number.MAX_VALUE;

        for (var i = 0; i < vertices.length; i++) {
            if (!vertices[i].value.isDrawn) {
                continue;
            }

            let p = vertices[i].position;

            if (maxX < p.x) maxX = p.x;
            if (maxY < p.y) maxY = p.y;
            if (minX > p.x) minX = p.x;
            if (minY > p.y) minY = p.y;
        }

        // Add padding
        var padding = this.opts.padding;
        maxX += padding;
        maxY += padding;
        minX -= padding;
        minY -= padding;

        this.drawingWidth = maxX - minX;
        this.drawingHeight = maxY - minY;

        var scaleX = this.canvas.offsetWidth / this.drawingWidth;
        var scaleY = this.canvas.offsetHeight / this.drawingHeight;

        var scale = (scaleX < scaleY) ? scaleX : scaleY;

        this.ctx.scale(scale, scale);

        this.offsetX = -minX;
        this.offsetY = -minY;

        // Center
        if (scaleX < scaleY) {
            this.offsetY += this.canvas.offsetHeight / (2.0 * scale) - this.drawingHeight / 2.0;
        } else {
            this.offsetX += this.canvas.offsetWidth / (2.0 * scale) - this.drawingWidth / 2.0;
        }
    }

    /**
     * Resets the transform of the canvas.
     */
    reset(): void {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /**
     * Returns the hex code of a color associated with a key from the current theme.
     *
     * @param {String} key The color key in the theme (e.g. C, N, BACKGROUND, ...).
     * @returns {String} A color hex value.
     */
    getColor(key: string): string {
        key = key.toUpperCase();

        if (key in this.colors) {
            return this.colors[key];
        }

        return this.colors['C'];
    }

    /**
     * Draws a dubug dot at a given coordinate and adds text.
     *
     * @param {Number} x The x coordinate.
     * @param {Number} y The y coordindate.
     * @param {String} [debugText=''] A string.
     * @param {String} [color='#f00'] A color in hex form.
     */
    drawDebugPoint(x: number, y: number, debugText: string = '', color: string = '#f00'): void {
        this.drawCircle(x, y, 2, color, true, true, debugText);
    }

    /**
     * Clear the canvas.
     *
     */
    clear(): void {
        this.ctx.clearRect(0, 0, this.canvas.offsetWidth, this.canvas.offsetHeight);
    }

    drawWedge(line: any, width: number = 1.0): void {
        this.wedgeDrawer.drawWedge(line, width);
    }

    drawDashedWedge(line: any): void {
        this.wedgeDrawer.drawDashedWedge(line);
    }

    drawCircle(x: number, y: number, radius: number, color: string, fill: boolean = true, debug: boolean = false, debugText: string = ''): void {
        this.primitiveDrawer.drawCircle(x, y, radius, color, fill, debug, debugText);
    }

    drawLine(line: any, dashed: boolean = false, alpha: number = 1.0): void {
        this.primitiveDrawer.drawLine(line, dashed, alpha);
    }

    drawBall(x: number, y: number, elementName: string): void {
        this.primitiveDrawer.drawBall(x, y, elementName);
    }

    drawPoint(x: number, y: number, elementName: string): void {
        this.primitiveDrawer.drawPoint(x, y, elementName);
    }

    drawAromaticityRing(ring: any): void {
        this.primitiveDrawer.drawAromaticityRing(ring);
    }

    drawDebugText(x: number, y: number, text: string): void {
        this.primitiveDrawer.drawDebugText(x, y, text);
    }

    drawText(x: number, y: number, elementName: string, hydrogens: number, direction: string, isTerminal: boolean, charge: number, isotope: number, vertexCount: number, attachedPseudoElement: any = {}): void {
        this.textRenderer.drawText(x, y, elementName, hydrogens, direction, isTerminal, charge, isotope, vertexCount, attachedPseudoElement);
    }

    getChargeText(charge: number): string {
        return this.textRenderer.getChargeText(charge);
    }
}

export = CanvasWrapper;
