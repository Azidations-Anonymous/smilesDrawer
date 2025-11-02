# Visual Regression Testing

This directory contains tools for visual regression testing of SMILES Drawer.

## Overview

Visual regression testing allows you to:
- Compare SVG output between two versions of the code
- Continue testing even when differences are found (no early bailout)
- Generate individual HTML files for each difference showing side-by-side comparisons
- Manually inspect whether changes are improvements or regressions

## Scripts

### `generate-svg.js`
Generates SVG representation of a SMILES string.

```bash
node test/generate-svg.js "<SMILES>" [output-file.svg]
```

Example:
```bash
node test/generate-svg.js "CCO" /tmp/ethanol.svg
```

### `visual-regression-runner.js`
Runs visual regression tests comparing two code versions.

```bash
node test/visual-regression-runner.js <old-code-path> <new-code-path> [--full]
```

- Compares JSON graph data first (fast check)
- Only generates SVG when differences are detected
- Continues testing all SMILES (no early exit)
- Generates individual HTML files in `visual-regression-results/` folder if differences found

### Running via npm

```bash
# Test against current HEAD (fast mode - ~113 SMILES)
npm run test:visual

# Test against specific commit/branch
npm run test:visual <commit-hash>

# Test all datasets (thousands of SMILES)
npm run test:visual -- --full
```

## Generated Reports

When differences are found, individual HTML files are generated in the `visual-regression-results/` folder.

Each HTML file:
- Named with a simple number: `1.html`, `2.html`, `3.html`, etc.
- Shows the SMILES string at the top
- Displays side-by-side SVG comparisons (Baseline vs Current)
- Includes JSON byte size comparison
- Is created immediately when the difference is detected (while tests are running)

## Report Features

- **Simple layout**: SMILES at top, SVGs below
- **Responsive design**: Works on desktop and mobile
- **Individual files**: Easy to open and compare specific failures
- **SVG rendering**: Direct inline SVG for immediate visual comparison
- **Real-time generation**: Files created as differences are found

## Use Cases

### 1. TypeScript Migration
Verify that converting JavaScript to TypeScript doesn't change rendering:

```bash
# Before starting migration
git stash  # save your TS work
git checkout master
npm install && npx gulp

# After migration
git checkout chore/ts-migration
npm run test:visual master
```

### 2. Bug Fix Verification
Check if a bug fix changes other molecules:

```bash
npm run test:visual <commit-before-fix>
```

### 3. Feature Development
Ensure new features don't break existing rendering:

```bash
git stash
npm run test:visual HEAD
git stash pop
```

### 4. Reviewing Improvements
Sometimes "regressions" are actually improvements (better atom placement, clearer bonds, etc.). The visual report helps you decide.

## Exit Codes

- `0`: No differences found
- `1`: Differences found (report generated)
- `2`: Infrastructure error (setup/build failure)

## Performance Notes

- Fast mode (~113 SMILES): ~2-3 minutes
- Full mode (thousands of SMILES): 30+ minutes
- SVG generation only happens for molecules with differences
- Most time is spent in: git clone, npm install, build

## Tips

1. **Start with fast mode** to quickly identify if there are any differences
2. **Use full mode** before merging to production
3. **Open HTML files in a browser** for best experience
4. **Share reports** by committing the folder to a branch for team review
5. **Archive reports** by moving the folder with timestamps before running new tests
6. **Clean up before re-running**: Remove or archive old `visual-regression-results/` folder

## Example Workflow

```bash
# 1. Make your changes
vim src/SomeFile.ts

# 2. Build
npx gulp

# 3. Run visual regression (fast)
npm run test:visual

# 4. Review reports if differences found
open visual-regression-results/*.html

# 5. If changes look good, run full test
npm run test:visual -- --full

# 6. Archive reports for reference
mv visual-regression-results reports/visual-$(date +%Y%m%d-%H%M%S)
```

## Troubleshooting

**"npm install fails in baseline"**
- The baseline commit may have different dependencies
- Check that baseline is a valid commit
- Try using a more recent baseline commit

**"SVG generation times out"**
- Some complex molecules take longer to render
- The runner has no timeout currently (JSDOM is synchronous)
- Consider adding timeout handling if needed

**"Report shows false positives"**
- Could be floating point precision differences
- Could be non-deterministic rendering
- Check if differences are truly visual or just numerical noise

## Future Enhancements

Possible improvements:
- [ ] Add image diff highlighting (pixel-by-pixel comparison)
- [ ] Add ability to approve/reject differences
- [ ] Generate diff statistics (% pixels different)
- [ ] Support for different color schemes/themes
- [ ] Parallel processing for faster execution
- [ ] Screenshot comparison (render to PNG)
