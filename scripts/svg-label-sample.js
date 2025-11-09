#!/usr/bin/env node

/**
 * Generates a small SVG scene that showcases the absolute-positioned label renderer.
 * The output highlights charges, isotopes, pseudo-elements, and vertical hydrogen stacks
 * so manual verification can compare SmilesDrawer vs. PIKAChU.
 */

const fs = require('fs');
const path = require('path');
const { parseHTML } = require('linkedom');

const OptionsManager = require('../src/config/OptionsManager.js');
const ThemeManager = require('../src/config/ThemeManager.js');
const SvgWrapper = require('../src/drawing/SvgWrapper.js');

function ensureDom() {
  if (typeof global.document !== 'undefined') {
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

function createWrapper() {
  const optionsManager = new OptionsManager({
    width: 240,
    height: 180,
    padding: 10
  });

  const themeManager = new ThemeManager(optionsManager.opts.themes, 'light');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(optionsManager.opts.width));
  svg.setAttribute('height', String(optionsManager.opts.height));

  return new SvgWrapper(themeManager, svg, optionsManager.opts, true);
}

function drawSampleLabels(wrapper) {
  // Charged nitrogen with rightward hydrogen satellites.
  wrapper.drawText(60, 50, 'N', 1, 'right', true, 1, 0, 2);

  // Left-anchored oxygen with isotope and negative charge.
  wrapper.drawText(180, 50, 'O', 0, 'left', false, -1, 18, 2);

  // Upward pseudo-element stack (simulated carbon with attached chlorides and hydrogens).
  wrapper.drawText(60, 130, 'C', 0, 'up', false, 0, 0, 3, {
    '0CL': {
      element: 'Cl',
      count: 2,
      hydrogenCount: 1,
      previousElement: 'C',
      charge: 0
    }
  });

  // Downward sulfur with explicit dihydrogen to show stacked satellites.
  wrapper.drawText(180, 130, 'S', 2, 'down', false, 0, 0, 3);
}

function generateScene() {
  const wrapper = createWrapper();
  drawSampleLabels(wrapper);
  wrapper.constructSvg();
  return wrapper.svg.outerHTML;
}

function main() {
  ensureDom();

  const defaultDir = path.resolve(__dirname, '../temp-svg-label-samples');
  const outputDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : defaultDir;

  if (fs.existsSync(outputDir)) {
    const stats = fs.statSync(outputDir);
    if (!stats.isDirectory()) {
      throw new Error(`Output path exists and is not a directory: ${outputDir}`);
    }
  } else {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const svgMarkup = generateScene();
  const filePath = path.join(outputDir, 'svg-label-sample.svg');
  fs.writeFileSync(filePath, svgMarkup, 'utf8');
  console.log(`Generated ${filePath}`);
}

if (require.main === module) {
  main();
}
