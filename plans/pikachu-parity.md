# PIKAChU Parity Tracker

This tracker aggregates the open work needed to keep SmilesDrawer functionally aligned with the behaviours described in the PIKAChU paper and reference implementation. It complements the focused roadmaps in this folder (`sssr-parity-roadmap.md`, `cis-trans-parity-roadmap.md`, `rendering-parity-roadmap.md`) by listing what’s already been ported and what is still outstanding across the whole project.

---

## Shipped Parity Work

- **Johnson cycle inventory** – `Graph.getAllCycles()` now consumes the TypeScript port of Johnson’s algorithm (`src/algorithms/JohnsonCycles.ts`), giving downstream systems deterministic cycle catalogues.
- **SSSR pipeline overhaul** – `src/algorithms/SSSR.ts` mirrors the set-based bonding logic, integer candidate metrics, and ordered ring output used in `pikachu/drawing/sssr.py`. Tests in `test/sssr.js` enforce parity on fused and macrocyclic systems.
- **Legacy SSSR switches removed** – the experimental toggle is gone, and `SSSR.getSSSR` now mirrors PIKAChU’s “allow one extra candidate” guard so parity behaviour is always on by default.
- **Cis/trans metadata and correction** – `src/preprocessing/CisTransManager.ts` derives `cisTransNeighbours` from the SMILES markers and repairs misdrawn stereobonds post-layout, matching `structure.find_double_bond_sequences` + `_fix_chiral_bonds_in_rings`.
- **Overlap finetuning pass** – `src/preprocessing/OverlapResolutionManager.ts` implements the optional `_finetune_overlap_resolution` loop, gated by the new `finetuneOverlap` option (`src/config/IOptions.ts`).
- **Atom annotation storage & rendering** – Atoms own an `AtomAnnotations` container (`src/graph/AtomAnnotations.ts`), the API exposes register/get/set helpers, and `showAtomAnnotations` plus formatter/styling knobs render those attributes directly on the canvas/SVG output.
- **Aromatic cycle inventory** – `RingManager.getAromaticRings()` surfaces Johnson-derived aromatic cycles (including macrocycles outside the SSSR basis) so both the canvas and SVG drawers render the same aromaticity markers PIKAChU exposes.

---

## Outstanding Items

### SSSR & Aromaticity

1. **Documentation/tests** – ✅ README now documents the new SSSR stack and Additional file 2 Fig. S2 is covered in `test/sssr.js`. Keep this section up to date if further regressions emerge.

### Finetune & Rendering Follow-ups

1. **Overlap finetune safeguards** – ✅ Added iteration/time guards (options `finetuneOverlapMaxSteps` and `finetuneOverlapMaxDurationMs`) and regression coverage in `test/overlap-finetune.js` for the Fig. 2B clash macrocycles.

### Cis/Trans Follow-ups

1. **Strict-mode or warnings** – Mirror PIKAChU’s `strict_mode` handling so unresolved stereobonds raise surfaced warnings/errors instead of silently failing.
2. **Regression depth** – Extend `test/cis-trans.js` with macrocyclic / multi-stereobond fixtures from Fig. S3 to ensure the correction pass scales beyond the current three cases.

### Documentation & Release Notes

- Add a parity section to `CHANGELOG.md` summarising the imported behaviours, option additions (`finetuneOverlap`, annotation APIs), and any breaking changes so downstream users know what to expect.

---

## Immediate Next Steps

1. Add the missing regression fixtures for macrocycle rings and stereobond sequences so future refactors can’t regress the imported behaviour.
2. Harden the finetune pass with iteration/time guards and accompanying tests/benchmarks.
3. Implement the cis/trans `strict_mode` handling (including documentation) so stereochemistry mismatches surface as explicit warnings/errors.
