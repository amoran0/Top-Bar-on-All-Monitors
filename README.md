# Top Bar on All Monitors

A GNOME Shell 51 extension that adds an interactive top bar to every secondary monitor. GNOME's original primary-monitor panel stays in place.

## Features

- Mirrors indicators registered on the primary panel and keeps their left, center, or right placement.
- Opens indicator menus from the secondary panel. Menu and toggle state are shared with the primary panel.
- Mirrors Quick Settings as a whole, including tiles added by other extensions.
- Lets you choose which indicators appear on secondary monitors in the extension preferences.
- Integrates with Blur my Shell and Volume Scroller.

Indicators are mirrors, not independent instances of their extensions. Extensions that draw directly on the panel or rely on private APIs may need a dedicated integration. GNOME Shell and many extensions do not provide stable APIs for this use.

## Download

For the easiest installation, download the `topbarallmonitors@amoran0.shell-extension.zip` asset from the project's **GitHub Releases** page.

Alternatively, download the source archive from GitHub using **Code > Download ZIP**, then extract it. You can also clone the repository:

```sh
git clone https://github.com/OWNER/topbar-gnome.git
cd topbar-gnome
```

Replace `OWNER` with the GitHub account that hosts the project.

## Install a Release

Requirements: GNOME Shell 51 and the `gnome-extensions` command. In a terminal, install the downloaded bundle and enable the extension:

```sh
gnome-extensions install --force ~/Downloads/topbarallmonitors@amoran0.shell-extension.zip
gnome-extensions enable topbarallmonitors@amoran0
```

If the extension does not appear on Wayland, log out and back in.

## Install from Source

Requirements: GNOME Shell 51, `gnome-extensions`, and `glib-compile-schemas`. Open a terminal in the extracted source folder and run:

```sh
sh scripts/install.sh
```

The installer copies the extension to `~/.local/share/gnome-shell/extensions/topbarallmonitors@amoran0`, compiles its GSettings schema, and enables it. It does not require `sudo`.

## Preferences

Open the extension preferences with:

```sh
gnome-extensions prefs topbarallmonitors@amoran0
```

The switches affect secondary monitors only; they do not hide indicators on the primary panel. The indicator list is discovered from the active extensions and updates as indicators are added or removed.

## Update

Install a newer Release over the current version:

```sh
gnome-extensions disable topbarallmonitors@amoran0
gnome-extensions install --force ~/Downloads/topbarallmonitors@amoran0.shell-extension.zip
gnome-extensions enable topbarallmonitors@amoran0
```

If you installed from source, get the updated source files and run `sh scripts/install.sh` again.

## Uninstall

```sh
gnome-extensions disable topbarallmonitors@amoran0
rm -rf ~/.local/share/gnome-shell/extensions/topbarallmonitors@amoran0
```

## Compatibility

The extension targets GNOME Shell 51. It uses internal Shell classes and private integration points in some extensions, so future Shell or extension releases may require updates. Keep a way to disable the extension if you encounter a Shell error.