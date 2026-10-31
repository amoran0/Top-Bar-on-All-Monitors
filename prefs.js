import Adw from 'gi://Adw';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const KNOWN_INDICATORS = {
    activities: 'Actividades',
    appMenu: 'Menú de aplicación',
    dateMenu: 'Fecha y hora',
    keyboard: 'Distribución del teclado',
    quickSettings: 'Ajustes rápidos y bandeja del sistema',
};

export default class TopBarAllMonitorsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage({
            title: 'Indicadores',
            icon_name: 'view-grid-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: 'Barras secundarias',
            description: 'Elige qué indicadores aparecen en todos los monitores secundarios.',
        });
        let rows = [];

        page.add(group);
        window.add(page);

        const rebuild = () => {
            for (const row of rows)
                group.remove(row);
            rows = [];

            const indicators = {...KNOWN_INDICATORS};
            try {
                for (const item of JSON.parse(settings.get_string('indicator-catalog'))) {
                    if (item?.role && item.role !== 'quickSettings')
                        indicators[item.role] = KNOWN_INDICATORS[item.role] || item.label || item.role;
                }
            } catch {}

            const hidden = new Set(settings.get_strv('hidden-indicators'));
            for (const [role, label] of Object.entries(indicators).sort((a, b) =>
                a[1].localeCompare(b[1]))) {
                const row = new Adw.SwitchRow({
                    title: label,
                    subtitle: role,
                    active: !hidden.has(role),
                });
                row.connect('notify::active', () => {
                    const selected = new Set(settings.get_strv('hidden-indicators'));
                    if (row.active)
                        selected.delete(role);
                    else
                        selected.add(role);
                    settings.set_strv('hidden-indicators', [...selected].sort());
                });
                group.add(row);
                rows.push(row);
            }
        };

        rebuild();
        settings.connect('changed::indicator-catalog', rebuild);
        settings.connect('changed::hidden-indicators', rebuild);
    }
}