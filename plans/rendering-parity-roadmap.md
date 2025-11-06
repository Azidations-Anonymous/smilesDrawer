# Rendering Parity Roadmap (Finetuning & Atom Annotations)

The PIKAChU paper highlights two additional capabilities beyond SSSR and cis/trans corrections that we currently lack in SmilesDrawer: (1) an overlap “finetuning” pass that iteratively reduces steric clashes, and (2) per-atom annotation support. This document captures the tasks required to reach parity. References point to the PIKAChU repository (`../pikachu`) and the SmilesDrawer TypeScript codebase.

---

## 1. Finetuning Overlap Resolution

### 1.1 Behaviour Gap
- **PIKAChU**: After the standard overlap solver, PIKAChU optionally runs `_finetune_overlap_resolution` (`pikachu/pikachu/drawing/drawing.py:507`-`586`). It:
  - Identifies all clashing atom pairs (`_find_clashing_atoms`, `pikachu/pikachu/drawing/drawing.py:856`-`869`).
  - For each clash, finds the shortest bond path between the atoms, filters rotatable bonds (excluding stereobonds, adjacent stereobonds, and ring bonds).
  - Chooses the bond closest to the midpoint of the path and tests twelve 30° rotations, keeping the orientation that minimises the overall overlap score.
  - Repeats while the global overlap score exceeds a sensitivity threshold and `options.finetune` is enabled.
- **SmilesDrawer**: Overlap resolution stops after `resolveSecondaryOverlaps` (`src/preprocessing/MolecularPreprocessor.ts:698`-`705`, `src/preprocessing/OverlapResolutionManager.ts:207`-`223`). There is no equivalent “finetune” search, and the public options only expose `overlapSensitivity`/`overlapResolutionIterations` (`src/config/IOptions.ts:59-60`).

### 1.2 Tasks
1. **Expose an option** similar to PIKAChU’s `finetune` boolean in our configuration (`IMoleculeOptions`). Default to `false` to preserve current performance.
2. **Add clash detection**: port `_find_clashing_atoms` to a new helper in `OverlapResolutionManager` so we can enumerate non-adjacent atoms closer than ~0.8 bond lengths.
3. **Shortest path search**:
   - Implement a bond-path BFS/Dijkstra (PIKAChU builds both bond and atom paths via `find_shortest_path`, `pikachu/pikachu/drawing/drawing.py:460`-`505`).
   - Ensure our graph helpers can produce bond sequences; this may require storing per-vertex drawn neighbours after layout.
4. **Rotatable bond filter**: match PIKAChU’s `bond_is_rotatable` rules (disallow stereobonds, neighbours of stereobonds, and bonds in cycles) before selecting candidates.
5. **Rotation evaluation**:
   - Drive `OverlapResolutionManager.rotateSubtree` (already available) through 12 discrete 30° increments, each time recomputing the overlap score (`getOverlapScore`).
   - Pick the rotation with the lowest score; if no improvement, revert.
6. **Integrate into pipeline**: call the finetune loop between primary and secondary overlap resolution phases when the option is set (`MolecularPreprocessor.resolvePrimaryOverlaps` / `resolveSecondaryOverlaps`).
7. **Testing**:
   - Construct molecules with known clashing branches (as in Fig. 2B of the paper) and assert the finetune pass reduces the overlap score.
   - Benchmark runtime impact on large molecules; consider a max-iteration or timeout guard.

---

## 2. Atom Annotations

### 2.1 Behaviour Gap
- **PIKAChU**: Every `Atom` owns an `AtomAnnotations` collection (`pikachu/pikachu/chem/atom.py:958`-`989`). `Structure` stores global annotation defaults (`pikachu/pikachu/chem/structure.py:1413`-`1467`), enabling APIs like `structure.add_attribute(...)`, `structure.set_attribute(...)`, and reactions/utilities that rely on these custom tags (`pikachu/pikachu/reactions/functional_groups.py:221`-`236`).
- **SmilesDrawer**: `Atom` lacks any annotation container (`src/graph/Atom.ts`) and no higher-level module exposes per-atom metadata hooks. Users cannot attach arbitrary information to the molecular graph for downstream processing or rendering.

### 2.2 Tasks
1. **Design annotation container**:
   - Introduce an `AtomAnnotations` class (mirroring the MIT-licensed PIKAChU implementation) that stores a set of keys plus per-key values.
   - Add an `annotations` field to `Atom` (`src/graph/Atom.ts`) with methods to add/get/set annotations.
2. **Structure-level defaults**:
   - Extend the data structures returned by `MolecularPreprocessor` and `Drawer.getPositionData()` to expose annotation APIs for entire molecules, so callers can apply annotations post-parse.
   - Provide helpers to add attributes across all atoms, similar to `Structure.add_attribute` in PIKAChU.
3. **Persistence & cloning**:
   - Ensure annotations are copied when atoms are cloned (e.g., in `Vertex.clone`, `MolecularPreprocessor` caching).
   - Include annotations when exporting or serialising data (if applicable).
4. **Rendering hooks**:
   - Decide how annotations influence drawing (e.g., optional callback to render labels, highlight atoms). At minimum, ensure annotations are preserved so downstream tools can consume them.
5. **Testing & Docs**:
   - Unit tests for add/get/set flows and cloning behaviour.
   - Usage documentation mirroring PIKAChU’s description (paper Section “Structure annotation”, p.5).

---

## 3. Licensing Note

PIKAChU is MIT-licensed, so porting its annotation container and finetuning logic is permissible. When reusing code, retain the original copyright headers.

---

## 4. Checklist

- [ ] Add optional finetune pass to the overlap resolver, controlled by configuration.
- [ ] Implement clash detection, bond-path search, rotatable bond filtering, and rotation trials.
- [ ] Provide per-atom annotation storage and structure-level helpers.
- [ ] Ensure annotations survive cloning, graph transformations, and rendering exports.
- [ ] Add tests/regressions covering finetune improvements and annotation APIs.
- [ ] Update public documentation to advertise the new parity features.

