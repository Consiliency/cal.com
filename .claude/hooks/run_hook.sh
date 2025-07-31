#!/bin/bash
# Wrapper script to run hooks from the repository root
# Usage: ./run_hook.sh <hook_script> [args...]

# Get the repository root
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)

if [ -z "$REPO_ROOT" ]; then
    echo "Error: Not in a git repository or git not available" >&2
    exit 1
fi

# Construct the full path to the hook script
HOOK_SCRIPT="$REPO_ROOT/.claude/hooks/$1"

# Check if the hook script exists
if [ ! -f "$HOOK_SCRIPT" ]; then
    echo "Error: Hook script not found: $HOOK_SCRIPT" >&2
    exit 1
fi

# Shift the first argument (script name) and pass the rest to uv
shift

# Run the hook script with uv run --script
exec uv run --script "$HOOK_SCRIPT" "$@" 