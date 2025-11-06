#!/bin/bash

set -e

BASELINE_COMMIT="HEAD"
declare -a FLAG_ARGS=()
BISECT_MODE="NO"
BISECT_SMILES=""
ALL_MODE="NO"
FAIL_EARLY="NO"
NO_VISUAL="NO"
FILTER_PATTERN=""
FILTER_ENABLED="NO"
IMAGE_ENABLED="NO"
JSON_ENABLED="NO"

while [[ $# -gt 0 ]]; do
    case $1 in
        -all)
            ALL_MODE="YES"
            FLAG_ARGS+=("$1")
            shift
            ;;
        -failearly)
            FAIL_EARLY="YES"
            FLAG_ARGS+=("$1")
            shift
            ;;
        -novisual)
            NO_VISUAL="YES"
            FLAG_ARGS+=("$1")
            shift
            ;;
        -filter)
            shift
            if [[ $# -eq 0 ]]; then
                echo "ERROR: -filter flag requires a regex argument"
                exit 1
            fi
            FILTER_PATTERN="$1"
            FILTER_ENABLED="YES"
            shift
            ;;
        -image)
            IMAGE_ENABLED="YES"
            FLAG_ARGS+=("$1")
            shift
            ;;
        -json)
            JSON_ENABLED="YES"
            FLAG_ARGS+=("$1")
            shift
            ;;
        -bisect)
            BISECT_MODE="YES"
            shift
            if [[ $# -eq 0 ]]; then
                echo "ERROR: -bisect flag requires a SMILES string argument"
                exit 1
            fi
            BISECT_SMILES="$1"
            shift
            # Optional baseline commit
            if [[ $# -gt 0 ]] && [[ ! "$1" =~ ^- ]]; then
                BASELINE_COMMIT="$1"
                shift
            fi
            ;;
        *)
            BASELINE_COMMIT="$1"
            shift
            ;;
    esac
done

if [ "$FILTER_ENABLED" = "YES" ]; then
    FLAG_ARGS+=("-filter" "$FILTER_PATTERN")
fi

# Smart default: if no commit specified, choose based on working directory status
if [ "${BASELINE_COMMIT}" = "HEAD" ]; then
    if [ -z "$(git status --porcelain)" ]; then
        # Working directory is clean - compare against previous commit
        BASELINE_COMMIT="HEAD^"
        if [ "$BISECT_MODE" = "NO" ]; then
            echo "Working directory is clean - comparing against previous commit (HEAD^)"
        fi
    elif [ -n "$(git diff HEAD src/)" ]; then
        # Working directory has changes in src/ - compare against current commit
        if [ "$BISECT_MODE" = "NO" ]; then
            echo "Working directory has uncommitted changes in src/ - comparing against HEAD"
        fi
    else
        # Working directory has changes, but not in src/ - compare against previous commit
        BASELINE_COMMIT="HEAD^"
        if [ "$BISECT_MODE" = "NO" ]; then
            echo "Working directory has uncommitted changes (not in src/) - comparing against previous commit (HEAD^)"
        fi
    fi
fi

# Validate bisect mode requirements
if [ "$BISECT_MODE" = "YES" ]; then
    # Verify baseline is an ancestor of current HEAD
    if ! git merge-base --is-ancestor "${BASELINE_COMMIT}" HEAD 2>/dev/null; then
        echo -e "\033[1;31mERROR:\033[0m Baseline commit '${BASELINE_COMMIT}' is not an ancestor of HEAD"
        echo "Cannot bisect - commits must be in linear history"
        exit 3
    fi

    # Verify there are commits to search
    COMMIT_COUNT=$(git rev-list --count "${BASELINE_COMMIT}..HEAD")
    if [ "${COMMIT_COUNT}" -eq 0 ]; then
        echo -e "\033[1;31mERROR:\033[0m No commits between ${BASELINE_COMMIT} and HEAD"
        echo "Cannot bisect - no commits to search"
        exit 3
    fi
fi

CURRENT_DIR=$(pwd)
TEMP_DIR=$(mktemp -d)
BASELINE_DIR="${TEMP_DIR}/smiles-drawer-baseline"

# Determine test mode
# Get current commit info
CURRENT_COMMIT=$(git rev-parse --short HEAD)
if [ -z "$(git status --porcelain)" ]; then
    UNCOMMITTED_CHANGES=""
else
    UNCOMMITTED_CHANGES=" (+ uncommitted changes)"
fi

# Display header
echo -e "\033[1;36m================================================================================\033[0m"
if [ "$BISECT_MODE" = "YES" ]; then
    echo -e "\033[1;35mSMILES DRAWER BISECT: Finding First Matching Commit\033[0m"
else
    echo -e "\033[1;35mSMILES DRAWER REGRESSION TEST\033[0m"
fi
echo -e "\033[1;36m================================================================================\033[0m"

if [ "$BISECT_MODE" = "YES" ]; then
    echo -e "\033[93mSMILES:\033[0m ${BISECT_SMILES:0:60}$([ ${#BISECT_SMILES} -gt 60 ] && echo '...')"
    echo -e "\033[93mBASELINE COMMIT:\033[0m ${BASELINE_COMMIT}"
    echo -e "\033[93mCURRENT COMMIT:\033[0m ${CURRENT_COMMIT}${UNCOMMITTED_CHANGES}"
    echo -e "\033[93mIMAGES:\033[0m $([ "$IMAGE_ENABLED" = "YES" ] && echo "YES (-image)" || echo "NO")"
    echo -e "\033[93mJSON:\033[0m $([ "$JSON_ENABLED" = "YES" ] && echo "YES (-json)" || echo "NO")"
    if [ "$FILTER_ENABLED" = "YES" ]; then
        echo -e "\033[93mFILTER:\033[0m ${FILTER_PATTERN} (ignored in bisect mode)"
    fi
else
    echo -e "\033[93mMODE:\033[0m $([ "$ALL_MODE" = "YES" ] && echo "FULL (all datasets)" || echo "FAST (fastregression only)")"
    echo -e "\033[93mFAIL-EARLY:\033[0m $([ "$FAIL_EARLY" = "YES" ] && echo "YES (stop at first difference)" || echo "NO (collect all differences)")"
    echo -e "\033[93mVISUAL:\033[0m $([ "$NO_VISUAL" = "YES" ] && echo "NO (skip SVG generation)" || echo "YES (generate side-by-side comparisons)")"
    echo -e "\033[93mFILTER:\033[0m $([ "$FILTER_ENABLED" = "YES" ] && echo "${FILTER_PATTERN}" || echo "(none)")"
    echo -e "\033[93mIMAGES:\033[0m $([ "$IMAGE_ENABLED" = "YES" ] && echo "YES (-image)" || echo "NO")"
    echo -e "\033[93mJSON:\033[0m $([ "$JSON_ENABLED" = "YES" ] && echo "YES (-json)" || echo "NO")"
    echo -e "\033[93mBASELINE COMMIT:\033[0m ${BASELINE_COMMIT}"
    echo -e "\033[93mCURRENT COMMIT:\033[0m ${CURRENT_COMMIT}${UNCOMMITTED_CHANGES}"
    echo -e "\033[93mOUTPUT DIRECTORY:\033[0m ${CURRENT_DIR}/debug/output/regression/[timestamp]"
fi
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
    echo -e "\033[1;36m================================================================================\033[0m"
    echo -e "\033[1;31mINTERRUPTED:\033[0m Test cancelled by user"
    echo -e "\033[1;36m================================================================================\033[0m"
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
    echo -e "\033[1;31m✗\033[0m Baseline build failed!"
    echo -e "\033[1;36m================================================================================\033[0m"
    echo -e "\033[1;31mERROR:\033[0m Baseline build failed - cannot proceed with regression testing"
    echo -e "\033[1;36m================================================================================\033[0m"
    exit 1
fi
echo -e "\033[1;32m✓\033[0m Baseline build complete"
echo ""

echo -e "\033[93mStep 4:\033[0m Building current library..."
cd "${CURRENT_DIR}"
npx tsc > /dev/null 2>&1 || true  # Allow TS errors during migration
if ! npx gulp build > /dev/null 2>&1; then
    echo -e "\033[1;31m✗\033[0m Current build failed!"
    echo -e "\033[1;36m================================================================================\033[0m"
    echo -e "\033[1;31mERROR:\033[0m Current build failed - cannot proceed with regression testing"
    echo -e "\033[1;36m================================================================================\033[0m"
    exit 1
fi
echo -e "\033[1;32m✓\033[0m Current build complete"
echo ""

if [ "$BISECT_MODE" = "YES" ]; then
    # Binary search mode
    echo -e "\033[93mStep 5:\033[0m Running binary search..."
    echo ""

    # Get list of commits (oldest to newest)
    # Use bash 3-compatible array population instead of mapfile
    COMMITS=()
    while IFS= read -r commit; do
        COMMITS+=("$commit")
    done < <(git rev-list --reverse "${BASELINE_COMMIT}..HEAD")
    TOTAL_COMMITS=${#COMMITS[@]}

    echo -e "\033[93mCOMMIT RANGE:\033[0m ${TOTAL_COMMITS} commits to search"
    echo ""

    LEFT=0
    RIGHT=$((TOTAL_COMMITS - 1))

    while [ $((RIGHT - LEFT)) -gt 0 ]; do
        MID=$(( (LEFT + RIGHT) / 2 ))
        COMMIT=${COMMITS[$MID]}
        COMMIT_SHORT=$(git rev-parse --short "${COMMIT}")
        POSITION=$((MID + 1))

        echo -e "Testing commit \033[93m${POSITION}/${TOTAL_COMMITS}\033[0m: \033[1;36m${COMMIT_SHORT}\033[0m"

        # Checkout commit in baseline directory
        cd "${BASELINE_DIR}"
        git reset --hard > /dev/null 2>&1
        git clean -fd > /dev/null 2>&1
        if ! git checkout "${COMMIT}" > /dev/null 2>&1; then
            echo -e "  \033[1;31m✗\033[0m Git checkout failed, skipping"
            LEFT=$((MID + 1))
            continue
        fi

        # Build the commit
        npx tsc > /dev/null 2>&1 || true
        if ! npx gulp build > /dev/null 2>&1; then
            echo -e "  \033[1;31m✗\033[0m Build failed, skipping"
            LEFT=$((MID + 1))
            continue
        fi

        # Test with single SMILES
        cd "${CURRENT_DIR}/debug"
        if node regression-runner.js "${BASELINE_DIR}" "${CURRENT_DIR}" "${FLAG_ARGS[@]}" -bisect "${BISECT_SMILES}" > /dev/null 2>&1; then
            echo -e "  \033[1;32m✓\033[0m Output matches current"
            RIGHT=$MID
        else
            echo -e "  \033[1;31m✗\033[0m Output differs from current"
            LEFT=$((MID + 1))
        fi

        echo ""
    done

    # Report the result
    if [ $RIGHT -lt $TOTAL_COMMITS ]; then
        FOUND_COMMIT=${COMMITS[$RIGHT]}
        FOUND_COMMIT_SHORT=$(git rev-parse --short "${FOUND_COMMIT}")
        FOUND_POSITION=$((RIGHT + 1))

        echo -e "\033[1;36m================================================================================\033[0m"
        echo -e "\033[1;32mFOUND:\033[0m First commit matching current behavior"
        echo -e "\033[1;36m================================================================================\033[0m"
        echo -e "\033[93mCommit:\033[0m ${FOUND_COMMIT_SHORT} (position ${FOUND_POSITION}/${TOTAL_COMMITS})"
        echo ""
        git show --stat --pretty=format:"%C(yellow)Date:%C(reset) %ad%nAuthor: %an%n%n%s%n%n%b" --date=format:'%Y-%m-%d %H:%M:%S' "${FOUND_COMMIT}"
        echo ""
        echo -e "\033[1;36m================================================================================\033[0m"
        echo ""

        # Generate comparison report for the boundary
        if [ $RIGHT -gt 0 ]; then
            PREV_COMMIT=${COMMITS[$((RIGHT - 1))]}
            PREV_COMMIT_SHORT=$(git rev-parse --short "${PREV_COMMIT}")

            echo -e "\033[93mStep 6:\033[0m Generating comparison report..."
            echo -e "Comparing last differing commit (\033[1;36m${PREV_COMMIT_SHORT}\033[0m) vs current"
            echo ""

            # Checkout and build the previous commit
            cd "${BASELINE_DIR}"
            git reset --hard > /dev/null 2>&1
            git clean -fd > /dev/null 2>&1
            if git checkout "${PREV_COMMIT}" > /dev/null 2>&1; then
                npx tsc > /dev/null 2>&1 || true
                if npx gulp build > /dev/null 2>&1; then
                    # Generate comparison report
                    cd "${CURRENT_DIR}/debug"
                    BISECT_OUTPUT=$(node regression-runner.js "${BASELINE_DIR}" "${CURRENT_DIR}" "${FLAG_ARGS[@]}" -bisect "${BISECT_SMILES}" 2>/dev/null)
                    if [ $? -eq 0 ] || [ $? -eq 1 ]; then
                        echo -e "\033[1;32m✓\033[0m Comparison files saved:"
                        echo -e "  ${BISECT_OUTPUT}/bisect.html"
                        echo -e "  ${BISECT_OUTPUT}/bisect.json"
                    else
                        echo -e "\033[93mWARNING:\033[0m Failed to generate comparison report"
                    fi
                else
                    echo -e "\033[93mWARNING:\033[0m Could not build previous commit for comparison"
                fi
            else
                echo -e "\033[93mWARNING:\033[0m Could not checkout previous commit for comparison"
            fi
        else
            echo -e "\033[93mNOTE:\033[0m No previous commit to compare (boundary is at first commit)"
        fi

        echo -e "\033[1;36m================================================================================\033[0m"
        exit 0
    else
        echo -e "\033[1;36m================================================================================\033[0m"
        echo -e "\033[93mNOT FOUND:\033[0m No commit in range matches current behavior"
        echo -e "\033[1;36m================================================================================\033[0m"
        echo "All commits in the range differ from current output."
        echo "The change may have been introduced before ${BASELINE_COMMIT}"
        exit 1
    fi
else
    # Regular regression test mode
    echo -e "\033[93mStep 5:\033[0m Running regression tests..."
    if [ ${#FLAG_ARGS[@]} -eq 0 ]; then
        echo "Flags: (none)"
    else
        printf 'Flags:'
        for arg in "${FLAG_ARGS[@]}"; do
            printf ' %q' "$arg"
        done
        printf '\n'
    fi

    cd "${CURRENT_DIR}/debug"
    node regression-runner.js "${BASELINE_DIR}" "${CURRENT_DIR}" "${FLAG_ARGS[@]}"

    REGRESSION_EXIT_CODE=$?

    if [ ${REGRESSION_EXIT_CODE} -eq 0 ]; then
        echo -e "\033[1;36m================================================================================\033[0m"
        echo -e "\033[1;32mSUCCESS:\033[0m No differences detected!"
        echo -e "\033[1;36m================================================================================\033[0m"
        exit 0
    elif [ ${REGRESSION_EXIT_CODE} -eq 1 ]; then
        echo -e "\033[1;36m================================================================================\033[0m"
        echo -e "\033[93mDIFFERENCES FOUND:\033[0m Regression reports generated"
        echo "Check debug/output/regression/ for details"
        echo -e "\033[1;36m================================================================================\033[0m"
        exit 1
    else
        echo -e "\033[1;36m================================================================================\033[0m"
        echo -e "\033[1;31mERROR:\033[0m Test infrastructure failure (exit code ${REGRESSION_EXIT_CODE})"
        echo -e "\033[1;36m================================================================================\033[0m"
        exit 2
    fi
fi
