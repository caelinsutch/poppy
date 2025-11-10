#!/usr/bin/env bash
set -e

# Run vitest with any passed arguments
exec vitest "$@"
