#!/bin/sh
set -eu

UUID="topbarallmonitors@amoran0"
EXTENSION_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_DIR=$(dirname -- "$SCRIPT_DIR")

if ! command -v gnome-extensions >/dev/null 2>&1; then
    printf '%s\n' "Error: gnome-extensions is not installed or not in PATH." >&2
    exit 1
fi

if ! command -v glib-compile-schemas >/dev/null 2>&1; then
    printf '%s\n' "Error: glib-compile-schemas is not installed or not in PATH." >&2
    exit 1
fi

gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
mkdir -p "$EXTENSION_DIR/schemas"

install -m 644 "$SOURCE_DIR/extension.js" "$EXTENSION_DIR/extension.js"
install -m 644 "$SOURCE_DIR/mirroredIndicatorButton.js" "$EXTENSION_DIR/mirroredIndicatorButton.js"
install -m 644 "$SOURCE_DIR/prefs.js" "$EXTENSION_DIR/prefs.js"
install -m 644 "$SOURCE_DIR/metadata.json" "$EXTENSION_DIR/metadata.json"
install -m 644 "$SOURCE_DIR/schemas/org.gnome.shell.extensions.topbarallmonitors.gschema.xml" \
    "$EXTENSION_DIR/schemas/org.gnome.shell.extensions.topbarallmonitors.gschema.xml"

glib-compile-schemas "$EXTENSION_DIR/schemas"
gnome-extensions enable "$UUID"

printf '\nInstalled and enabled %s\n' "$UUID"
printf 'Preferences: gnome-extensions prefs %s\n' "$UUID"