import Vector2 = require('../../graph/Vector2');
import CanvasDrawer = require('../CanvasDrawer');

class CanvasWedgeDrawer {
  constructor(private wrapper: CanvasDrawer) {}



    /**
     * Draw a wedge on the canvas.
     *
     * @param {Line} line A line.
     * @param {Number} width The wedge width.
     */
    drawWedge(line: any, width: number = 1.0): void {
        if (isNaN(line.from.x) || isNaN(line.from.y) ||
            isNaN(line.to.x) || isNaN(line.to.y)) {
            return;
        }

        let ctx = this.wrapper.ctx;
        let offsetX = this.wrapper.offsetX;
        let offsetY = this.wrapper.offsetY;

        // Add a shadow behind the line
        let shortLine = line.clone().shorten(5.0);

        let l = shortLine.getLeftVector().clone();
        let r = shortLine.getRightVector().clone();

        l.x += offsetX;
        l.y += offsetY;

        r.x += offsetX;
        r.y += offsetY;

        l = line.getLeftVector().clone();
        r = line.getRightVector().clone();

        l.x += offsetX;
        l.y += offsetY;

        r.x += offsetX;
        r.y += offsetY;

        ctx.save();

        let normals = Vector2.normals(l, r);

        normals[0].normalize();
        normals[1].normalize();

        let isRightChiralCenter = line.getRightChiral();

        let start = l;
        let end = r;

        if (isRightChiralCenter) {
            start = r;
            end = l;
        }

        let t = Vector2.add(start, Vector2.multiplyScalar(normals[0], this.wrapper.halfBondThickness));
        let u = Vector2.add(end, Vector2.multiplyScalar(normals[0], 1.5 + this.wrapper.halfBondThickness));
        let v = Vector2.add(end, Vector2.multiplyScalar(normals[1], 1.5 + this.wrapper.halfBondThickness));
        let w = Vector2.add(start, Vector2.multiplyScalar(normals[1], this.wrapper.halfBondThickness));

        ctx.beginPath();
        ctx.moveTo(t.x, t.y);
        ctx.lineTo(u.x, u.y);
        ctx.lineTo(v.x, v.y);
        ctx.lineTo(w.x, w.y);

        let gradient = this.wrapper.ctx.createRadialGradient(r.x, r.y, this.wrapper.opts.bondLength, r.x, r.y, 0);
        gradient.addColorStop(0.4, this.wrapper.themeManager.getColor(line.getLeftElement()) ||
            this.wrapper.themeManager.getColor('C'));
        gradient.addColorStop(0.6, this.wrapper.themeManager.getColor(line.getRightElement()) ||
            this.wrapper.themeManager.getColor('C'));

        ctx.fillStyle = gradient;

        ctx.fill();
        ctx.restore();
    }



    /**
     * Draw a dashed wedge on the canvas.
     *
     * @param {Line} line A line.
     */
    drawDashedWedge(line: any): void {
        if (isNaN(line.from.x) || isNaN(line.from.y) ||
            isNaN(line.to.x) || isNaN(line.to.y)) {
            return;
        }

        let ctx = this.wrapper.ctx;
        let offsetX = this.wrapper.offsetX;
        let offsetY = this.wrapper.offsetY;

        let l = line.getLeftVector().clone();
        let r = line.getRightVector().clone();

        l.x += offsetX;
        l.y += offsetY;

        r.x += offsetX;
        r.y += offsetY;

        ctx.save();

        let normals = Vector2.normals(l, r);

        normals[0].normalize();
        normals[1].normalize();


        let isRightChiralCenter = line.getRightChiral();

        let start;
        let end;
        let sStart;
        let sEnd;

        let shortLine = line.clone();

        if (isRightChiralCenter) {
            start = r;
            end = l;

            shortLine.shortenRight(1.0);

            sStart = shortLine.getRightVector().clone();
            sEnd = shortLine.getLeftVector().clone();
        } else {
            start = l;
            end = r;

            shortLine.shortenLeft(1.0);

            sStart = shortLine.getLeftVector().clone();
            sEnd = shortLine.getRightVector().clone();
        }

        sStart.x += offsetX;
        sStart.y += offsetY;
        sEnd.x += offsetX;
        sEnd.y += offsetY;

        let dir = Vector2.subtract(end, start).normalize();
        ctx.strokeStyle = this.wrapper.themeManager.getColor('C');
        ctx.lineCap = 'round';
        ctx.lineWidth = this.wrapper.opts.bondThickness;
        ctx.beginPath();
        let length = line.getLength();
        let step = 1.25 / (length / (this.wrapper.opts.bondThickness * 3.0));

        let changed = false;
        for (var t = 0.0; t < 1.0; t += step) {
            let to = Vector2.multiplyScalar(dir, t * length);
            let startDash = Vector2.add(start, to);
            let width = 1.5 * t;
            let dashOffset = Vector2.multiplyScalar(normals[0], width);

            if (!changed && t > 0.5) {
                ctx.stroke();
                ctx.beginPath();
                ctx.strokeStyle = this.wrapper.themeManager.getColor(line.getRightElement()) || this.wrapper.themeManager.getColor('C');
                changed = true;
            }

            startDash.subtract(dashOffset);
            ctx.moveTo(startDash.x, startDash.y);
            startDash.add(Vector2.multiplyScalar(dashOffset, 2.0));
            ctx.lineTo(startDash.x, startDash.y);
        }

        ctx.stroke();
        ctx.restore();
    }
}

export = CanvasWedgeDrawer;
