# Regression Testing

This directory contains tools for regression testing of SmilesDrawer to detect rendering differences between code versions.

## Overview

The regression testing system:
- Compares molecular graph JSON output between two code versions
- Generates SVG visual comparisons when differences are detected
- Saves structured JSON diffs for programmatic analysis
- Supports flexible testing modes (fail-early, visual/non-visual, dataset selection)

## Quick Start

```bash
# Test current code against HEAD (fast dataset)
npm run test:regression

# Test against a specific commit or branch
npm run test:regression master
npm run test:regression HEAD~1

# Test all datasets (comprehensive)
npm run test:regression -all

# Fast fail-early check (stops at first difference)
npm run test:regression -failearly

# JSON-only mode (no SVG generation)
npm run test:regression -novisual
```

## Flags

- **`-all`** - Test all datasets (default: fastregression dataset only ~113 SMILES)
- **`-failearly`** - Stop at first difference (default: collect all differences)
- **`-novisual`** - Skip SVG/HTML generation (default: generate visual comparisons)

Flags can be combined: `npm run test:regression master -all -failearly`

## Output

Results are saved to `regression-results/`:

```
regression-results/
├── 1.html    # Side-by-side SVG comparison (unless -novisual)
├── 1.json    # Structured diff: {"old": {...}, "new": {...}}
├── 2.html
├── 2.json
└── ...
```

**JSON Format:**
```json
{
  "old": { /* molecular graph data from baseline */ },
  "new": { /* molecular graph data from current code */ }
}
```

## Scripts

### `regression-runner.js`
Main regression test runner. Compares two versions of SmilesDrawer.

```bash
node test/regression-runner.js <old-code-path> <new-code-path> [-all] [-failearly] [-novisual]
```

Called automatically by `npm run test:regression`.

### `generate-json.js`
Generates molecular graph JSON from a SMILES string.

```bash
node test/generate-json.js "<SMILES>" [output-file.json]
```

### `generate-svg.js`
Generates SVG representation of a SMILES string.

```bash
node test/generate-svg.js "<SMILES>" [output-file.svg]
```

## Test Modes

### Default Mode
Collects all differences with full visual output.

```bash
npm run test:regression
```

**Output:** N HTML + N JSON files (one per difference)

### Fail-Early Mode
Stops at the first difference detected.

```bash
npm run test:regression -failearly
```

**Output:** 1 HTML + 1 JSON file
**Use case:** Quick sanity check during development

### No-Visual Mode
Skips SVG/HTML generation, produces only JSON diffs.

```bash
npm run test:regression -novisual
```

**Output:** N JSON files only
**Use case:** Fast automated testing, CI/CD pipelines

### Combined Modes
```bash
# Fast fail-early check without visuals
npm run test:regression -failearly -novisual

# Comprehensive test of all datasets
npm run test:regression master -all
```

## Exit Codes

- **0** - No differences found (success)
- **1** - Differences detected (reports generated)
- **2** - Infrastructure error (setup/build failure)

## Datasets

### Fast Dataset (`fastregression`)
- ~113 representative SMILES
- Covers common molecular patterns
- Runtime: ~2-3 minutes
- Default for quick testing

### Full Datasets (with `-all` flag)
- chembl
- drugbank
- fdb
- force
- gdb17
- schembl

**Total:** Thousands of SMILES
**Runtime:** 30+ minutes
**Use case:** Comprehensive validation before release

## Common Workflows

### During Development
```bash
# Quick check after making changes
npm run test:regression -failearly

# If it fails, review the visual
open regression-results/1.html
```

### Before Committing
```bash
# Full fast dataset validation
npm run test:regression

# Review any differences
open regression-results/*.html
```

### Before Release
```bash
# Comprehensive test against master
npm run test:regression master -all

# If differences found, review all reports
open regression-results/*.html
```

### TypeScript Migration
```bash
# Verify TS conversion matches JS behavior
npm run test:regression <commit-before-migration> -all
```

## Interpreting Results

### HTML Reports
- **SMILES** displayed at top
- **Side-by-side comparison** of baseline (old) vs current (new)
- **SVG renders inline** for immediate visual inspection
- **JSON size comparison** shows data structure changes

### JSON Reports
Use JSON files for:
- Programmatic diff analysis
- Automated validation in CI/CD
- Understanding structural changes (atoms, bonds, coordinates)
- Debugging specific rendering differences

### When Differences Are Found

Not all differences are regressions! Consider:

1. **Bug fixes** - Your change may correct previous incorrect behavior
2. **Improvements** - Better atom placement, clearer bonds, etc.
3. **Floating point precision** - Acceptable minor coordinate differences
4. **Intentional changes** - New features may affect rendering

Review each HTML report to determine if changes are acceptable.

## Troubleshooting

### "npm install fails in baseline"
The baseline commit may have incompatible dependencies. Try a more recent baseline commit.

### "Build fails in baseline"
The old commit may not build with current Node.js version. Check Node.js compatibility.

### "All tests skipped"
Baseline and current code are identical (comparing HEAD to HEAD). Specify a different baseline.

### "Tests are slow"
- Use fast dataset (default) for development
- Only use `-all` for comprehensive pre-release testing
- Consider `-failearly` to exit at first difference

## Performance Notes

Test execution time depends on:
- Dataset size (fast vs full)
- Number of differences (SVG generation is slow)
- Machine speed (git clone, npm install, build)

Optimization tips:
- Use `-novisual` in CI/CD (JSON only)
- Use `-failearly` for quick checks
- Archive baseline builds to avoid repeated clones/installs

## Advanced Usage

### Direct Script Invocation
```bash
# Compare two arbitrary code paths
cd test
node regression-runner.js /path/to/old /path/to/new -all

# Generate single SMILES outputs
node generate-json.js "CCO" ethanol.json
node generate-svg.js "CCO" ethanol.svg
```

### Custom Dataset Testing
Edit datasets in test/*.js files to add custom SMILES for specific testing scenarios.

### CI/CD Integration
```bash
# Fast fail-early check (good for PR validation)
npm run test:regression HEAD~1 -failearly -novisual

# Exit code 0 = pass, 1 = differences found, 2 = error
```

## Files in This Directory

- `regression-runner.js` - Main test runner
- `generate-json.js` - JSON generator (molecular graph data)
- `generate-svg.js` - SVG generator (visual representation)
- `fastregression.js` - Fast test dataset (~113 SMILES)
- `chembl.js`, `drugbank.js`, etc. - Full test datasets
- `regression-test.sh` - Shell wrapper (called by npm)

## Contributing

When modifying the regression test infrastructure:
1. Test all flag combinations
2. Verify output file counts match expectations
3. Check both success and failure paths
4. Update this README if behavior changes
