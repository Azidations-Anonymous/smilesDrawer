import { IMoleculeOptions } from '../../config/IOptions';

type LabelRole = 'primary' | 'satellite';
type LabelCategory = 'charge' | 'hydrogen' | 'isotope' | 'main';

const SVG_NS = 'http://www.w3.org/2000/svg';

class SvgLabelRenderer {
  constructor(private opts: IMoleculeOptions, private getBackgroundColor: () => string) {}

  drawPrimaryLabel(x: number, y: number, text: string, color: string, fontSize?: number): SVGElement {
    return this.createText(x, y, text, color, fontSize || this.opts.fontSizeLarge, 'primary');
  }

  drawSatellite(x: number, y: number, text: string, color: string, fontSize?: number, category?: LabelCategory): SVGElement {
    return this.createText(x, y, text, color, fontSize || this.opts.fontSizeLarge, 'satellite', category);
  }

  private createText(x: number, y: number, text: string, color: string, fontSize: number, role: LabelRole, category?: LabelCategory): SVGElement {
    const textElem = document.createElementNS(SVG_NS, 'text');
    textElem.setAttributeNS(null, 'class', 'element');
    textElem.setAttributeNS(null, 'x', x.toString());
    textElem.setAttributeNS(null, 'y', y.toString());
    const outlineWidth = this.opts.labelOutlineWidth ?? 0;
    textElem.setAttributeNS(null, 'fill', color);
    if (outlineWidth > 0) {
      const outline = this.getBackgroundColor();
      textElem.setAttributeNS(null, 'stroke', outline);
      textElem.setAttributeNS(null, 'stroke-width', outlineWidth.toString());
      textElem.setAttributeNS(null, 'stroke-linejoin', 'round');
      textElem.setAttributeNS(null, 'paint-order', 'stroke fill');
      textElem.setAttributeNS(null, 'vector-effect', 'non-scaling-stroke');
    }
    textElem.setAttributeNS(null, 'font-family', this.opts.fontFamily);
    textElem.setAttributeNS(null, 'font-size', `${fontSize}pt`);
    textElem.setAttributeNS(null, 'text-anchor', 'middle');
    textElem.setAttributeNS(null, 'dominant-baseline', 'central');
    textElem.setAttributeNS(null, 'alignment-baseline', 'central');
    textElem.setAttributeNS(null, 'data-label-role', role);

    const tspan = document.createElementNS(SVG_NS, 'tspan');
    tspan.setAttributeNS(null, 'y', y.toString());
    tspan.setAttributeNS(null, 'dy', '0.35em');
    tspan.textContent = text;
    textElem.appendChild(tspan);

    return textElem;
  }
}

export = SvgLabelRenderer;
