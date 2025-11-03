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

# Smart default: if no commit specified, choose based on working directory status
if [ "${BASELINE_COMMIT}" = "HEAD" ]; then
    if [ -z "$(git status --porcelain)" ]; then
        # Working directory is clean - compare against previous commit
        BASELINE_COMMIT="HEAD^"
        echo "Working directory is clean - comparing against previous commit (HEAD^)"
    else
        # Working directory has changes - compare against current commit
        echo "Working directory has uncommitted changes - comparing against HEAD"
    fi
fi

echo "================================================================================"
echo "SMILES DRAWER REGRESSION TEST"
echo "================================================================================"

CURRENT_DIR=$(pwd)
TEMP_DIR=$(mktemp -d)
BASELINE_DIR="${TEMP_DIR}/smiles-drawer-baseline"

# Cleanup function to remove temporary directory
cleanup() {
    if [ -d "${TEMP_DIR}" ]; then
        echo ""
        echo "Cleaning up temporary directory..."
        rm -rf "${TEMP_DIR}"
        echo "✓ Cleanup complete"
    fi
}

# Handle interrupt (Ctrl-C) and termination signals
cleanup_and_exit() {
    cleanup
    echo ""
    echo "================================================================================"
    echo "INTERRUPTED: Test cancelled by user"
    echo "================================================================================"
    exit 130
}

# Set up traps:
# - EXIT: cleanup only (preserve exit code)
# - INT/TERM: cleanup and force exit
trap cleanup EXIT
trap cleanup_and_exit INT TERM

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
if ! npx gulp build; then
    echo "✗ Baseline build failed!"
    echo "================================================================================"
    echo "ERROR: Baseline build failed - cannot proceed with regression testing"
    echo "================================================================================"
    exit 1
fi
echo "✓ Baseline build complete"
echo ""

echo "Step 4: Building current library..."
cd "${CURRENT_DIR}"
npx tsc || true  # Allow TS errors during migration
if ! npx gulp build; then
    echo "✗ Current build failed!"
    echo "================================================================================"
    echo "ERROR: Current build failed - cannot proceed with regression testing"
    echo "================================================================================"
    exit 1
fi
echo "✓ Current build complete"
echo ""

echo "Step 5: Running regression tests..."
echo "Flags:${FLAGS:-" (none)"}"
echo ""

cd "${CURRENT_DIR}/test"
node regression-runner.js "${BASELINE_DIR}" "${CURRENT_DIR}" ${FLAGS}

REGRESSION_EXIT_CODE=$?

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
