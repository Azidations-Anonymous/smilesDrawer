# SVG Regression Testing Plan

## Overview
Regression testing system for SmilesDrawer SVG output to detect visual/structural changes when modifying the codebase.

## Test Strategy

### Datasets
Test against ALL existing SMILES datasets:
- `test/chembl.js` - ChEMBL database molecules
- `test/drugbank.js` - DrugBank database molecules
- `test/fdb.js` - FDB database molecules
- `test/force.js` - Force-directed layout test cases
- `test/gdb17.js` - GDB-17 database molecules
- `test/schembl.js` - SureChEMBL database molecules

### Fail-Fast Sequential Processing
Since these datasets contain thousands of SMILES strings, we use a fail-fast approach:

1. **For each SMILES string (one at a time):**
   - Generate SVG using OLD code (baseline from git)
   - Generate SVG using NEW code (current working directory)
   - Compare the two SVG outputs
   - **If mismatch:** STOP immediately and report regression
   - **If match:** Continue to next SMILES

2. **No batching:** Process one SMILES at a time to minimize resource usage

3. **Early termination:** First regression found stops the entire test run

## Implementation Components

### 1. Git-Based Test Runner (`scripts/regression-test.sh`)
- Clone current repo to temporary directory (baseline/old code)
- Build library in both locations
- Run comparison test iterating through all datasets
- Report which SMILES caused regression if found
- Clean up temporary clone

### 2. SVG Generator (`test/generate-svg.js`)
Node.js script that:
- Loads built smiles-drawer library
- Takes SMILES string as input
- Outputs normalized SVG string to stdout
- Uses consistent options (width, height, theme, etc.)

### 3. SVG Comparison Logic
- Normalize SVG output (whitespace, attribute order, floating point precision)
- Compare normalized strings
- Report differences if found

### 4. Test Orchestrator (`test/regression-runner.js`)
- Loads all test datasets
- Iterates through each SMILES sequentially
- Spawns SVG generation for old and new code
- Compares outputs
- Exits with error code on first mismatch

## Success Criteria
- All SMILES from all datasets produce identical SVG output between old and new code
- Test completes without finding regressions
- Clear error reporting showing which SMILES failed and what the difference was

## Usage

```bash
# Run full regression test suite
npm run test:regression

# Or directly:
./scripts/regression-test.sh
```

## Exit Codes
- `0` - All tests passed (no regressions)
- `1` - Regression detected (outputs failing SMILES and diff)
- `2` - Test setup/infrastructure error
