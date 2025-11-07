# Functional Refactoring Plan for SmilesDrawer

This document outlines a structured approach for modernising the codebase with
readable, maintainable functional programming techniques. The goal is to remove
hand-rolled imperative loops and shared mutable state where reasonable, while
preserving the current behaviour and performance profile.

## Guiding Principles

1. **Clarity first**: Prefer descriptive higher-level constructs (e.g. `map`,
   `reduce`, `filter`) where they make intent obvious. Avoid transformations that
   hurt readability or allocate excessively for performance-critical code.
2. **Incremental adoption**: Replace imperative sections module-by-module,
   verifying behaviour with targeted tests before moving on.
3. **Helper utilities**: Centralise recurring loop patterns in utility helpers
   (e.g. `ArrayHelper`) so call sites remain concise and consistent.
4. **Type safety**: Keep TypeScript types precise. Variadic tuple helpers and
   mapped types can encode expectations about array lengths and element types.
5. **Avoid regressing performance**: Regression tests on layout and large
   molecules should be included whenever a refactor touches numerical hot paths.

## Modules and Techniques

### 1. Algorithms (`src/algorithms`)

- **KamadaKawaiLayout**  
  - Use `ArrayHelper.forEach`, `ArrayHelper.forEachReverse`, and `ArrayHelper.forEachIndexReverse`
    for all nested loops.
  - Replace manual matrix creation with `Array.from` or `.map`.
  - Extract repeated calculations (e.g., energy update) into local helper
    functions to clarify intent.

- **SSSR**  
  - Continue replacing nested loops with `map`, `reduce`, `flatMap` where
    feasible.  
  - Introduce helper functions for "clone path matrices", "combine bonds", and
    "copy nested arrays" to make the algorithm read declaratively.  
  - Guard performance by benchmarking large fused systems after each refactor.

### 2. Graph Layer (`src/graph`)

- Replace manual array iteration in `GraphMatrixOperations` with typed array
  helpers (`map`, `mapMatrix`, `ArrayHelper` iterators).  
- Encapsulate repeated BFS/DFS logic into reusable functions (e.g., `traverse`
  returning visitors) to reduce bespoke loops.  
- For algorithms such as `Ring.getPolygon`, use `map` over the member list
  instead of manual `for` loops.

### 3. Preprocessing Managers (`src/preprocessing`)

- The managers (`RingManager`, `OverlapResolutionManager`, `PositioningManager`)
  are rich in imperative loops. Systematically replace:
  - `for (var i = 0…` loops with `forEach`, `map`, `filter`, or `reduce`.
  - Mutating accumulations with immutable transformations when performance
    allows (e.g., using `reduce` to construct new arrays).  
- Add targeted regression tests covering fused/bridged ring layouts before
  refactoring each manager.

### 4. Handlers (`src/handlers`)

- `BridgedRingHandler` can benefit from `ArrayHelper` iterators and high-level
  set operations (e.g., using `map`, `filter`, `Set` operations) to make the
  recursive logic clearer.  
- Consider introducing helper functions such as `collectRingMembers` or
  `updateRingConnections` to isolate behaviour from iteration details.

### 5. Utility Modules (`src/utils`)

- Expand `ArrayHelper` with:
  - `mapMatrix(matrix, callback)` for uniform matrix transformations.
  - `sum(array)` / `sumBy(array, selector)` for common reductions.  
  - Typed `zip`/`zipWith` helpers to combine arrays of equal length.
- Ensure every helper lands with unit tests in `test/array-helper.js`.

### 6. Parsing Layer (`src/parsing`)

- Generated parser files (PEG output) should remain untouched. Focus only on
  hand-written utilities (if any) to prevent conflicts with generator outputs.

## Workflow Recommendations

1. **Pick a module** and identify imperative hotspots.
2. **Add/extend tests** to cover the functionality being refactored (use
   node:test suites under `test/`).
3. **Refactor incrementally**, running `npm run type-check` and relevant test
   suites after each change.
4. **Benchmark** using existing regression/smoke tests for layout-heavy
   molecules to detect performance or layout regressions early.
5. **Document helper utilities** in `ArrayHelper` comments to explain
   performance characteristics and intended usage.

## Tooling

- `npm run type-check` – ensure typings stay sound.
- `npm run test:array-helper`, `npm run test:layout`, `npm run test:sssr` –
  quick regression checks during refactors.
- Smoke/regression scripts under `scripts/` for full coverage on demand.

## Tracking Progress

Maintain a checklist of modules and files converted to the new style. Consider
adding status badges or notes in this document as each module transitions to the
functional helpers. Review pull requests with an eye toward ensuring new code
adheres to the established patterns.

---

By following the plan above, the codebase should gradually transition from
imperative loops to a more expressive, maintainable functional style without
sacrificing correctness or performance.
