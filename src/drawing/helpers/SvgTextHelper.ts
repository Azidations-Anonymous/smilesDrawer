class SvgTextHelper {


  static measureText(text: string, fontSize: number, fontFamily: string, lineHeight: number = 0.9): {width: number, height: number} {
    const element = document.createElement('canvas');
    const ctx = element.getContext("2d");
    ctx.font = `${fontSize}pt ${fontFamily}`
    let textMetrics = ctx.measureText(text)

    let compWidth = Math.abs(textMetrics.actualBoundingBoxLeft) + Math.abs(textMetrics.actualBoundingBoxRight);
    return {
      'width': textMetrics.width > compWidth ? textMetrics.width : compWidth,
      'height': (Math.abs(textMetrics.actualBoundingBoxAscent) + Math.abs(textMetrics.actualBoundingBoxAscent)) * lineHeight
    };
  }



  /**
   * Create an SVG element containing text.
   * @param {String} text
   * @param {*} themeManager
   * @param {*} options
   * @returns {{svg: SVGElement, width: Number, height: Number}} The SVG element containing the text and its dimensions.
   */
  static writeText(text: string, themeManager: any, fontSize: number, fontFamily: string, maxWidth: number = Number.MAX_SAFE_INTEGER): {svg: SVGElement, width: number, height: number} {
    let svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    let style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.appendChild(document.createTextNode(`
        .text {
            font: ${fontSize}pt ${fontFamily};
            dominant-baseline: ideographic;
        }
    `));
    svg.appendChild(style);

    let textElem = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    textElem.setAttributeNS(null, 'class', 'text');

    let maxLineWidth = 0.0;
    let totalHeight = 0.0;

    let lines = [];

    text.split("\n").forEach(line => {
      let dims = SvgTextHelper.measureText(line, fontSize, fontFamily, 1.0);
      if (dims.width >= maxWidth) {
        let totalWordsWidth = 0.0;
        let maxWordsHeight = 0.0;
        let words = line.split(" ");
        let offset = 0;

        for (let i = 0; i < words.length; i++) {
          let wordDims = SvgTextHelper.measureText(words[i], fontSize, fontFamily, 1.0);

          if (totalWordsWidth + wordDims.width > maxWidth) {
            lines.push({
              text: words.slice(offset, i).join(' '),
              width: totalWordsWidth,
              height: maxWordsHeight
            });

            totalWordsWidth = 0.0;
            maxWordsHeight = 0.0;
            offset = i
          }

          if (wordDims.height > maxWordsHeight) {
            maxWordsHeight = wordDims.height;
          }

          totalWordsWidth += wordDims.width;
        }

        if (offset < words.length) {
          lines.push({
            text: words.slice(offset, words.length).join(' '),
            width: totalWordsWidth,
            height: maxWordsHeight
          });
        }
      } else {
        lines.push({
          text: line,
          width: dims.width,
          height: dims.height
        });
      }
    });

    lines.forEach((line, i) => {
      totalHeight += line.height;
      let tspanElem = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
      tspanElem.setAttributeNS(null, 'fill', themeManager.getColor("C"));
      tspanElem.textContent = line.text;
      tspanElem.setAttributeNS(null, 'x', '0px')
      tspanElem.setAttributeNS(null, 'y', `${totalHeight}px`);
      textElem.appendChild(tspanElem);

      if (line.width > maxLineWidth) {
        maxLineWidth = line.width;
      }
    });

    svg.appendChild(textElem);

    return { svg: svg, width: maxLineWidth, height: totalHeight };
  }
}

export = SvgTextHelper;
