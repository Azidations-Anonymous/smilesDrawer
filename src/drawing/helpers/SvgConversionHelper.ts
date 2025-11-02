class SvgConversionHelper {


  /**
   * Convert an SVG to a canvas. Warning: This happens async!
   *
   * @param {SVGElement} svg
   * @param {HTMLCanvasElement} canvas
   * @param {Number} width
   * @param {Number} height
   * @param {CallableFunction} callback
   * @returns {HTMLCanvasElement} The input html canvas element after drawing to.
   */
  static svgToCanvas(svg: SVGElement, canvas: HTMLCanvasElement, width: number, height: number, callback: ((canvas: HTMLCanvasElement) => void) | null = null): HTMLCanvasElement {
    svg.setAttributeNS(null, 'width', width.toString());
    svg.setAttributeNS(null, 'height', height.toString());

    let image = new Image();
    image.onload = function () {
      canvas.width = width;
      canvas.height = height;

      let context = canvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0, width, height);

      if (callback) {
        callback(canvas);
      }
    };

    image.onerror = function (err) {
      console.log(err);
    }

    image.src = 'data:image/svg+xml;charset-utf-8,' + encodeURIComponent(svg.outerHTML);
    return canvas;
  }



  /**
   * Convert an SVG to a canvas. Warning: This happens async!
   *
   * @param {SVGElement} svg
   * @param {HTMLImageElement} canvas
   * @param {Number} width
   * @param {Number} height
   */
  static svgToImg(svg: SVGElement, img: HTMLImageElement, width: number, height: number): void {
    let canvas = document.createElement('canvas');
    SvgConversionHelper.svgToCanvas(svg, canvas, width, height, result => {
      img.src = canvas.toDataURL("image/png");
    });
  }
}

export = SvgConversionHelper;
