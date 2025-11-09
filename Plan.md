# SVG Label Parity Plan

This plan captures the design decisions for aligning SmilesDrawer’s SVG labels with PIKAChU before we implement the refactor.

## 1. Document Current Behavior
- **Label construction** – `SvgWrapper.drawText()` builds a `text` array beginning with `[display, elementName]` for the atom and pushes extra entries for hydrogens, charges, isotopes, and pseudo-elements. Each entry becomes a `<tspan>` inside a single `<text>` element.
- **Mask/halo** – A single `<circle>` mask (radius scaled from `fontSizeLarge`) is created at the anchor `(cx, cy)` before the `<g>` wrapper is pushed.
- **Placement** – `write()` wraps `<text>` in a `<g>` and applies `transform="translate(x,y)"`. Horizontal direction uses the measured primary glyph width to adjust bounding boxes; vertical stacking toggles order and uses `dy="±0.9em"` per line.
- **Stacking differences vs. PIKAChU** – Charged/isotope text is concatenated into the primary `display`, so there is one `<text>` per atom regardless of satellites. PIKAChU renders each glyph by calling `_draw_text` per visual item (main symbol, charge, hydrogen, count, isotope).
- **Visual issues** – Because our `<g>` is translated while the mask circle lives in absolute coordinates, the text can drift relative to the “ball” when zooming or when browsers reapply transforms. Multi-line up/down stacks use CSS transform centering plus relative `dy`, so baseline rounding differs between browsers, and left/right offsets rely on the bounding-box heuristic rather than absolute reference points.

## 2. Decide On Parity Targets
- Adopt PIKAChU’s “one label per call” semantics: every textual glyph is its own `<text>` node anchored directly at absolute `(x, y)` with `text-anchor="middle"` and a `dy="0.35em"` baseline tweak.
- Keep SmilesDrawer’s existing offset heuristics (char width, line height, hydrogen placement) but express them as absolute coordinates per glyph so masks, highlights, and text share the same coordinate system.

## 3. Refactor Rendering Helper
- Introduce `SvgLabelRenderer` (e.g., `src/drawing/renderers/SvgLabelRenderer.ts`) encapsulating:
  - `drawPrimaryLabel(x, y, text, color)` – creates `<text>` with the common attributes and pushes it to `SvgWrapper.vertices`.
  - `drawSatellite(x, y, text, color, fontSize)` – same implementation but allows smaller fonts (used for hydrogen counts/pseudo-element multipliers) and independent positioning.
- Update `SvgWrapper.drawText()` to build a flat list of glyphs:
  1. Anchor the main atom string (element + charge/isotope unicode) via `drawPrimaryLabel`.
  2. Generate hydrogen and attached pseudo-element entries as satellites, duplicating the current directional offsets but feeding absolute coordinates to the helper.
- Drop the `<g>` wrapper and the CSS `transform` so every `<text>` node already contains `x`/`y` in the global coordinate system.

## 4. Rework Mask/Halo
- Create one mask circle per anchor (main atom) before adding any text nodes, storing the element so satellites can reuse the same halo visually.
- Ensure the mask insert order keeps the circle before its related text nodes within `this.maskElements` / `this.vertices`; satellites (hydrogens/pseudo-elements) reuse that halo so we avoid managing multiple circles per atom.

## 5. Update Directional Offsets
- Reuse `SvgTextHelper.measureText()` to compute `charWidth` and `lineHeight`.
- Direction mapping:
  - **Right** – main label anchored at `(x + charWidth / 2, y)`. Satellites offset using existing heuristics (charge above, hydrogens to the right).
  - **Left** – anchor at `(x - charWidth / 2, y)` and mirror hydrogen offsets to the left.
  - **Up/Down** – keep anchor at `(x, y)`; satellites move along `±lineHeight`. Up-oriented hydrogens sit above the label, down-oriented below.
- Existing pseudo-element logic should emit explicit offsets derived from their stored `previousElement` direction data (when available) or default to the same direction rules.

## 6. CSS + Baseline Alignment
- Apply `text-anchor="middle"`, `dominant-baseline="central"`, and `alignment-baseline="central"` directly to every `<text>` the helper creates.
- Use `<tspan y="…" dy="0.35em">` only when a glyph needs multiple characters (e.g., `H₂`); otherwise the helper writes the text directly.
- Remove the parent `<g>` and its `transform`, ensuring layout uses absolute coordinates everywhere.

## 7. Regression Tests
- Add a focused test (new file `test/svg-labels.spec.ts` or extend `test/aromatic-overlays.js`) that renders a simple SVG with a horizontal atom + charge + hydrogen, then assert the resulting markup contains multiple `<text>` entries with explicit `x`/`y` and no `transform` attribute.
- Include expectations for coordinates (e.g., charge `y` offset equals `mainY - lineHeight`) to guard against future drift.

## 8. Manual Verification
- After implementation, generate inspection SVGs via `npm run sample:svg-labels` (writes `temp-svg-label-samples/svg-label-sample.svg`) and open them in Chrome, Firefox, and Safari:
  - Confirm the halo circle coordinates match the primary glyph and remain aligned when zooming.
  - Compare the Pikachu sample against PIKAChU output from `../pikachu` to ensure multi-line stacks (up/down hydrogens, pseudo-elements) share the same relative offsets.
  - Compare against the PIKAChU output rendered via `npm run parity:svg-labels` to ensure the offsets match what the helper reports.
- Automate a sanity pass via `npm run parity:svg-labels`, which renders representative single-atom SMILES with both toolkits (shelling out to `../pikachu/pikachu-run`) and reports per-glyph offset deltas. Use this CLI output to triage differences before performing the manual browser review.

## 9. Documentation + Options
- Update `doc/layout.md` (or add a new section) describing the new absolute-coordinate label rendering model and how it matches PIKAChU.
- Note in the README/release notes that the Pikachu-style renderer is now the only SVG text path (legacy `<g>` transforms were removed).
