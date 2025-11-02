import MathHelper = require('../../utils/MathHelper');
import CanvasWrapper = require('../CanvasWrapper');

class CanvasPrimitiveDrawer {
  constructor(private wrapper: CanvasWrapper) {}



    /**
     * Draws a circle to a canvas context.
     * @param {Number} x The x coordinate of the circles center.
     * @param {Number} y The y coordinate of the circles center.
     * @param {Number} radius The radius of the circle
     * @param {String} color A hex encoded color.
     * @param {Boolean} [fill=true] Whether to fill or stroke the circle.
     * @param {Boolean} [debug=false] Draw in debug mode.
     * @param {String} [debugText=''] A debug message.
     */
    drawCircle(x: number, y: number, radius: number, color: string, fill: boolean = true, debug: boolean = false, debugText: string = ''): void {
        let ctx = this.wrapper.ctx;
        let offsetX = this.wrapper.offsetX;
        let offsetY = this.wrapper.offsetY;

        ctx.save();
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x + offsetX, y + offsetY, radius, 0, MathHelper.twoPI, true);
        ctx.closePath();

        if (debug) {
            if (fill) {
                ctx.fillStyle = '#f00';
                ctx.fill();
            } else {
                ctx.strokeStyle = '#f00';
                ctx.stroke();
            }

            this.drawDebugText(x, y, debugText);
        } else {
            if (fill) {
                ctx.fillStyle = color;
                ctx.fill();
            } else {
                ctx.strokeStyle = color;
                ctx.stroke();
            }
        }

        ctx.restore();
    }



    /**
     * Draw a line to a canvas.
     *
     * @param {Line} line A line.
     * @param {Boolean} [dashed=false] Whether or not the line is dashed.
     * @param {Number} [alpha=1.0] The alpha value of the color.
     */
    drawLine(line: any, dashed: boolean = false, alpha: number = 1.0): void {
        let ctx = this.wrapper.ctx;
        let offsetX = this.wrapper.offsetX;
        let offsetY = this.wrapper.offsetY;

        // Add a shadow behind the line
        let shortLine = line.clone().shorten(4.0);

        let l = shortLine.getLeftVector().clone();
        let r = shortLine.getRightVector().clone();

        l.x += offsetX;
        l.y += offsetY;

        r.x += offsetX;
        r.y += offsetY;

        // Draw the "shadow"
        if (!dashed) {
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath();
            ctx.moveTo(l.x, l.y);
            ctx.lineTo(r.x, r.y);
            ctx.lineCap = 'round';
            ctx.lineWidth = this.wrapper.opts.bondThickness + 1.2;
            ctx.strokeStyle = this.wrapper.themeManager.getColor('BACKGROUND');
            ctx.stroke();
            ctx.globalCompositeOperation = 'source-over';
            ctx.restore();
        }

        l = line.getLeftVector().clone();
        r = line.getRightVector().clone();

        l.x += offsetX;
        l.y += offsetY;

        r.x += offsetX;
        r.y += offsetY;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(r.x, r.y);
        ctx.lineCap = 'round';
        ctx.lineWidth = this.wrapper.opts.bondThickness;

        let gradient = this.wrapper.ctx.createLinearGradient(l.x, l.y, r.x, r.y);
        gradient.addColorStop(0.4, this.wrapper.themeManager.getColor(line.getLeftElement()) ||
            this.wrapper.themeManager.getColor('C'));
        gradient.addColorStop(0.6, this.wrapper.themeManager.getColor(line.getRightElement()) ||
            this.wrapper.themeManager.getColor('C'));

        if (dashed) {
            ctx.setLineDash([1, 1.5]);
            ctx.lineWidth = this.wrapper.opts.bondThickness / 1.5;
        }

        if (alpha < 1.0) {
            ctx.globalAlpha = alpha;
        }

        ctx.strokeStyle = gradient;

        ctx.stroke();
        ctx.restore();
    }



    /**
     * Draw a ball to the canvas.
     *
     * @param {Number} x The x position of the text.
     * @param {Number} y The y position of the text.
     * @param {String} elementName The name of the element (single-letter).
     */
    drawBall(x: number, y: number, elementName: string): void {
        let ctx = this.wrapper.ctx;

        ctx.save();
        ctx.beginPath();
        ctx.arc(x + this.wrapper.offsetX, y + this.wrapper.offsetY, this.wrapper.opts.bondLength / 4.5, 0, MathHelper.twoPI, false);
        ctx.fillStyle = this.wrapper.themeManager.getColor(elementName);
        ctx.fill();
        ctx.restore();
    }



    /**
     * Draw a point to the canvas.
     *
     * @param {Number} x The x position of the point.
     * @param {Number} y The y position of the point.
     * @param {String} elementName The name of the element (single-letter).
     */
    drawPoint(x: number, y: number, elementName: string): void {
        let ctx = this.wrapper.ctx;
        let offsetX = this.wrapper.offsetX;
        let offsetY = this.wrapper.offsetY;

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x + offsetX, y + offsetY, 1.5, 0, MathHelper.twoPI, true);
        ctx.closePath();
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';

        ctx.beginPath();
        ctx.arc(x + this.wrapper.offsetX, y + this.wrapper.offsetY, 0.75, 0, MathHelper.twoPI, false);
        ctx.fillStyle = this.wrapper.themeManager.getColor(elementName);
        ctx.fill();
        ctx.restore();
    }



    /**
     * Draws a ring inside a provided ring, indicating aromaticity.
     *
     * @param {Ring} ring A ring.
     */
    drawAromaticityRing(ring: any): void {
        let ctx = this.wrapper.ctx;
        let radius = MathHelper.apothemFromSideLength(this.wrapper.opts.bondLength, ring.getSize());

        ctx.save();
        ctx.strokeStyle = this.wrapper.themeManager.getColor('C');
        ctx.lineWidth = this.wrapper.opts.bondThickness;
        ctx.beginPath();
        ctx.arc(ring.center.x + this.wrapper.offsetX, ring.center.y + this.wrapper.offsetY,
            radius - this.wrapper.opts.bondSpacing, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }



    /**
     * Draws a debug text message at a given position
     *
     * @param {Number} x The x coordinate.
     * @param {Number} y The y coordinate.
     * @param {String} text The debug text.
     */
    drawDebugText(x: number, y: number, text: string): void {
        let ctx = this.wrapper.ctx;

        ctx.save();
        ctx.font = '5px Droid Sans, sans-serif';
        ctx.textAlign = 'start';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ff0000';
        ctx.fillText(text, x + this.wrapper.offsetX, y + this.wrapper.offsetY);
        ctx.restore();
    }
}

export = CanvasPrimitiveDrawer;
