import MathHelper = require('../../utils/MathHelper');
import CanvasWrapper = require('../CanvasWrapper');

class CanvasTextRenderer {
  constructor(private wrapper: CanvasWrapper) {}



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
        let ctx = this.wrapper.ctx;
        let offsetX = this.wrapper.offsetX;
        let offsetY = this.wrapper.offsetY;

        ctx.save();

        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';

        let pseudoElementHandled = false;

        // Charge
        let chargeText = ''
        let chargeWidth = 0;

        if (charge) {
            chargeText = this.getChargeText(charge);

            ctx.font = this.wrapper.fontSmall;
            chargeWidth = ctx.measureText(chargeText).width;
        }

        let isotopeText = '0';
        let isotopeWidth = 0;

        if (isotope > 0) {
            isotopeText = isotope.toString();
            ctx.font = this.wrapper.fontSmall;
            isotopeWidth = ctx.measureText(isotopeText).width;
        }


        // TODO: Better handle exceptions
        // Exception for nitro (draw nitro as NO2 instead of N+O-O)
        if (charge === 1 && elementName === 'N' && attachedPseudoElement.hasOwnProperty('0O') &&
            attachedPseudoElement.hasOwnProperty('0O-1')) {
            attachedPseudoElement = { '0O': { element: 'O', count: 2, hydrogenCount: 0, previousElement: 'C', charge: '' } }
            charge = 0;
        }


        ctx.font = this.wrapper.fontLarge;
        ctx.fillStyle = this.wrapper.themeManager.getColor('BACKGROUND');

        let dim = ctx.measureText(elementName);

        // @ts-ignore - Adding custom properties to TextMetrics for internal use
        dim.totalWidth = dim.width + chargeWidth;
        // @ts-ignore - Adding custom properties to TextMetrics for internal use
        dim.height = parseInt(this.wrapper.fontLarge, 10);

        let r = (dim.width > this.wrapper.opts.fontSizeLarge) ? dim.width : this.wrapper.opts.fontSizeLarge;
        r /= 1.5;

        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x + offsetX, y + offsetY, r, 0, MathHelper.twoPI, true);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        let cursorPos = -dim.width / 2.0;
        let cursorPosLeft = -dim.width / 2.0;

        ctx.fillStyle = this.wrapper.themeManager.getColor(elementName);
        ctx.fillText(elementName, x + offsetX + cursorPos, y + this.wrapper.opts.halfFontSizeLarge + offsetY);
        cursorPos += dim.width;

        if (charge) {
            ctx.font = this.wrapper.fontSmall;
            ctx.fillText(chargeText, x + offsetX + cursorPos, y - this.wrapper.opts.fifthFontSizeSmall + offsetY);
            cursorPos += chargeWidth;
        }

        if (isotope > 0) {
            ctx.font = this.wrapper.fontSmall;
            ctx.fillText(isotopeText, x + offsetX + cursorPosLeft - isotopeWidth, y - this.wrapper.opts.fifthFontSizeSmall + offsetY);
            cursorPosLeft -= isotopeWidth;
        }

        ctx.font = this.wrapper.fontLarge;

        let hydrogenWidth = 0;
        let hydrogenCountWidth = 0;

        if (hydrogens === 1) {
            let hx = x + offsetX;
            let hy = y + offsetY + this.wrapper.opts.halfFontSizeLarge;

            hydrogenWidth = this.wrapper.hydrogenWidth;
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
                hy -= this.wrapper.opts.fontSizeLarge + this.wrapper.opts.quarterFontSizeLarge;
                hx -= this.wrapper.halfHydrogenWidth;
            } else if (direction === 'down' && !isTerminal) {
                hy += this.wrapper.opts.fontSizeLarge + this.wrapper.opts.quarterFontSizeLarge;
                hx -= this.wrapper.halfHydrogenWidth;
            }

            ctx.fillText('H', hx, hy);

            cursorPos += hydrogenWidth;
        } else if (hydrogens > 1) {
            let hx = x + offsetX;
            let hy = y + offsetY + this.wrapper.opts.halfFontSizeLarge;

            hydrogenWidth = this.wrapper.hydrogenWidth;
            ctx.font = this.wrapper.fontSmall;
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
                hy -= this.wrapper.opts.fontSizeLarge + this.wrapper.opts.quarterFontSizeLarge;
                hx -= this.wrapper.halfHydrogenWidth;
            } else if (direction === 'down' && !isTerminal) {
                hy += this.wrapper.opts.fontSizeLarge + this.wrapper.opts.quarterFontSizeLarge;
                hx -= this.wrapper.halfHydrogenWidth;
            }

            ctx.font = this.wrapper.fontLarge;
            ctx.fillText('H', hx, hy)

            ctx.font = this.wrapper.fontSmall;
            ctx.fillText(hydrogens.toString(), hx + this.wrapper.halfHydrogenWidth + hydrogenCountWidth, hy + this.wrapper.opts.fifthFontSizeSmall);

            cursorPos += hydrogenWidth + this.wrapper.halfHydrogenWidth + hydrogenCountWidth;
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

            ctx.font = this.wrapper.fontLarge;

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
                hydrogenWidth = this.wrapper.hydrogenWidth;
            }

            ctx.font = this.wrapper.fontSmall;

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

            ctx.font = this.wrapper.fontLarge;

            let hx = x + offsetX;
            let hy = y + offsetY + this.wrapper.opts.halfFontSizeLarge;

            ctx.fillStyle = this.wrapper.themeManager.getColor(element);

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
                        ctx.font = this.wrapper.fontSmall;
                        ctx.fillText(hydrogenCount, hx + cursorPosLeft + hydrogenWidth, hy + this.wrapper.opts.fifthFontSizeSmall);
                    }
                } else {
                    ctx.fillText('H', hx + cursorPos, hy)
                    cursorPos += hydrogenWidth;

                    if (hydrogenCount > 1) {
                        ctx.font = this.wrapper.fontSmall;
                        ctx.fillText(hydrogenCount, hx + cursorPos, hy + this.wrapper.opts.fifthFontSizeSmall);
                        cursorPos += hydrogenCountWidth;
                    }
                }
            }

            ctx.font = this.wrapper.fontLarge;

            if (elementCount > 1 && hydrogenCount > 0) {
                if (direction === 'left') {
                    cursorPosLeft -= openParenthesisWidth;
                    ctx.fillText('(', hx + cursorPosLeft, hy);
                } else {
                    ctx.fillText(')', hx + cursorPos, hy);
                    cursorPos += closeParenthesisWidth;
                }
            }

            ctx.font = this.wrapper.fontSmall;

            if (elementCount > 1) {
                if (direction === 'left') {
                    ctx.fillText(elementCount, hx + cursorPosLeft +
                        openParenthesisWidth + closeParenthesisWidth + hydrogenWidth +
                        hydrogenCountWidth + elementWidth, hy + this.wrapper.opts.fifthFontSizeSmall);
                } else {
                    ctx.fillText(elementCount, hx + cursorPos, hy + this.wrapper.opts.fifthFontSizeSmall);
                    cursorPos += elementCountWidth;
                }
            }

            if (elementCharge !== 0) {
                if (direction === 'left') {
                    ctx.fillText(elementChargeText, hx + cursorPosLeft +
                        openParenthesisWidth + closeParenthesisWidth + hydrogenWidth +
                        hydrogenCountWidth + elementWidth, y - this.wrapper.opts.fifthFontSizeSmall + offsetY);
                } else {
                    ctx.fillText(elementChargeText, hx + cursorPos, y - this.wrapper.opts.fifthFontSizeSmall + offsetY);
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
}

export = CanvasTextRenderer;
