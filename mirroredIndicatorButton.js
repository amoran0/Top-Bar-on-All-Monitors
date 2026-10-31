import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const MirroredIndicatorButton = GObject.registerClass(
class MirroredIndicatorButton extends PanelMenu.Button {
    _init(panel, role, sourceIndicator) {
        super._init(0.0, null, true);

        this.menu = null;
        this._panel = panel;
        this._role = role;
        this._sourceIndicator = sourceIndicator;
        this._menuState = null;
        this._menuStateId = 0;
        this._restoreTimeoutId = 0;

        const sourceContent = sourceIndicator.get_first_child() ?? sourceIndicator;
        this.add_child(new Clutter.Clone({
            source: sourceContent,
            reactive: false,
        }));

        const syncVisibility = () => {
            const sourceContainer = sourceIndicator.container ?? sourceIndicator;
            this.container.visible = sourceContainer.visible;
        };

        sourceIndicator.connectObject(
            'notify::visible', syncVisibility,
            'destroy', () => this.destroy(),
            this);
        sourceIndicator.container?.connectObject(
            'notify::visible', syncVisibility,
            this);
        syncVisibility();
    }

    vfunc_button_press_event(event) {
        if (event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;

        const source = this._sourceIndicator;
        if (!source)
            return Clutter.EVENT_STOP;

        const menu = source.menu;
        if (menu && !(menu instanceof PopupMenu.PopupDummyMenu))
            return this._toggleSourceMenu(menu);

        if (typeof source._toggleMenu === 'function') {
            source._toggleMenu();
            return Clutter.EVENT_STOP;
        }

        if (typeof source.toggleMenu === 'function') {
            source.toggleMenu();
            return Clutter.EVENT_STOP;
        }

        return source.emit('button-press-event', event)
            ? Clutter.EVENT_STOP
            : Clutter.EVENT_PROPAGATE;
    }

    vfunc_button_release_event(event) {
        if (!this._sourceIndicator)
            return Clutter.EVENT_PROPAGATE;

        return this._sourceIndicator.emit('button-release-event', event)
            ? Clutter.EVENT_STOP
            : Clutter.EVENT_PROPAGATE;
    }

    vfunc_scroll_event(event) {
        if (!this._sourceIndicator)
            return Clutter.EVENT_PROPAGATE;

        return this._sourceIndicator.emit('scroll-event', event)
            ? Clutter.EVENT_STOP
            : Clutter.EVENT_PROPAGATE;
    }

    _toggleSourceMenu(menu) {
        if (menu.isOpen) {
            menu.close();
            return Clutter.EVENT_STOP;
        }

        this._restoreMenuAnchor();
        const menuActors = [menu.box, menu._boxPointer].filter(Boolean);
        this._menuState = {
            menu,
            sourceActor: menu.sourceActor,
            menuActors: menuActors.map(actor => ({
                actor,
                sourceActor: actor._sourceActor,
                sourceAllocation: actor._sourceAllocation,
            })),
        };

        menu.sourceActor = this;
        for (const actor of menuActors) {
            actor._sourceActor = this;
            actor._sourceAllocation = null;
        }

        this._menuStateId = menu.connect('open-state-changed', (_menu, isOpen) => {
            if (isOpen) {
                this.add_style_pseudo_class('active');
            } else {
                this.remove_style_pseudo_class('active');
                this._queueMenuAnchorRestore();
            }
        });
        menu.open();

        if (!menu.isOpen) {
            this.remove_style_pseudo_class('active');
            this._restoreMenuAnchor();
        }

        return Clutter.EVENT_STOP;
    }

    _queueMenuAnchorRestore() {
        if (this._restoreTimeoutId)
            GLib.source_remove(this._restoreTimeoutId);

        this._restoreTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
            this._restoreTimeoutId = 0;
            this._restoreMenuAnchor();
            return GLib.SOURCE_REMOVE;
        });
    }

    _restoreMenuAnchor() {
        if (this._restoreTimeoutId) {
            GLib.source_remove(this._restoreTimeoutId);
            this._restoreTimeoutId = 0;
        }

        const state = this._menuState;
        if (!state)
            return;

        if (this._menuStateId) {
            state.menu.disconnect(this._menuStateId);
            this._menuStateId = 0;
        }

        state.menu.sourceActor = state.sourceActor;
        this.remove_style_pseudo_class('active');
        this.remove_style_pseudo_class('checked');
        for (const {actor, sourceActor, sourceAllocation} of state.menuActors) {
            actor._sourceActor = sourceActor;
            actor._sourceAllocation = sourceAllocation;
        }
        this._menuState = null;
    }

    destroy() {
        this._sourceIndicator?.disconnectObject(this);
        this._sourceIndicator?.container?.disconnectObject(this);
        this._restoreMenuAnchor();
        this._sourceIndicator = null;
        super.destroy();
    }
});