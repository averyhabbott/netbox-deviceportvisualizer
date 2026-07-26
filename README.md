# NetBox Device Port Visualizer

A [NetBox](https://github.com/netbox-community/netbox) plugin that lets you position a DeviceType's physical
interfaces, console ports, power ports, and front/rear ports on its front/rear photo, then highlight a specific
port and share the result as a screenshot. It's built for the case where the person doing the physical work — an
optic swap, a cable reseat, a power cord check — has no NetBox access at all: they just need a picture with the
right port circled.

Supports NetBox 4.5.x and 4.6.x. See [COMPATIBILITY.md](COMPATIBILITY.md).

## Features

- A **Port Visualizer** tab on every DeviceType's detail page, showing its front/rear photo with every
  interface/console/power/front-port/rear-port template positioned on top, sized to their real-world
  connector dimensions rather than an arbitrary guess. The photo loads by default; a **Photo/Outline**
  toggle lets you set aside a busy or missing photo without losing the layout underneath it.
- Drag-and-drop placement with a configurable grid snap, gated by a plugin-owned permission — anyone who can
  view the DeviceType can view the diagram; only permitted users can move things. Click any port to pin a
  readable label over it, on the diagram or in the "unplaced" tray.
- **Portable layouts.** Export a DeviceType's layout to a JSON file keyed by component name (not database ID),
  and import it into any other NetBox instance — the old pain point this plugin was built to fix.
- Native jump-buttons on DeviceType, Device, and Interface pages, replacing manually-configured Custom Links.
- Deep-link highlighting via `?highlight=<name>`, e.g. `.../port-visualizer/?highlight=Ethernet1/18`.
- No API tokens, no CORS configuration, no reverse proxy. Runs entirely inside NetBox, using the same login
  session and permission system as everything else.

## Installation

```bash
pip install netbox-deviceportvisualizer
```

Add the plugin to your NetBox `configuration.py`:

```python
PLUGINS = [
    'netbox_deviceportvisualizer',
]
```

Then run migrations and restart NetBox:

```bash
python manage.py migrate
python manage.py collectstatic --no-input
```

### Optional settings

The drag snap grid — how coarsely a marker's position rounds while you're placing it, expressed as a
percentage of the photo's own width/height — is configurable per instance via `PLUGINS_CONFIG`. The right
value depends on how much detail your device photos actually have; the defaults below are a starting point,
not a measurement of anything:

```python
PLUGINS_CONFIG = {
    'netbox_deviceportvisualizer': {
        'snap_x': 0.25,  # default
        'snap_y': 2.5,   # default
    }
}
```

If a device's ports still don't line up tidily when dragged, try a larger value for a coarser, more visibly
"stepped" grid.

## Permissions

Viewing the Port Visualizer tab requires only `dcim.view_devicetype` (the same permission that already gates
viewing the DeviceType itself).

Editing a layout (dragging ports into place, or importing a layout file) requires the plugin's own
`netbox_deviceportvisualizer.add_componentposition` / `change_componentposition` / `delete_componentposition`
permissions — deliberately **not** `dcim.change_devicetype`, since "who may reposition a marker on a diagram" is
unrelated to "who may edit the DeviceType's own fields." Grant editors an `ObjectPermission` covering all three.

## Usage

Open any DeviceType with a front and/or rear photo set, go to its **Port Visualizer** tab, and drag each
component into place. Positions save as percentages of the photo, so they scale correctly at any resolution.

### Deep links

```text
/dcim/device-types/<id>/port-visualizer/?highlight=Ethernet1/18
```

Jumps straight to a DeviceType's diagram with the named component highlighted. This is what the native
Device/Interface page buttons construct automatically — you generally won't need to build this URL by hand.

### Exporting and importing layouts

Use **Export Layout** on a DeviceType's Port Visualizer tab to download a JSON file. The file identifies each
component by its `content_type` (e.g. `dcim.interfacetemplate`) and `name`, never by numeric database ID, so it
can be imported into a *different* NetBox instance's copy of the same DeviceType via **Import Layout**.

On import, each entry is matched by name against the target DeviceType's live component templates:

- A match updates that component's position.
- A name in the file with no matching component on the target device is skipped, and reported.
- A live component with no entry in the file is left unplaced — never auto-filled to a guessed position, since
  the entire point of this plugin is that a placed marker can be trusted.

### Migrating from the standalone tool

If you have layouts saved by the old standalone (non-plugin) version of this tool, convert one to this
plugin's import format with the `migrate_from_standalone.py` script.

**Getting the script.** It's a one-time migration aid, not an ongoing feature, so it is **not** included
in the `pip install netbox-deviceportvisualizer` package — `pyproject.toml` only ships the
`netbox_deviceportvisualizer` package itself. Download just the one file from GitHub:

```bash
curl -O https://raw.githubusercontent.com/averyhabbott/netbox-deviceportvisualizer/main/scripts/migrate_from_standalone.py
```

(or clone the full repo and use `scripts/migrate_from_standalone.py` from your checkout).

**Where to run it.** Anywhere with Python 3 — it does not need to run on the NetBox server itself. The
script only reads a JSON file and writes a JSON file; it has no dependencies beyond the standard library
and never imports Django, talks to NetBox's API, or touches the network. Run it on your own laptop against
an old layout export:

```bash
python3 migrate_from_standalone.py old_layout.json -o new_layout.json
```

Then upload `new_layout.json` via **Import Layout** on the matching DeviceType in your browser, same as
any other export — that upload step is what actually talks to NetBox, from wherever your browser happens
to be.

**Other considerations:**

- The old tool keyed each position by the component's numeric database ID at the time it was saved. If a
  DeviceType's templates were ever deleted and recreated (e.g. re-imported from the device-type library),
  those old IDs no longer correspond to anything — the script drops those entries and reports each one as
  a `warning:` line on stderr rather than guessing. This is expected and doesn't affect any component that
  still exists under its original ID; check the warning count if you want to know how many entries were
  dropped.
- Only interfaces and console ports were ever positioned by the old tool — it never fetched power ports,
  power outlets, or front/rear ports from NetBox, so those won't appear in old exports at all.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
