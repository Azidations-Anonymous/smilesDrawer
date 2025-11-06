# SmilesDrawer → PIKAChU Cis/Trans Parity Roadmap

This document records the work required to reproduce PIKAChU’s fixes for incorrectly drawn cis/trans (E/Z) double bonds—especially stereobonds embedded in rings—inside SmilesDrawer. It references:

- The description in the PIKAChU paper (Section “Visualisation and kekulisation”, `/Users/ch/Downloads/s13321-022-00616-5.pdf`, p.5).
- PIKAChU source (`pikachu/drawing/drawing.py`, `pikachu/chem/structure.py`, `pikachu/smiles/smiles.py`).
- Current SmilesDrawer logic (`src/preprocessing/PositioningManager.ts`, `src/preprocessing/StereochemistryManager.ts`, `src/graph/Vector2.ts`).

---

## 1. Current Behaviour vs. PIKAChU

| Aspect | SmilesDrawer | PIKAChU | Consequence |
| -- | -- | -- | -- |
| Source of stereobond configuration | Heuristic during layout: `doubleBondConfig` toggles based on `/` and `\\` bond types (`src/preprocessing/PositioningManager.ts:56`-`150`, `200`-`360`). | Uses SMILES-derived `Bond.chiral_dict` to store exact cis/trans intent (`pikachu/smiles/smiles.py:246`-`540`; stored on `Bond` objects). | Our layout guesses can violate SMILES intent, especially when ring placement pushes substituents across the bond. |
| Validation after placement | None. Once angles are chosen the structure proceeds to overlap resolution. | `_fix_chiral_bonds_in_rings` runs after positioning to verify every chiral double bond (`pikachu/drawing/drawing.py:2125`-`2146`). | Errors in ring stereochemistry persist in output (paper Fig. S3). |
| Correction strategy | No corrective pass. | - For ring bonds: mirror the smallest adjacent branch into the ring (`_flip_stereobond_in_ring`, `pikachu/drawing/drawing.py:592`-`873`).<br>- For acyclic stereobonds: rotate subtrees around neighbouring single bonds (`pikachu/drawing/drawing.py:2046`-`2096`).<br>- Process sequences of alternating stereobonds first (`structure.find_double_bond_sequences`, `pikachu/chem/structure.py:816`-`873`). | SmilesDrawer misdraws consecutive stereobonds in macrocycles and cannot recover. |
| Geometry helpers | `Vector2` lacks mirror about line, branch traversal favours ring heuristics only. | `Vector` exposes `mirror_about_line`; drawing code tracks `drawn_neighbours`, anchored rings, subtree sizes. | Need new geometry primitives and neighbour bookkeeping. |

---

## 2. High-Level Goals

1. **Preserve SMILES stereochemistry** by storing explicit cis/trans intent on bonds and using it during all layout decisions.
2. **Post-process the positioned graph** to detect wrongly depicted stereobonds and repair them without breaking other geometry.
3. **Handle ring and chain cases** with branch-mirroring (rings) and subtree rotations (chains), matching PIKAChU.
4. **Support sequences of stereobonds** so that each bond is corrected exactly once (avoid oscillation).
5. **Add regression coverage** demonstrating that previously failing macrocycles render correctly.

---

## 3. Implementation Workstreams

### 3.1 Stereochemistry Data Pipeline
- **Extend Edge/Bond metadata**: add fields to mirror `Bond.chiral`, `Bond.chiral_dict`, and `Bond.chiral_symbol`. Parsing already distinguishes `/` vs `\\`, but we need to translate that into a dictionary of substituent pairs → orientation (`cis`/`trans`) as PIKAChU does (`pikachu/smiles/smiles.py:515`-`540`).
- **Graph construction** (`src/graph/Graph.ts`): capture cis/trans markers while adding edges, so the positioning and drawing phases can query the target orientation instead of relying on `doubleBondConfig`.
- **Update preprocessing output** (`src/preprocessing/MolecularPreprocessor.ts:286`) to expose stereobond metadata for renderers and future tests.

### 3.2 Layout Adjustments
- **Stop relying on heuristics**: refactor `PositioningManager.createNextBond` to consult bond orientation data rather than the current parity guesswork (`src/preprocessing/PositioningManager.ts:200`-`360`). Keep branch-size heuristics for aesthetic choices but ensure they respect hard cis/trans constraints.
- **Record neighbour ordering** for each drawn vertex (similar to PIKAChU’s `Atom.drawn_neighbours`). SmilesDrawer already has `Vertex.getDrawnNeighbours` but we need a persistent list after positioning to support corrections.

### 3.3 Post-Positioning Corrections
1. **Sequence detection**: port `Structure.find_double_bond_sequences` (`pikachu/chem/structure.py:816`-`873`) to TypeScript so we process alternating stereobond chains before isolated bonds.
2. **Geometry helpers**:
   - Implement `Vector2.mirrorAboutLine(centerA: Vector2, centerB: Vector2)` to mirror points across the bond axis (see PIKAChU’s `Vector.mirror_about_line` usage in `_flip_subtree`, `pikachu/drawing/drawing.py:872`-`884`).
   - Add utilities to compute subtree sizes excluding specified “fixed” atoms, similar to `Drawing.get_subgraph_size`.
   - Track which rings each vertex belongs to and expose them after layout (SmilesDrawer already stores ring memberships on `Atom`, confirm availability during the fix).
3. **Ring stereobond fix**:
   - Replica of `_chiral_bond_drawn_correctly` (`pikachu/drawing/drawing.py:2048`-`2074`) to detect mismatches by comparing neighbour positions relative to bond axis.
   - Port `_flip_stereobond_in_ring` logic (`pikachu/drawing/drawing.py:592`-`873`), including:
     - Selecting the branch with smallest non-cyclic subtree.
     - Ensuring an atom is not flipped twice within the same sequence.
     - Handling cases where both neighbours belong to other stereobonds (fallback to warning or strict error).
4. **Chain stereobond fix**:
   - Implement subtree rotations analogous to `_flip_subtree` and `can_rotate_around_bond` logic for acyclic stereobonds (`pikachu/drawing/drawing.py:2058`-`2096`, `3188`-`3278`).
   - Guard against rotating atoms in other stereobonds (skip when adjacent bonds are chiral).
5. **Fix ordering**: run the correction pass immediately after layout and before overlap resolution, mirroring `_process_structure` (`pikachu/drawing/drawing.py:2526`-`2576`).

### 3.4 Error Handling & Options
- PIKAChU falls back to warnings unless `strict_mode` is set (`pikachu/drawing/drawing.py:835`-`848`). Decide whether SmilesDrawer should log, throw, or silently ignore unresolved stereobonds; update options interface if needed.
- Remove any lingering reliance on the current `doubleBondConfig` counter once deterministic corrections are in place.

---

## 4. Testing & Validation

- **Unit tests**:
  - Craft fixtures for simple cis/trans alkenes, fused ring systems, and macrocycles that originally failed (refer to Additional file 2 Fig. S3).
  - Validate both geometric orientation (relative positions of substituents) and metadata (cis/trans labels remain consistent).
- **Cross-check with PIKAChU**:
  - Generate coordinates for the same SMILES using PIKAChU; compare orientation flags or use geometric predicates to ensure both toolkits agree.
- **Visual regression**:
  - Re-run existing SmilesDrawer rendering tests and add snapshots for problematic molecules to confirm the fix does not introduce new artefacts.
- **Performance**:
  - Benchmark the correction pass on large molecules (multiple stereobond sequences) to make sure the additional traversal/mirroring remains acceptable for interactive use.

---

## 5. Open Questions

1. **Chiral dictionary derivation**: we can port PIKAChU’s SMILES parsing logic directly if needed (the project is MIT-licensed), but we still need to decide whether augmenting our existing parser (`src/parsing/Parser.ts`) yields a cleaner integration.
2. **Ring metadata availability**: SmilesDrawer stores ring membership on `Atom.value.rings`. Confirm this list is still valid after layout adjustments and accessible during correction.
3. **Implicit hydrogens**: PIKAChU mirrors hydrogen atoms when necessary. Ensure SmilesDrawer’s treatment of implicit hydrogens (often not drawn) does not lead to missing neighbours when calculating orientation.
4. **Strict vs. permissive mode**: should we expose a user option similar to PIKAChU’s `strict_mode` to turn unresolved stereochemistry into hard errors?
5. **Overlap resolution interplay**: verify that performing subtree flips before `resolve_primary_overlaps` does not reintroduce the original stereochemistry issues during later rotations.

---

## 6. Suggested Execution Order

1. Implement stereobond metadata propagation (parser → graph → edges).
2. Refactor layout heuristics to obey explicit cis/trans information.
3. Introduce geometry helpers (mirror, subtree size) and persistent neighbour bookkeeping.
4. Port post-positioning correction logic for ring and chain stereobonds, wired into the layout pipeline.
5. Add regression tests and compare against PIKAChU output.
6. Remove obsolete `doubleBondConfig` code paths and document the new behaviour in release notes.

---

## 7. Checklist

- [ ] Edge objects carry explicit cis/trans orientation data sourced from SMILES parsing.
- [ ] Positioning honours stored stereochemistry during initial placement.
- [ ] Post-processing detects and repairs misdrawn stereobonds in rings and chains.
- [ ] Sequences of alternating stereobonds are corrected in order without double flipping.
- [ ] Vector2 exposes line-mirroring helper; subtree traversal utilities exist for flips.
- [ ] Regression suite covers the macrocycle/cis-trans examples highlighted in the PIKAChU paper.
- [ ] Documentation and options updated to describe the new stereochemistry handling.
