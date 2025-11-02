//@ts-check
import MathHelper = require('../utils/MathHelper');
import Vector2 = require('../graph/Vector2');
import Line = require('../graph/Line');
import Vertex = require('../graph/Vertex');
import Ring = require('../graph/Ring');
import CanvasWedgeDrawer = require('./draw/CanvasWedgeDrawer');
import CanvasPrimitiveDrawer = require('./draw/CanvasPrimitiveDrawer');

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
     * @param {Number} vertexCount The number of vertices in the molecular graph.
     * @param {Object} attachedPseudoElement A map with containing information for pseudo elements or concatinated elements. The key is comprised of the element symbol and the hydrogen count.
     * @param {String} attachedPseudoElement.element The element symbol.
     * @param {Number} attachedPseudoElement.count The number of occurences that match the key.
     * @param {Number} attachedPseudoElement.hyrogenCount The number of hydrogens attached to each atom matching the key.
     */
    drawText(x: number, y: number, elementName: string, hydrogens: number, direction: string, isTerminal: boolean, charge: number, isotope: number, vertexCount: number, attachedPseudoElement: any = {}): void {
        let ctx = this.ctx;
        let offsetX = this.offsetX;
        let offsetY = this.offsetY;

        ctx.save();

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        let pseudoElementHandled = false;

        // Charge
        let chargeText = ''
        let chargeWidth = 0;

        if (charge) {
            chargeText = this.getChargeText(charge);

            ctx.font = this.fontSmall;
            chargeWidth = ctx.measureText(chargeText).width;
        }

        let isotopeText = '0';
        let isotopeWidth = 0;

        if (isotope > 0) {
            isotopeText = isotope.toString();
            ctx.font = this.fontSmall;
            isotopeWidth = ctx.measureText(isotopeText).width;
        }


        // TODO: Better handle exceptions
        // Exception for nitro (draw nitro as NO2 instead of N+O-O)
        if (charge === 1 && elementName === 'N' && attachedPseudoElement.hasOwnProperty('0O') &&
            attachedPseudoElement.hasOwnProperty('0O-1')) {
            attachedPseudoElement = { '0O': { element: 'O', count: 2, hydrogenCount: 0, previousElement: 'C', charge: '' } }
            charge = 0;
        }


        ctx.font = this.fontLarge;
        ctx.fillStyle = this.themeManager.getColor('BACKGROUND');

        let dim = ctx.measureText(elementName);

        // @ts-ignore - Adding custom properties to TextMetrics for internal use
        dim.totalWidth = dim.width + chargeWidth;
        // @ts-ignore - Adding custom properties to TextMetrics for internal use
        dim.height = parseInt(this.fontLarge, 10);

        let r = (dim.width > this.opts.fontSizeLarge) ? dim.width : this.opts.fontSizeLarge;
        r /= 1.5;

        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x + offsetX, y + offsetY, r, 0, MathHelper.twoPI, true);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        let cursorPos = -dim.width / 2.0;
        let cursorPosLeft = -dim.width / 2.0;

        ctx.fillStyle = this.themeManager.getColor(elementName);
        ctx.fillText(elementName, x + offsetX + cursorPos, y + this.opts.halfFontSizeLarge + offsetY);
        cursorPos += dim.width;

        if (charge) {
            ctx.font = this.fontSmall;
            ctx.fillText(chargeText, x + offsetX + cursorPos, y - this.opts.fifthFontSizeSmall + offsetY);
            cursorPos += chargeWidth;
        }

        if (isotope > 0) {
            ctx.font = this.fontSmall;
            ctx.fillText(isotopeText, x + offsetX + cursorPosLeft - isotopeWidth, y - this.opts.fifthFontSizeSmall + offsetY);
            cursorPosLeft -= isotopeWidth;
        }

        ctx.font = this.fontLarge;

        let hydrogenWidth = 0;
        let hydrogenCountWidth = 0;

        if (hydrogens === 1) {
            let hx = x + offsetX;
            let hy = y + offsetY + this.opts.halfFontSizeLarge;

            hydrogenWidth = this.hydrogenWidth;
            cursorPosLeft -= hydrogenWidth;

            if (direction === 'left') {
                hx += cursorPosLeft;
            } else if (direction === 'right') {
                hx += cursorPos;
            } else if (direction === 'up' && isTerminal) {
                hx += cursorPos;
            } else if (direction === 'down' && isTerminal) {
                hx += cursorPos;
            } else if (direction === 'up' && !isTerminal) {
                hy -= this.opts.fontSizeLarge + this.opts.quarterFontSizeLarge;
                hx -= this.halfHydrogenWidth;
            } else if (direction === 'down' && !isTerminal) {
                hy += this.opts.fontSizeLarge + this.opts.quarterFontSizeLarge;
                hx -= this.halfHydrogenWidth;
            }

            ctx.fillText('H', hx, hy);

            cursorPos += hydrogenWidth;
        } else if (hydrogens > 1) {
            let hx = x + offsetX;
            let hy = y + offsetY + this.opts.halfFontSizeLarge;

            hydrogenWidth = this.hydrogenWidth;
            ctx.font = this.fontSmall;
            hydrogenCountWidth = ctx.measureText(hydrogens.toString()).width;
            cursorPosLeft -= hydrogenWidth + hydrogenCountWidth;

            if (direction === 'left') {
                hx += cursorPosLeft;
            } else if (direction === 'right') {
                hx += cursorPos;
            } else if (direction === 'up' && isTerminal) {
                hx += cursorPos;
            } else if (direction === 'down' && isTerminal) {
                hx += cursorPos;
            } else if (direction === 'up' && !isTerminal) {
                hy -= this.opts.fontSizeLarge + this.opts.quarterFontSizeLarge;
                hx -= this.halfHydrogenWidth;
            } else if (direction === 'down' && !isTerminal) {
                hy += this.opts.fontSizeLarge + this.opts.quarterFontSizeLarge;
                hx -= this.halfHydrogenWidth;
            }

            ctx.font = this.fontLarge;
            ctx.fillText('H', hx, hy)

            ctx.font = this.fontSmall;
            ctx.fillText(hydrogens.toString(), hx + this.halfHydrogenWidth + hydrogenCountWidth, hy + this.opts.fifthFontSizeSmall);

            cursorPos += hydrogenWidth + this.halfHydrogenWidth + hydrogenCountWidth;
        }

        if (pseudoElementHandled) {
            ctx.restore();
            return;
        }

        for (let key in attachedPseudoElement) {
            if (!attachedPseudoElement.hasOwnProperty(key)) {
                continue;
            }

            let openParenthesisWidth = 0;
            let closeParenthesisWidth = 0;

            let element = attachedPseudoElement[key].element;
            let elementCount = attachedPseudoElement[key].count;
            let hydrogenCount = attachedPseudoElement[key].hydrogenCount;
            let elementCharge = attachedPseudoElement[key].charge;

            ctx.font = this.fontLarge;

            if (elementCount > 1 && hydrogenCount > 0) {
                openParenthesisWidth = ctx.measureText('(').width;
                closeParenthesisWidth = ctx.measureText(')').width;
            }

            let elementWidth = ctx.measureText(element).width;
            let elementCountWidth = 0;

            let elementChargeText = '';
            let elementChargeWidth = 0;

            hydrogenWidth = 0;

            if (hydrogenCount > 0) {
                hydrogenWidth = this.hydrogenWidth;
            }

            ctx.font = this.fontSmall;

            if (elementCount > 1) {
                elementCountWidth = ctx.measureText(elementCount).width;
            }

            if (elementCharge !== 0) {
                elementChargeText = this.getChargeText(elementCharge);
                elementChargeWidth = ctx.measureText(elementChargeText).width;
            }

            hydrogenCountWidth = 0;

            if (hydrogenCount > 1) {
                hydrogenCountWidth = ctx.measureText(hydrogenCount).width;
            }

            ctx.font = this.fontLarge;

            let hx = x + offsetX;
            let hy = y + offsetY + this.opts.halfFontSizeLarge;

            ctx.fillStyle = this.themeManager.getColor(element);

            if (elementCount > 0) {
                cursorPosLeft -= elementCountWidth;
            }

            if (elementCount > 1 && hydrogenCount > 0) {
                if (direction === 'left') {
                    cursorPosLeft -= closeParenthesisWidth;
                    ctx.fillText(')', hx + cursorPosLeft, hy);
                } else {
                    ctx.fillText('(', hx + cursorPos, hy);
                    cursorPos += openParenthesisWidth;
                }
            }

            if (direction === 'left') {
                cursorPosLeft -= elementWidth;
                ctx.fillText(element, hx + cursorPosLeft, hy)
            } else {
                ctx.fillText(element, hx + cursorPos, hy)
                cursorPos += elementWidth;
            }

            if (hydrogenCount > 0) {
                if (direction === 'left') {
                    cursorPosLeft -= hydrogenWidth + hydrogenCountWidth;
                    ctx.fillText('H', hx + cursorPosLeft, hy)

                    if (hydrogenCount > 1) {
                        ctx.font = this.fontSmall;
                        ctx.fillText(hydrogenCount, hx + cursorPosLeft + hydrogenWidth, hy + this.opts.fifthFontSizeSmall);
                    }
                } else {
                    ctx.fillText('H', hx + cursorPos, hy)
                    cursorPos += hydrogenWidth;

                    if (hydrogenCount > 1) {
                        ctx.font = this.fontSmall;
                        ctx.fillText(hydrogenCount, hx + cursorPos, hy + this.opts.fifthFontSizeSmall);
                        cursorPos += hydrogenCountWidth;
                    }
                }
            }

            ctx.font = this.fontLarge;

            if (elementCount > 1 && hydrogenCount > 0) {
                if (direction === 'left') {
                    cursorPosLeft -= openParenthesisWidth;
                    ctx.fillText('(', hx + cursorPosLeft, hy);
                } else {
                    ctx.fillText(')', hx + cursorPos, hy);
                    cursorPos += closeParenthesisWidth;
                }
            }

            ctx.font = this.fontSmall;

            if (elementCount > 1) {
                if (direction === 'left') {
                    ctx.fillText(elementCount, hx + cursorPosLeft +
                        openParenthesisWidth + closeParenthesisWidth + hydrogenWidth +
                        hydrogenCountWidth + elementWidth, hy + this.opts.fifthFontSizeSmall);
                } else {
                    ctx.fillText(elementCount, hx + cursorPos, hy + this.opts.fifthFontSizeSmall);
                    cursorPos += elementCountWidth;
                }
            }

            if (elementCharge !== 0) {
                if (direction === 'left') {
                    ctx.fillText(elementChargeText, hx + cursorPosLeft +
                        openParenthesisWidth + closeParenthesisWidth + hydrogenWidth +
                        hydrogenCountWidth + elementWidth, y - this.opts.fifthFontSizeSmall + offsetY);
                } else {
                    ctx.fillText(elementChargeText, hx + cursorPos, y - this.opts.fifthFontSizeSmall + offsetY);
                    cursorPos += elementChargeWidth;
                }
            }
        }

        ctx.restore();
    }

    /**
     * Translate the integer indicating the charge to the appropriate text.
     * @param {Number} charge The integer indicating the charge.
     * @returns {String} A string representing a charge.
     */
    getChargeText(charge: number): string {
        if (charge === 1) {
            return '+'
        } else if (charge === 2) {
            return '2+';
        } else if (charge === -1) {
            return '-';
        } else if (charge === -2) {
            return '2-';
        } else {
            return '';
        }
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
}

export = CanvasWrapper;
