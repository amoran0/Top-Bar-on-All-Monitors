#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_DIR=$(dirname -- "$SCRIPT_DIR")
OUTPUT_DIR="$SOURCE_DIR/dist"

if ! command -v gnome-extensions >/dev/null 2>&1; then
    printf '%s\n' "Error: gnome-extensions is not installed or not in PATH." >&2
    exit 1
fi

mkdir -p "$OUTPUT_DIR"
gnome-extensions pack --force \
    --out-dir "$OUTPUT_DIR" \
    --schema="$SOURCE_DIR/schemas/org.gnome.shell.extensions.topbarallmonitors.gschema.xml" \
    --extra-source="$SOURCE_DIR/mirroredIndicatorButton.js" \
    "$SOURCE_DIR"

printf '\nPackage created in %s\n' "$OUTPUT_DIR"