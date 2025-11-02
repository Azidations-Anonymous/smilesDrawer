#!/bin/bash

set -e

BASELINE_COMMIT="HEAD"
FLAGS=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -all|-failearly|-novisual)
            FLAGS="${FLAGS} $1"
            shift
            ;;
        *)
            BASELINE_COMMIT="$1"
            shift
            ;;
    esac
done

echo "================================================================================"
echo "SMILES DRAWER REGRESSION TEST"
echo "================================================================================"

CURRENT_DIR=$(pwd)
TEMP_DIR=$(mktemp -d)
BASELINE_DIR="${TEMP_DIR}/smiles-drawer-baseline"

echo "Current directory: ${CURRENT_DIR}"
echo "Temporary directory: ${TEMP_DIR}"
echo "Baseline clone directory: ${BASELINE_DIR}"
echo "Baseline commit/branch: ${BASELINE_COMMIT}"
echo ""

echo "Step 1: Cloning current repository to temporary location..."
git clone "${CURRENT_DIR}" "${BASELINE_DIR}"
echo "✓ Clone complete"
echo ""

echo "Step 1b: Checking out baseline commit..."
cd "${BASELINE_DIR}"
git checkout "${BASELINE_COMMIT}"
echo "✓ Checked out ${BASELINE_COMMIT}"
cd "${CURRENT_DIR}"
echo ""

echo "Step 2: Installing dependencies in baseline..."
cd "${BASELINE_DIR}"
npm install --silent
echo "✓ Dependencies installed"
echo ""

echo "Step 3: Building baseline library..."
npx tsc || true  # Allow TS errors during migration
npx gulp build
echo "✓ Baseline build complete"
echo ""

echo "Step 4: Building current library..."
cd "${CURRENT_DIR}"
npx tsc || true  # Allow TS errors during migration
npx gulp build
echo "✓ Current build complete"
echo ""

echo "Step 5: Running regression tests..."
echo "Flags:${FLAGS:-" (none)"}"
echo ""

cd "${CURRENT_DIR}/test"
node regression-runner.js "${BASELINE_DIR}" "${CURRENT_DIR}" ${FLAGS}

REGRESSION_EXIT_CODE=$?

echo ""
echo "Step 6: Cleaning up temporary directory..."
rm -rf "${TEMP_DIR}"
echo "✓ Cleanup complete"
echo ""

if [ ${REGRESSION_EXIT_CODE} -eq 0 ]; then
    echo "================================================================================"
    echo "SUCCESS: No differences detected!"
    echo "================================================================================"
    exit 0
elif [ ${REGRESSION_EXIT_CODE} -eq 1 ]; then
    echo "================================================================================"
    echo "DIFFERENCES FOUND: Regression reports generated"
    echo "Check regression-results/ for details"
    echo "================================================================================"
    exit 1
else
    echo "================================================================================"
    echo "ERROR: Test infrastructure failure (exit code ${REGRESSION_EXIT_CODE})"
    echo "================================================================================"
    exit 2
fi
