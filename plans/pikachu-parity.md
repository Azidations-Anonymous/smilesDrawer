# Pikachu Parity Plan

This document tracks the work required to align SmilesDrawer with the stereochemistry and ring-handling behaviour of [PIKAChU](https://github.com/BTheDragonMaster/pikachu) as described in Terlouw et al., *J. Cheminf.* 2022.

## Goals

1. **Ring inventory parity** – ensure both toolkits identify identical ring sets (including macrocycles) so downstream steps operate on the same topology.
2. **Cis/trans stereochemistry parity** – maintain double-bond configurations across layout updates, matching PIKAChU’s handling of constrained systems.
3. **Regression stability** – re-run the targeted regression SMILES until `npm run test:regression` reports “NO DIFFERENCES DETECTED” while retaining the correct ring count (4 for the troublesome macrocycle).

## Current Gaps

| Area | SmilesDrawer state | Pikachu reference | Impact |
| --- | --- | --- | --- |
| SSSR computation | `SSSR.getRings` trims to exact `nSssr`; fallback inventory added, but ordering differs when macrocycles present. | PIKAChU keeps every `cycles.find_sssr()` member accessible and reorders rings when building layouts. | Ring count now correct (4), but adjacency order changed, which exposed cis/trans issues. |
| Ring bookkeeping | `RingManager` fills missing rings after initial SSSR pass and marks aromaticity later. | PIKAChU stores original rings, neighbours, overlaps, and bridged systems before any stereochemistry resolution. | Aromatic overlay + ring-neighbouring info diverge, especially for macrocycles. |
| Cis/trans metadata | `CisTransManager` infers orientation from SMILES directional markers at runtime (`resolveCisTrans`) and stores only anchor/partner pairs. | Bonds carry a full `chiral_dict` mapping for every adjacent atom pair; corrections compare geometry to that map. | Macrocycle now flips a double bond between cis/trans orientations even though ring count is correct. |
| Stereo corrections | SmilesDrawer mirrors entire subtrees based on heuristic neighbour picks. | PIKAChU determines double-bond sequences, checks already fixed bonds, and mirrors precise branches/ring members. | Our heuristics pick the “wrong” neighbour after ring inventory changed, causing the regression failure. |

## Work Breakdown

### 1. Ring Inventory Alignment

1. Audit `graph.getAllCycles()` vs. PIKAChU’s `Cycles.find_sssr()` output on the problematic SMILES.
2. Preserve the order and full set of cycle members when `SSSR.getRings` returns; avoid truncating to `nSssr` when macrocycles are present.
3. Mirror PIKAChU’s aromatic-ring helper (`Ring.drawing` in `pikachu/drawing/drawing.py`) so aromatic overlays include inventory-only rings (currently handled by `getAromaticRings` but without centres unless `setRingCenter` is rerun).
4. Extend regression metadata to log both SSSR size and “inventory” size for quick comparison.

### 2. Cis/Trans Data Model Parity

1. Introduce a `chiralDict` (or similar) structure on `Edge`, populated during preprocessing, inspired by `pikachu/chem/structure.py` lines 360‑560.
   - Capture every neighbour pair (both sides of the double bond), regardless of whether SMILES supplied `/` or `\` for both single bonds.
   - Preserve directional markers when missing by inferring from atom indices, matching Pikachu’s fallback logic.
2. Replace `CisTransManager.resolveCisTrans` with a version that reads this stored map rather than re-deriving orientations from current geometry.
3. Update `isBondDrawnCorrectly` to compare vertex positions against the `chiralDict`, similar to Pikachu’s `_chiral_bond_drawn_correctly` (line ~2000).
4. Ensure metadata survives cloning during regression runs (JSON reports should mention both ring and stereo diffs).

### 3. Stereo Correction Strategy

1. Port Pikachu’s `_flip_stereobond_in_ring`, `_find_ring_branch_to_flip`, and `_find_ring_neighbour` ideas into `CisTransManager` so macrocycle fixes mirror specific atoms instead of entire subtrees.
2. Track “fixed” stereobonds (`this.fixedStereoBonds`) the way Pikachu does to avoid undoing a correction in subsequent passes.
3. Support multi-bond sequences: find alternating single/double stretches (see `structure.find_double_bond_sequences`) and correct them in order before touching isolated bonds.
4. Add targeted unit/integration tests:
   - The provided regression SMILES.
   - Additional macrocycles from PIKAChU’s examples where cis/trans constraints span >10 atoms.

### 4. Tooling & Validation

1. Leverage `../pikachu/pikachu-run` ring count output to verify parity after each change (already prints `[pikachu-run] detected N rings`).
2. Extend `npm run test:regression` harness to surface when only stereochemistry differs (e.g., highlight mismatched bond ids in JSON).
3. Document a manual checklist for future regressions (ring inventory matches, `CisTransManager.buildMetadata` emits identical maps, etc.).

### 5. Final Parity Push (current branch: `pikachu-parity-final`)

#### 5.1 Double-bond sequence resolution
Goal: Port Pikachu’s sequence-aware stereobond fixer so alternating double bonds (especially in macrocycles) are corrected as a group.

Steps:
1. **Instrumentation**
   - Mirror `structure.find_double_bond_sequences` from `pikachu/chem/structure.py:816-872` inside `CisTransManager`. The local helper should walk alternating single/double paths, merging fragments until no more joins are possible.
   - Extend the regression diagnostics (`cisTransDiagnostics`) to note the sequence ID each double bond belongs to for easier debugging.
2. **Port core logic**
   - Track sequences in `correctBondOrientations()`: loop over each sequence first, exactly like Pikachu’s `_fix_chiral_bonds_in_rings` (drawing/drawing.py:2088-2145). Only after all sequences are processed should we fall back to isolated stereobonds.
   - Add an explicit `fixedStereoBonds` check before every correction so a later pass never undoes a successful flip (Pikachu’s `fixed_chiral_bonds` is authoritative).
3. **Parity of `_flip_stereobond_in_ring`**
   - Compare our flow (branch selection, preference for already-fixed neighbours) with Pikachu’s implementation and close any gaps (e.g., separate handling when both adjacent branches are already in sequences). Update the helper comments to document the decision tree.
4. **Tests**
   - Create a targeted Jest/snapshot test that feeds the problematic macrocycle through `SvgDrawer` and inspects the `cisTransDiagnostics` block to ensure every evaluation reports “cis/trans” rather than “collinear” after correction.
   - Add two more molecules from Pikachu’s examples where sequences span >2 bonds to guard against regressions.

#### 5.2 Aromatic cycle inventory parity
Goal: Ensure aromatic overlays and branch decisions use the same inventory as Pikachu’s `Drawer`, without redundant circles.

Steps:
1. **Inventory coverage audit**
   - Compare `RingManager.getAromaticRings()` output against `drawer.rings` in Pikachu for the regression SMILES. Note which cycles Pikachu actually draws (from `drawer.aromatic_cycles`).
   - Record whether those inventory-only cycles map to specific atoms (IDs) not present in SSSR; this becomes the coverage criterion.
2. **Shared accessor**
   - Add a cached `this.aromaticInventory` field to `RingManager` that deduplicates cycles by sorted member set and keeps track of the vertices each cycle covers.
   - Update both `DrawingManager` and `SvgEdgeDrawer` to accept an optional filter predicate (e.g., “only draw inventory cycles containing uncovered atoms”) so future tooling can opt into more aggressive overlays.
3. **Neighbour helpers**
   - Expose a method similar to Pikachu’s `_find_ring_neighbour` (drawing.py:700-760) at the RingManager level so `CisTransManager` and future layout code can reason about inventory-only cycles when choosing flip anchors.
4. **Regression guard**
   - Extend `debug/ring-diagnostics.js` to log which aromatic cycles were actually drawn (IDs + member sets). Add a regression test that asserts the macrocycle now produces only four circles.

#### 5.3 Chiral dict persistence & consumers
Goal: Treat `edge.chiralDict` as first-class data: serialize it everywhere, expose via diagnostics, and use it to drive layout decisions.

Steps:
1. **Serialization**
   - Confirm `graphData.serializedData.edges[].chiralDict` is present in every code path (`MolecularDataSnapshot`, `SvgDrawer.getPositionData`). Add smoke tests asserting that dumping JSON via `debug/generate-json.js` yields the dict for the macrocycle.
2. **Runtime consumers**
   - Update `CisTransManager.buildMetadata()` to read the dict back when available (e.g., when the graph is loaded from JSON) so repeated runs/states keep the original SMILES intent without re-parsing.
   - Introduce a helper `getChiralExpectation(atomA, atomB)` that returns the stored orientation if it exists, falling back to `cisTransNeighbours` otherwise. Use this everywhere we currently re-derive orientation from directional bonds.
3. **Diagnostics**
   - Extend `cisTransDiagnostics` to include whether the expectation came from the SMILES parser or from persisted metadata; this will help cross-check with Pikachu.
4. **Tooling**
   - Update `scripts/dump-cis-trans.js` and `pikachu-ring-dump` comparisons to highlight mismatched pairs (e.g., “expected cis, actual trans”) so we can mirror Pikachu’s `bond.chiral_dict` structure one-to-one.

## Verification Checklist

- [ ] `npm run test:regression -- -smiles '…macrocycle…' -json` reports no differences.
- [ ] Debug JSON shows both old/new `ringCount` entries equal to 4.
- [ ] Visual diff indicates identical cis/trans orientation (no alternating shading on the macrocycle bond).
- [ ] Additional spot-check SMILES (planar conjugated systems, crowded fused systems) also pass.

## Open Questions

1. Do we need a direct port of PIKAChU’s `structure.find_cycles()` logic, or can existing SmilesDrawer cycles suffice once ring metadata is preserved?
2. Should we track aromatic systems vs. cycles like PIKAChU to better prioritise which neighbours to mirror?
3. Can we expose Pikachu’s `bond.chiral_dict` data via regression reports to confirm parity without diving into console logs?

---
Updates to this plan should cite the relevant commit/PR and describe which parity gap was addressed.*** End Patch
