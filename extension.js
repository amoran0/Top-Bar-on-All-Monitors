import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Panel from 'resource:///org/gnome/shell/ui/panel.js';
import {MirroredIndicatorButton} from './mirroredIndicatorButton.js';

const EXCLUDED_MIRROR_ROLES = new Set([
    'a11y', 'backgroundApps', 'dwellClick', 'remoteAccess',
    'screenRecording', 'screenSharing', 'unsafeModeIndicator',
]);
const VOLUME_SCROLLER_UUID = 'volume_scroller@francislavoie.github.io';

export default class TopBarAllMonitorsExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._panels = new Map();
        this._lastPanelHeight = 0;
        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed', () => this._syncPanels());
        this._panelAllocationId = Main.panel.connect(
            'notify::allocation', () => this._queuePanelGeometryUpdate());
        this._panelVisibilityId = Main.panel.connect(
            'notify::visible', () => this._queuePanelVisibilityUpdate());
        this._fullscreenChangedId = global.display.connect(
            'in-fullscreen-changed', () => this._queuePanelVisibilityUpdate());
        this._extensionStateChangedId = Main.extensionManager.connect(
            'extension-state-changed', () => {
                this._queueMirrorRefresh(150);
                this._queueMirrorRefresh(700);
                this._queueMirrorRefresh(1600);
            });
        this._sessionUpdatedId = Main.sessionMode.connect(
            'updated', () => this._queueMirrorRefresh(100));
        this._settingsChangedId = this._settings.connect(
            'changed::hidden-indicators', () => this._queueMirrorRefresh(0));
        this._mirrorRefreshIds = new Set();
        this._primaryPanelBoxSignals = [];
        this._panelUpdateId = 0;

        for (const box of [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox]) {
            if (!box)
                continue;

            for (const signal of ['child-added', 'child-removed']) {
                const id = box.connect(signal, () => this._queueMirrorRefresh(100));
                this._primaryPanelBoxSignals.push({box, id});
            }
        }

        this._syncPanels();
    }

    disable() {
        Main.layoutManager.disconnect(this._monitorsChangedId);
        Main.panel.disconnect(this._panelAllocationId);
        Main.panel.disconnect(this._panelVisibilityId);
        global.display.disconnect(this._fullscreenChangedId);
        Main.extensionManager.disconnect(this._extensionStateChangedId);
        Main.sessionMode.disconnect(this._sessionUpdatedId);
        this._settings.disconnect(this._settingsChangedId);

        if (this._panelUpdateId) {
            GLib.source_remove(this._panelUpdateId);
            this._panelUpdateId = 0;
        }
        if (this._panelVisibilityUpdateId) {
            GLib.source_remove(this._panelVisibilityUpdateId);
            this._panelVisibilityUpdateId = 0;
        }

        for (const {box, id} of this._primaryPanelBoxSignals)
            box.disconnect(id);
        this._primaryPanelBoxSignals = [];

        for (const id of this._mirrorRefreshIds)
            GLib.source_remove(id);
        this._mirrorRefreshIds.clear();

        for (const panelParts of this._panels.values())
            this._destroyPanel(panelParts);

        this._panels.clear();
        this._settings.set_string('indicator-catalog', '[]');
        this._settings = null;
    }

    _syncPanels() {
        const primaryIndex = Main.layoutManager.primaryIndex;
        const secondaryIndices = new Set(
            Main.layoutManager.monitors
                .map((_monitor, index) => index)
                .filter(index => index !== primaryIndex));

        for (const [index, panelParts] of this._panels) {
            if (secondaryIndices.has(index))
                continue;

            this._destroyPanel(panelParts);
            this._panels.delete(index);
        }

        for (const index of secondaryIndices) {
            if (this._panels.has(index))
                continue;

            const panelBox = new St.BoxLayout({
                name: 'panelBox',
                orientation: Clutter.Orientation.VERTICAL,
            });
            const panel = new Panel.Panel();
            Main.layoutManager.panelBox.remove_child(panel);
            panelBox.add_child(panel);

            Main.layoutManager.addChrome(panelBox, {
                affectsStruts: true,
                trackFullscreen: true,
            });
            this._panels.set(index, {
                panelBox,
                panel,
                mirrors: new Map(),
                nativeVisibilitySources: new Map(),
                volumeScroller: null,
            });
        }

        this._updatePanels();
        this._queueMirrorRefresh(300);
    }

    _updatePanels() {
        const monitors = Main.layoutManager.monitors;
        const panelHeight = this._getStablePanelHeight();

        for (const [index, panelParts] of this._panels) {
            const monitor = monitors[index];
            if (!monitor)
                continue;

            panelParts.panelBox.set_position(monitor.x, monitor.y);
            if (panelHeight > 0) {
                panelParts.panelBox.set_size(monitor.width, panelHeight);
                panelParts.panel.set_size(monitor.width, panelHeight);
            } else {
                panelParts.panelBox.set_width(monitor.width);
                panelParts.panel.set_width(monitor.width);
            }
        }

        this._updatePanelVisibility();
    }

    _getStablePanelHeight() {
        const allocatedHeight = Main.panel.height;
        if (Number.isFinite(allocatedHeight) && allocatedHeight > 0)
            this._lastPanelHeight = allocatedHeight;

        if (this._lastPanelHeight > 0)
            return this._lastPanelHeight;

        const [, naturalHeight] = Main.panel.get_preferred_height(-1);
        return Number.isFinite(naturalHeight) ? Math.max(0, naturalHeight) : 0;
    }

    _updatePanelVisibility() {
        const monitors = Main.layoutManager.monitors;
        for (const [index, panelParts] of this._panels) {
            const monitor = monitors[index];
            if (!monitor)
                continue;

            const fullscreenOnMonitor = global.window_group.visible && monitor.inFullscreen;
            panelParts.panelBox.visible = Main.panel.visible && !fullscreenOnMonitor;
        }
    }

    _queuePanelGeometryUpdate() {
        if (this._panelUpdateId)
            return;

        this._panelUpdateId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._panelUpdateId = 0;
            this._updatePanels();
            return GLib.SOURCE_REMOVE;
        });
    }

    _queuePanelVisibilityUpdate() {
        if (this._panelVisibilityUpdateId)
            return;

        this._panelVisibilityUpdateId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._panelVisibilityUpdateId = 0;
            this._updatePanelVisibility();
            return GLib.SOURCE_REMOVE;
        });
    }

    _queueMirrorRefresh(delay) {
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            this._mirrorRefreshIds.delete(id);
            for (const panelParts of this._panels.values())
                this._syncMirroredIndicators(panelParts);
            return GLib.SOURCE_REMOVE;
        });
        this._mirrorRefreshIds.add(id);
    }

    _syncMirroredIndicators(panelParts) {
        const sourceStatusArea = Main.panel.statusArea;
        const desiredRoles = new Set();
        const hiddenRoles = new Set(this._settings.get_strv('hidden-indicators'));

        this._registerPanelWithBlurMyShell(panelParts.panel);
        this._publishIndicatorCatalog(sourceStatusArea);

        for (const [role, sourceIndicator] of Object.entries(sourceStatusArea)) {
            if (!sourceIndicator || EXCLUDED_MIRROR_ROLES.has(role))
                continue;

            if (role === 'quickSettings') {
                if (hiddenRoles.has(role)) {
                    this._hideNativeIndicator(panelParts, role);
                    continue;
                }
                desiredRoles.add(role);
                this._syncQuickSettingsMirror(panelParts, sourceIndicator);
                continue;
            }

            const panelIndicator = panelParts.panel.statusArea[role];
            if (panelIndicator) {
                this._syncNativeIndicatorVisibility(
                    panelParts, role, sourceIndicator, panelIndicator, hiddenRoles.has(role));
                if (!hiddenRoles.has(role))
                    desiredRoles.add(role);
                continue;
            }

            if (hiddenRoles.has(role))
                continue;

            let mirror = panelParts.mirrors.get(role);
            if (mirror && mirror._sourceIndicator !== sourceIndicator) {
                this._removeMirror(panelParts, role);
                mirror = null;
            }

            const placement = this._findIndicatorPlacement(sourceIndicator);
            if (!placement)
                continue;

            desiredRoles.add(role);
            if (!mirror) {
                mirror = new MirroredIndicatorButton(panelParts.panel, role, sourceIndicator);
                mirror.connect('destroy', () => {
                    if (panelParts.mirrors.get(role) === mirror)
                        panelParts.mirrors.delete(role);
                });
                panelParts.panel.addToStatusArea(role, mirror, placement.position, placement.box);
                panelParts.mirrors.set(role, mirror);
            } else {
                this._placeMirror(panelParts.panel, mirror, placement);
            }
        }

        for (const role of panelParts.mirrors.keys()) {
            if (!desiredRoles.has(role))
                this._removeMirror(panelParts, role);
        }

        this._syncVolumeScroller(panelParts);
    }

    _syncQuickSettingsMirror(panelParts, sourceIndicator) {
        const role = 'quickSettings';
        const currentMirror = panelParts.mirrors.get(role);
        if (currentMirror?._sourceIndicator === sourceIndicator) {
            const placement = this._findIndicatorPlacement(sourceIndicator);
            if (placement)
                this._placeMirror(panelParts.panel, currentMirror, placement);
            return;
        }

        if (currentMirror)
            this._removeMirror(panelParts, role);

        const originalQuickSettings = panelParts.panel.statusArea[role];
        if (originalQuickSettings) {
            originalQuickSettings.container?.get_parent()?.remove_child(originalQuickSettings.container);
            originalQuickSettings.destroy();
        }

        const placement = this._findIndicatorPlacement(sourceIndicator) ?? {
            box: 'right',
            position: panelParts.panel._rightBox.get_n_children(),
        };
        const mirror = new MirroredIndicatorButton(panelParts.panel, role, sourceIndicator);
        mirror.connect('destroy', () => {
            if (panelParts.mirrors.get(role) === mirror)
                panelParts.mirrors.delete(role);
        });
        panelParts.panel.addToStatusArea(role, mirror, placement.position, placement.box);
        panelParts.mirrors.set(role, mirror);
    }

    _syncNativeIndicatorVisibility(panelParts, role, source, target, hidden) {
        const previousSource = panelParts.nativeVisibilitySources.get(role);
        if (previousSource !== source) {
            previousSource?.disconnectObject(panelParts.panel);
            const sync = () => {
                const sourceContainer = source.container ?? source;
                const targetContainer = target.container ?? target;
                const isHidden = this._settings.get_strv('hidden-indicators').includes(role);
                targetContainer.visible = !isHidden && source.visible && sourceContainer.visible;
            };
            source.connectObject('notify::visible', sync, panelParts.panel);
            source.container?.connectObject('notify::visible', sync, panelParts.panel);
            panelParts.nativeVisibilitySources.set(role, source);
        }

        const sourceContainer = source.container ?? source;
        const targetContainer = target.container ?? target;
        targetContainer.visible = !hidden && source.visible && sourceContainer.visible;
    }

    _hideNativeIndicator(panelParts, role) {
        let indicator = panelParts.panel.statusArea[role];
        if (!indicator) {
            indicator = panelParts.panel._ensureIndicator(role);
            if (indicator) {
                const placement = this._findIndicatorPlacement(Main.panel.statusArea[role]);
                const box = placement
                    ? panelParts.panel[`_${placement.box}Box`]
                    : panelParts.panel._rightBox;
                const position = placement?.position ?? box.get_n_children();
                panelParts.panel._addToPanelBox(role, indicator, position, box);
            }
        }

        if (indicator)
            (indicator.container ?? indicator).hide();
    }

    _publishIndicatorCatalog(statusArea) {
        const catalog = Object.entries(statusArea)
            .filter(([role, indicator]) => indicator && !EXCLUDED_MIRROR_ROLES.has(role))
            .map(([role, indicator]) => ({
                role,
                label: indicator.accessible_name || role,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
        const serialized = JSON.stringify(catalog);

        if (this._settings.get_string('indicator-catalog') !== serialized)
            this._settings.set_string('indicator-catalog', serialized);
    }

    _findIndicatorPlacement(indicator) {
        const sourceContainer = indicator.container ?? indicator;
        const boxes = [
            ['left', Main.panel._leftBox],
            ['center', Main.panel._centerBox],
            ['right', Main.panel._rightBox],
        ];

        for (const [name, box] of boxes) {
            if (!box)
                continue;

            const children = box.get_children();
            const position = children.findIndex(child =>
                child === sourceContainer || child === indicator ||
                child.contains?.(sourceContainer) || sourceContainer.contains?.(child));
            if (position >= 0)
                return {box: name, position};
        }

        return null;
    }

    _placeMirror(panel, mirror, placement) {
        const box = panel[`_${placement.box}Box`];
        if (!box)
            return;

        const container = mirror.container;
        const parent = container.get_parent();
        const currentPosition = parent === box
            ? box.get_children().indexOf(container)
            : -1;
        if (parent === box && currentPosition === placement.position)
            return;

        parent?.remove_child(container);
        box.insert_child_at_index(
            container,
            Math.min(placement.position, box.get_n_children()));
    }

    _removeMirror(panelParts, role) {
        const mirror = panelParts.mirrors.get(role);
        if (!mirror)
            return;

        panelParts.mirrors.delete(role);
        if (panelParts.panel.statusArea[role] === mirror)
            delete panelParts.panel.statusArea[role];
        mirror.container?.get_parent()?.remove_child(mirror.container);
        mirror.destroy();
    }

    _registerPanelWithBlurMyShell(panel) {
        const extension = Main.extensionManager.lookup('blur-my-shell@aunetx');
        const panelBlur = global.blur_my_shell?._panel_blur ?? extension?.stateObj?._panel_blur;
        panelBlur?.maybe_blur_panel(panel);
    }

    _syncVolumeScroller(panelParts) {
        const extension = Main.extensionManager.lookup(VOLUME_SCROLLER_UUID)?.stateObj;
        const activeExtension = extension?.enabled && extension._handle_scroll ? extension : null;
        const current = panelParts.volumeScroller;
        if (current?.extension === activeExtension)
            return;

        this._disconnectVolumeScroller(panelParts);

        if (!activeExtension)
            return;

        const scrollId = panelParts.panel.connect(
            'scroll-event', activeExtension._handle_scroll.bind(activeExtension));
        let gesture = null;
        let gestureId = 0;
        if (activeExtension.middle_click_gesture && Clutter.ClickGesture) {
            gesture = new Clutter.ClickGesture({
                required_button: Clutter.BUTTON_MIDDLE,
                recognize_on_press: true,
                enabled: activeExtension.middle_click_enabled,
            });
            gestureId = gesture.connect('recognize', () => activeExtension._toggle_mute());
            panelParts.panel.add_action_full(
                'volume-scroller-middle-click', Clutter.EventPhase.CAPTURE, gesture);
        }

        panelParts.volumeScroller = {
            extension: activeExtension,
            scrollId,
            gesture,
            gestureId,
        };
    }

    _disconnectVolumeScroller(panelParts) {
        const current = panelParts.volumeScroller;
        if (!current)
            return;

        panelParts.panel.disconnect(current.scrollId);
        if (current.gesture) {
            current.gesture.disconnect(current.gestureId);
            panelParts.panel.remove_action(current.gesture);
        }
        panelParts.volumeScroller = null;
    }

    _destroyPanel(panelParts) {
        const {panelBox, panel} = panelParts;
        this._disconnectVolumeScroller(panelParts);
        Main.layoutManager.removeChrome(panelBox);
        panel.destroy();
        panelBox.destroy();
    }
}