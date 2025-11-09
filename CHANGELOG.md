# Changelog
All notable changes to this project will be documented in this file.

## [3.0.0]
### Added
- Complete TypeScript toolchain and source conversion, including strict interfaces for drawers, managers, SSSR, stereochemistry, and options plus new drawing surface abstractions.
- A getPositionData() browser API (with versioned metadata baked into builds), atom annotations, Johnson cycle enumeration, and PIKAChU-style overlap/parity plans for higher-fidelity layouts.
- A regression and smoke-test platform with dataset filtering, regex selection, copy-to-clipboard buttons, PNG generation (white backgrounds, single-SMILES mode), timestamped outputs, and automated comparison reports/bisect helpers.
- GitHub Pages deployment workflow that rebuilds docs/dist from source, exposes downloadable SVGs from the playground, and publishes refreshed documentation without tracking generated assets.
- Configurable iteration/time guards for the overlap finetuning pass (new `finetuneOverlapMaxSteps`/`finetuneOverlapMaxDurationMs` options) plus regression coverage in `test/overlap-finetune.js` that locks the Fig. 2B clash examples in place.
- Regression metadata now serialises `ringDiagnostics` for both baselines and candidates, exposes per-edge `chiralDict` data, and ships with a `scripts/dump-cis-trans.js` CLI so stereochemical diffs can be debugged without running the full regression harness.
- Added `cisTransDiagnostics` (per-double-bond orientation checks) to the regression JSON/CLI tools so we can see which substituent pairs failed and how they were evaluated without rerunning the full layout debugger.
- `CisTransManager` now mirrors Pikachu’s ring/subtree flipping algorithm: it iterates multiple flip plans, re-checks orientations after each attempt, and only marks a stereobond as fixed when the recorded `chiralDict` matches the drawing. Macrocycles no longer flip back and forth after parity fixes.

### Changed
- Re-architected the runtime: DrawerBase responsibilities were split into dedicated managers, Graph/Kamada-Kawais code was modularized, and jsdom-based tests were replaced with faster linkedom-based runs.
- Kamada-Kawai layout internals were rewritten for determinism (tail-recursed relaxation, guarded Hessian/energy updates, short-circuited empty layouts) and instrumented with property-based tests plus benchmarking hooks.
- Regression reporting now filters numeric noise, treats deltas below 50 ms as neutral, repositions performance panels, and collapses JSON diffs for easier triage while smoke/regression scripts gained clearer CLI ergonomics.
- Playground and packaging updates now consume the dist bundle directly, restore the `smiles-drawer.js` symlink, and remove legacy position-data panels in favor of the runtime API.
- SVG label rendering now uses the Pikachu-style absolute layout exclusively: every glyph gets its own `<text>` node (no `<g>` transforms), mask halos follow the rendered anchor, and the old legacy stacking path was removed to prevent drift.
- Atom annotations now have first-class rendering support via `showAtomAnnotations`, a customizable formatter, and styling knobs for color/offset/font size.
- SSSR parity is now the default: the experimental flag was removed, the collector guard matches PIKAChU’s “one extra candidate” rule, and aromatic indicators leverage the Johnson cycle inventory so fused/macrocyclic aromatics render correctly.

### Fixed
- Stereochemical accuracy improved via cis/trans stereobond corrections, additional SSSR parity tests, deterministic neighbour ordering, and refactored cycle candidate handling.
- Overlap/bridged-ring issues were addressed by preventing pivot rotation, keeping chiral wedges visible when hydrogens are hidden, and refining bridged-ring bookkeeping/logging.
- Baseline/regression stability saw fixes for dataset loading, hidden SMILES filtering, position-data export, and guardrails that verify `src/` before comparing builds.
- Macrocyclic double bonds no longer oscillate between cis/trans states: the cis/trans manager now mirrors Pikachu’s ring-branch flipping rules (respecting already-fixed stereobonds) and keeps its orientation maps in sync via the new `chiralDict` storage.

## [2.1.10] - 2025-03-29
### Fixed
- Resolved multiple structural rendering bugs: missing isotope zeros, lightning-bolt bonds near rings, bent triple bonds, and atoms with ≥5 neighbours now draw with correct geometry.
- Always render carbons when they carry isotope or charge modifiers and handle cases where the previous vertex is absent, preventing crashes in complex motifs.
- Reset bridged-ring bookkeeping after each draw so follow-up molecules do not inherit stale ring state.

## [2.1.9] - 2025-03-04
### Fixed
- Restored implicit hydrogens on dot-bonded atoms and corrected the `weights` argument plumbing through the drawing API.
- Cleaned up spelling/formatting regressions introduced during the SVG weight work.

## [2.1.8] - 2025-02-28
### Changed
- Passed an explicit default (`weights = null`) through `Drawer.draw()` to `SvgDrawer.draw()` to unblock callers that omit the parameter.
- Polished documentation, including a Svelte example and refreshed README sections for the SVG drawer.

## [2.1.7] - 2023-01-21
### Fixed
- Corrected the GaussDrawer’s chroma import path so the module loads in both bundlers and Node.

## [2.1.6] - 2023-01-13
### Changed
- Improved GaussDrawer performance and merged the outstanding hotfix stream into the mainline release.

## [2.1.4] - 2023-01-05
### Fixed
- Addressed multiple text layout issues (direction, alignment, and positioning) in the core drawers and renamed the legacy `doc/` folder to `docs/` to match the build.

## [2.1.2] - 2022-12-12
### Added
- Allowed weights to be defined for single hydrogen atoms and exposed additional weight controls in the public API.
### Changed
- Removed a noisy debug message from the build and refreshed README guidance for the new options.

## [2.1.1] - 2022-12-12
### Added
- Introduced reaction normalization for weight calculations and added options to customise how weights are drawn before the subsequent version bump.

## [2.0.3] - 2022-12-09
### Added
- Implemented the Gaussian drawer (with atom indices), highlighting support, notebook-friendly helpers, and an example pipeline for rendering from IPython.
- Merged the reaction-drawer branch and associated highlighting improvements into the main distribution.

## [2.0.2] - 2022-05-29
### Added
- Exposed `SmiDrawer` from the main `SmilesDrawer` object so downstream consumers can keep using the legacy helper after the 2.0 rewrite.

## [2.0.1] - 2022-05-24
### Added
- Landed the reaction drawer stack (canvas and SVG), including arrows, plus signs, pseudo-elements, better text rendering, viewbox fixes, and CD-style theme defaults.
- Added a new wrapper layer and release-prep scripts, refreshed the dist bundle, and removed the OGDF dependency for environments that only consume the prebuilt artifacts.
### Fixed
- Numerous text placement bugs: elements drawn to the left with charges now stay aligned, single-atom text honours top-down ordering, and text outside the SVG viewbox is prevented.

## [1.2.0] - 2020-12-02
### Added
- Brought the SVG drawer to feature parity with the canvas drawer (balls/points, debug overlays, ring handling) and documented the flow in the README.
- Updated vulnerable dependencies via Dependabot PRs and normalised code style/line endings while cleaning obsolete Yarn artefacts.

## [1.1.23] - 2020-02-14
### Added
- Added reStructuredText documentation alongside the README.
### Changed
- Defaulted the renderer to draw explicitly defined hydrogens so exported depictions always match the input SMILES.
### Fixed
- Patched a minification failure when `Number.MAX_SAFE_INTEGER` appeared in the bundle.

## [1.1.22] - 2019-07-11
### Fixed
- Fixed a parser regression that mis-read repeated bond symbols.

## [1.1.20] - 2019-06-06
### Added
- Introduced an experimental SSSR mode selectable at runtime.
### Changed
- Upgraded the build chain to gulp 4 and updated the README to document the new capabilities.
### Fixed
- Corrected a `pop()` misuse that could throw during traversal.

## [1.0.10] - 2018-08-24
### Fixed
- Prevented the parser from entering an infinite loop when parentheses were unbalanced.

## [1.0.9] - 2018-07-31
### Added
- Added support for custom padding, including wiring it through the public API and documenting it in the README.
### Changed
- Reduced the dashed-line weight in bridged aromatic systems for clearer depictions.
### Fixed
- Removed implicit hydrogens from aromatic nitrogens, matching standard valence expectations.

## [1.0.7] - 2018-02-08
### Added
### Changed
- Bugfixes
### Removed

## [1.0.6] - 2018-02-05
### Added
- The method `getMolecularFormula()` has been added. See README for details.
### Changed
### Removed
