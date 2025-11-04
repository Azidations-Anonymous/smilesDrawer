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

CURRENT_DIR=$(pwd)
TEMP_DIR=$(mktemp -d)
BASELINE_DIR="${TEMP_DIR}/smiles-drawer-baseline"

# Determine test mode
ALL_MODE="NO"
FAIL_EARLY="NO"
NO_VISUAL="NO"
if [[ " ${FLAGS} " =~ " -all " ]]; then
    ALL_MODE="YES"
fi
if [[ " ${FLAGS} " =~ " -failearly " ]]; then
    FAIL_EARLY="YES"
fi
if [[ " ${FLAGS} " =~ " -novisual " ]]; then
    NO_VISUAL="YES"
fi

# Get current commit info
CURRENT_COMMIT=$(git rev-parse --short HEAD)
if [ -z "$(git status --porcelain)" ]; then
    UNCOMMITTED_CHANGES=""
else
    UNCOMMITTED_CHANGES=" (+ uncommitted changes)"
fi

# Display header
echo -e "\033[1;36m================================================================================\033[0m"
echo -e "\033[1;35mSMILES DRAWER REGRESSION TEST\033[0m"
echo -e "\033[1;36m================================================================================\033[0m"
echo -e "\033[93mMODE:\033[0m $([ "$ALL_MODE" = "YES" ] && echo "FULL (all datasets)" || echo "FAST (fastregression only)")"
echo -e "\033[93mFAIL-EARLY:\033[0m $([ "$FAIL_EARLY" = "YES" ] && echo "YES (stop at first difference)" || echo "NO (collect all differences)")"
echo -e "\033[93mVISUAL:\033[0m $([ "$NO_VISUAL" = "YES" ] && echo "NO (skip SVG generation)" || echo "YES (generate side-by-side comparisons)")"
echo -e "\033[93mBASELINE COMMIT:\033[0m ${BASELINE_COMMIT}"
echo -e "\033[93mCURRENT COMMIT:\033[0m ${CURRENT_COMMIT}${UNCOMMITTED_CHANGES}"
echo -e "\033[93mOUTPUT DIRECTORY:\033[0m ${CURRENT_DIR}/test/regression-results"
echo ""

# Cleanup function to remove temporary directory
cleanup() {
    if [ -d "${TEMP_DIR}" ]; then
        echo ""
        echo "Cleaning up temporary directory..."
        rm -rf "${TEMP_DIR}"
        echo -e "\033[1;32m✓\033[0m Cleanup complete"
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

echo -e "\033[93mStep 1:\033[0m Cloning current repository to temporary location..."
git clone "${CURRENT_DIR}" "${BASELINE_DIR}"
echo -e "\033[1;32m✓\033[0m Clone complete"
echo ""

echo -e "\033[93mStep 1b:\033[0m Checking out baseline commit..."
cd "${BASELINE_DIR}"
git config advice.detachedHead false
git checkout "${BASELINE_COMMIT}" &> /dev/null
echo -e "\033[1;32m✓\033[0m Checked out ${BASELINE_COMMIT}"
cd "${CURRENT_DIR}"
echo ""

echo -e "\033[93mStep 2:\033[0m Installing dependencies in baseline..."
cd "${BASELINE_DIR}"
npm install --silent
echo -e "\033[1;32m✓\033[0m Dependencies installed"
echo ""

echo -e "\033[93mStep 3:\033[0m Building baseline library..."
npx tsc > /dev/null 2>&1 || true  # Allow TS errors during migration
if ! npx gulp build > /dev/null 2>&1; then
    echo "✗ Baseline build failed!"
    echo "================================================================================"
    echo "ERROR: Baseline build failed - cannot proceed with regression testing"
    echo "================================================================================"
    exit 1
fi
echo -e "\033[1;32m✓\033[0m Baseline build complete"
echo ""

echo -e "\033[93mStep 4:\033[0m Building current library..."
cd "${CURRENT_DIR}"
npx tsc > /dev/null 2>&1 || true  # Allow TS errors during migration
if ! npx gulp build > /dev/null 2>&1; then
    echo "✗ Current build failed!"
    echo "================================================================================"
    echo "ERROR: Current build failed - cannot proceed with regression testing"
    echo "================================================================================"
    exit 1
fi
echo -e "\033[1;32m✓\033[0m Current build complete"
echo ""

echo -e "\033[93mStep 5:\033[0m Running regression tests..."
echo "Flags:${FLAGS:-" (none)"}"

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
