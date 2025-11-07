# SmilesDrawer → PIKAChU SSSR Parity Roadmap

This document captures the work required to bring SmilesDrawer’s smallest set of smallest rings (SSSR) implementation in line with the behaviour described in the PIKAChU paper (`/Users/ch/Downloads/s13321-022-00616-5.pdf`) and its reference implementation (`../pikachu`). Tasks are grouped by theme and reference the SmilesDrawer TypeScript sources and the corresponding Python code in PIKAChU for cross-checking.

---

## 1. Snapshot of the Current Implementations

- **SmilesDrawer**
  - Path-included Floyd–Warshall routine (`src/algorithms/SSSR.ts:115`-`258`) builds `d`, `pe`, `pe_prime` matrices over the bridge-free adjacency matrix from `GraphMatrixOperations` (`src/graph/GraphMatrixOperations.ts:18`-`83`).
  - Candidates are sorted by the pseudo-length `c`, using even/odd sizes encoded via `d + 0.5` (`src/algorithms/SSSR.ts:269`-`298`).
  - Bond bookkeeping relies on nested arrays with manual deduplication (see in-loop fix-up at `src/algorithms/SSSR.ts:321`-`327` and `346`-`348`).
  - SSSR collection stops as soon as `cSssr.length >= nsssr` (`src/algorithms/SSSR.ts:336` & `357`) and returns raw vertex id sets without ordering (`src/algorithms/SSSR.ts:69`-`79`).
  - An `experimental` flag (now unused) forces `nSssr = 999` to compensate for missing rings (`src/algorithms/SSSR.ts:61`-`63`).

- **PIKAChU**
  - Uses the same bridge removal and distance-matrix logic (`pikachu/drawing/sssr.py:113`-`148`, `192`-`280`), but stores `pe_prime` as a set of tuples to prevent duplicate bond fragments (`pikachu/drawing/sssr.py:225`-`278`).
  - Candidate sizing keeps values integral (even cycles → `2*d`, odd cycles → `2*d + 1`; `pikachu/drawing/sssr.py:287`-`303`), avoiding floating arithmetic.
  - Bond tracking is handled by Python `set`/`dict` structures, eliminating the array normalisation hack (`pikachu/drawing/sssr.py:308`-`347`, `383`-`414`).
  - Rings are reordered along the molecular graph before returning (`pikachu/drawing/sssr.py:66`-`80`), and the collector allows one extra cycle before breaking (`len(c_sssr) > sssr_nr`; `pikachu/drawing/sssr.py:328`, `344`).
  - Separately, the `pikachu/chem/rings/find_cycles.py` module implements Johnson’s algorithm for complete cycle enumeration, then derives an SSSR-style basis for aromaticity (`pikachu/chem/rings/find_cycles.py:155`-`219`), matching the paper’s Section “First, … all cycles in the graph are detected … identifies the smallest set of unique smallest rings (SSSR)”.

---

## 2. Gaps to Close

| Area | SmilesDrawer Behaviour | PIKAChU Behaviour | Impact |
| -- | -- | -- | -- |
| Cycle inventory | No Johnson pass; depends entirely on path matrices. | Enumerates all cycles first, winnows minimal set (paper p.3, `pikachu/chem/rings/find_cycles.py:186`-`203`). | Missing rings in fused/macro systems and no reusable cycle catalog for aromaticity. |
| Candidate sizing | Uses `d + 0.5` trick for odd cycles. | Stores parity explicitly with integer sizing (`pikachu/drawing/sssr.py:295`-`298`). | Floating parity hack complicates porting and can trigger precision issues. |
| Bond deduplication | Manual array flattening (`src/algorithms/SSSR.ts:321`-`327`). | Set-based bond tracking by object identity. | Leads to duplicated edges, causing missed ring detection downstream. |
| Termination condition | Stops at `>= nSssr`. | Allows one extra cycle before exit (`>`). | SmilesDrawer can under-produce SSSR sets (paper Fig. S2). |
| Ring ordering | Returns unordered vertex sets. | Reconstructs neighbour-ordered cycles before output (`pikachu/drawing/sssr.py:66`-`80`). | Impacts deterministic rendering and downstream aromatic checks. |
| Experimental flag | Hard-coded override to mask bugs. | No equivalent. | Flag masks real defects; needs removal or reimplementation post-fix. |
| Testing | Limited regression coverage for complex rings. | Paper highlights macrocycle regression tests. | Need target molecules that previously failed (macrocycles, fused aromatics). |

---

## 3. Action Items

### 3.1 Establish a Cycle Inventory Layer
1. **Port or reimplement Johnson’s algorithm** (reference `pikachu/chem/rings/find_cycles.py:93`-`152`) into TypeScript, ideally as `src/algorithms/JohnsonCycles.ts`.
2. **Expose cycle sets** via `Graph` or an `Algorithms` helper so both SSSR and aromaticity routines can query them.
3. **Filter cycles**: discard 2-cycles, deduplicate by sorted vertex id, and retain length `< 10` logic if needed (investigate rationale in PIKAChU before copying).
4. **Unit tests**: create fixtures covering simple rings, fused bicyclic systems, and macrocycles to confirm parity with PIKAChU’s output.

### 3.2 Refine Path-Included Distance Matrices
1. **Adjust `getPathIncludedDistanceMatrices`** to store `pe_prime` entries as sets of flattened bond tuples (mirror `pikachu/drawing/sssr.py:231`-`278`). This removes the loop that coerces nested arrays (`src/algorithms/SSSR.ts:321`-`327`).
2. **Ensure deterministic ordering**: convert sets back to arrays in a stable order before downstream consumption so layout remains reproducible.
3. **Add exhaustive tests** validating that duplicate bond segments are not emitted for contrived input graphs.

### 3.3 Normalise Candidate Metrics
1. Replace the `d + 0.5` parity encoding with explicit even/odd logic (`pikachu/drawing/sssr.py:294`-`303`).
2. Update comparisons (`% 2` checks at `src/algorithms/SSSR.ts:319`) to use the new integer metric.
3. Confirm that sorting still prefers smaller rings via regression tests.

### 3.4 Rework Bond Tracking and Ring Deduplication
1. Introduce a canonical bond identity (`sourceId`, `targetId`, sorted tuple) to replace the array mutation workaround.
2. Maintain an `allBonds` `Set<string>` of serialised bonds, matching the set logic in `pikachu/drawing/sssr.py:318`-`327`.
3. Align `pathSetsContain` with the Python implementation (`pikachu/drawing/sssr.py:383`-`414`), keeping the “special case” check (ring count < bond count) intact.

### 3.5 Align Termination Conditions
1. Change the exit condition in `getSSSR` from `>= nsssr` to `> nsssr`, matching the safeguard used by PIKAChU.
2. Audit callers of `getSSSR` to ensure they still cap the number of rings returned when the theoretical count is exceeded.

### 3.6 Guarantee Ordered Ring Output
1. Add a helper equivalent to `get_original_ring_order` (`pikachu/drawing/sssr.py:66`-`80`) that walks neighbours within the cycle until all vertices are consumed.
2. Invoke it before pushing rings to the final array (`src/algorithms/SSSR.ts:69`-`78`).
3. Extend tests to confirm clockwise/anticlockwise consistency for symmetric rings.

### 3.7 Remove the Legacy Experimental Flag
1. After the fixes above, remove the `experimental` branch (`src/algorithms/SSSR.ts:61`-`63`) and any UI toggle that exposes it.
2. Document the behaviour change in release notes.

### 3.8 Integrate with Aromaticity Detection
1. Review SmilesDrawer’s aromaticity workflow (entry point `src/DrawerBase.ts` or related) and ensure it can consume the richer cycle inventory when available.
2. Replica tests: reproduce the macrocycle example from Additional file 2 Fig. S2 to confirm corrected behaviour.

---

## 4. Testing & Validation Strategy

- **Regression Suite**
  - Assemble SMILES strings for all problem cases mentioned in the PIKAChU paper (macrocycles, fused aromatics, multiple stereobonds).
  - Add Jest tests that compare SmilesDrawer’s ring sets against fixtures derived from PIKAChU for those molecules.

- **Property-Based Checks**
  - Leverage random graph generators (or import from existing test harness) to verify Euler’s formula `|E| - |V| + #components` matches the ring count emitted.

- **Visual Inspection**
  - Render molecules from the regression suite before and after changes to ensure ring ordering and bond placement are stable.

---

## 5. Documentation & Communication

- Update developer docs to describe the new SSSR pipeline and the Johnson pre-pass once implemented.
- Record parity status, limitations (e.g. cycle length cap of `< 10`), and any performance considerations.
- Announce removal of the `experimentalSSSR` option and explain the new parity guarantees in user-facing change logs.

---

## 6. Open Questions / Follow-ups

1. **Cycle length threshold**: PIKAChU ignores cycles ≥ 10 atoms in its `unique_cycles` set. Confirm whether this is an optimisation tied to aromaticity (paper does not clarify) before mirroring it.
2. **Performance impact**: Evaluate the cost of Johnson’s algorithm on large molecules; consider caching or incremental updates for interactive drawing scenarios.
3. **Shared libraries**: Decide whether to vendor PIKAChU’s Johnson implementation directly (the code is MIT-licensed, so porting is permissible) or reimplement from scratch.
4. **Integration surface**: Determine if other modules (e.g. stereochemistry, layout heuristics) need adjustments once ring ordering becomes deterministic.

---

## 7. Next Steps Checklist

- [ ] Design & land Johnson cycle enumeration module.
- [ ] Refactor `SSSR.getPathIncludedDistanceMatrices` to use set-based path storage.
- [ ] Update candidate sizing and parity handling.
- [ ] Replace bond deduplication with canonical set logic.
- [ ] Adjust termination criteria and ring ordering.
- [ ] Remove the `experimental` escape hatch.
- [ ] Build comprehensive regression tests against PIKAChU outputs.
- [ ] Document the new behaviour and communicate user-facing changes.
