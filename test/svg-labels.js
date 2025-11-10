#!/usr/bin/env node

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');

const OptionsManager = require('../src/config/OptionsManager.js');
const ThemeManager = require('../src/config/ThemeManager.js');
const SvgWrapper = require('../src/drawing/SvgWrapper.js');
const SvgTextHelper = require('../src/drawing/helpers/SvgTextHelper.js');

function ensureDom() {
  if (typeof global.window !== 'undefined' && typeof global.document !== 'undefined') {
    return;
  }

  const { window } = parseHTML('<!DOCTYPE html><html><body></body></html>');
  global.window = window;
  global.document = window.document;
  global.navigator = window.navigator;
  global.HTMLElement = window.HTMLElement;
  global.SVGElement = window.SVGElement;
  global.HTMLCanvasElement = window.HTMLCanvasElement;
  global.HTMLImageElement = window.HTMLImageElement;
  global.Element = window.Element;
  global.Node = window.Node;
  global.DOMParser = window.DOMParser;
  global.XMLSerializer = window.XMLSerializer;
}

describe('SVG label rendering', () => {
  it('draws labels without CSS transforms and exposes absolute coordinates', () => {
    ensureDom();

    const optionsManager = new OptionsManager({});
    const opts = optionsManager.opts;
    const themeManager = new ThemeManager(opts.themes, 'light');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const wrapper = new SvgWrapper(themeManager, svg, opts, true);

    wrapper.drawText(0, 0, 'N', 1, 'right', true, 1, 0, 2);

    const textNodes = wrapper.vertices.filter(
      (node) => node.tagName && node.tagName.toLowerCase() === 'text'
    );
    assert(textNodes.length > 1, 'should emit separate text nodes for the atom and satellites');

    const primary = textNodes.find((node) => node.getAttribute('data-label-role') === 'primary');
    const satellite = textNodes.find((node) => node.getAttribute('data-label-role') === 'satellite');
    assert(primary, 'primary label should be present');
    assert(satellite, 'hydrogen satellite should be present');

    assert.equal(primary.hasAttribute('transform'), false, 'primary label should not rely on CSS transforms');
    assert.equal(satellite.hasAttribute('transform'), false, 'satellite label should not rely on CSS transforms');

    const primaryDisplay = primary.textContent;
    const satelliteDisplay = satellite.textContent;
    const primaryMetrics = SvgTextHelper.measureText(primaryDisplay, opts.fontSizeLarge, opts.fontFamily);
    const satelliteMetrics = SvgTextHelper.measureText(satelliteDisplay, opts.fontSizeLarge, opts.fontFamily);
    const primaryX = Number(primary.getAttribute('x'));
    const satelliteX = Number(satellite.getAttribute('x'));
    assert(Math.abs(primaryX) < 1e-6, 'primary label should stay anchored at the input coordinate');
    assert(satelliteX > primaryX, 'satellite label should sit to the right of the primary glyph');

    const primaryY = Number(primary.getAttribute('y'));
    const satelliteY = Number(satellite.getAttribute('y'));
    assert.equal(primaryY, 0, 'primary label should stay on the requested baseline');
    assert.equal(satelliteY, 0, 'satellite label should share the baseline for a rightward label');

    const mask = wrapper.maskElements[0];
    assert(mask, 'a halo mask should be generated for the atom');
    const maskX = Number(mask.getAttribute('cx'));
    const maskY = Number(mask.getAttribute('cy'));
    assert(Math.abs(maskX - primaryX) < 1e-6, 'mask should align with the primary label');
    assert(Math.abs(maskY - primaryY) < 1e-6, 'mask should share the label baseline');
  });
});
