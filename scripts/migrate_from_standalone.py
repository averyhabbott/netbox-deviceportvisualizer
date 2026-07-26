#!/usr/bin/env python3
"""
One-time converter from the old standalone port-visualizer tool's per-device JSON layout export to this
plugin's import format (Port Visualizer tab -> Import Layout).

The old tool (a separate Flask app) persisted one JSON file per device type at
`models/<device_slug>_layout.json`, shaped roughly like:

    {
      "deviceType": {"id": 123, "model": "Catalyst 9300", "slug": "catalyst-9300"},
      "interfaces": [ ...raw NetBox interface-template / console-port-template API objects... ],
      "positions": {"<template_id>": {"x": 0.25, "y": 0.475, "side": "front"}, ...},
      "timestamp": "..."
    }

`positions` is keyed by the numeric database ID of the component's NetBox API object, which isn't a
stable identifier across NetBox instances or across a re-import - this plugin's own layout format keys
by (content_type, name) instead (see netbox_deviceportvisualizer/importexport.py). This script bridges
the two: it joins `positions` back to `interfaces` by ID to recover each component's name, and infers its
NetBox content type from the `url` field every NetBox REST API object carries (e.g. a URL containing
"/interface-templates/" maps to dcim.interfacetemplate) - the old tool never stored a type tag of its own
alongside a position.

Caveat: this was written against the *documented* shape of the old format, recovered by reading the old
tool's source, since no exported layout file was available anywhere to test against. If a real export
from that tool doesn't convert cleanly, the JSON structure documented above is the first thing to check
against it.

Usage:
    python scripts/migrate_from_standalone.py old_layout.json > new_layout.json

The output is importable via the Port Visualizer tab's "Import Layout" button on the matching DeviceType.
Deliberately lives outside the installable netbox_deviceportvisualizer package - this is a one-time
migration aid, not an ongoing feature, so it has no reason to ship in the published plugin.
"""
import argparse
import json
import sys

SCHEMA_VERSION = 1

# Every raw NetBox REST API object embeds its own absolute `url` - the resource segment in that URL is a
# more reliable way to recover a component's type than guessing from its fields, since the old tool's
# `interfaces` array lumps every component type together with no type tag of its own.
RESOURCE_TO_CONTENT_TYPE = {
    'interface-templates': 'dcim.interfacetemplate',
    'console-port-templates': 'dcim.consoleporttemplate',
    'console-server-port-templates': 'dcim.consoleserverporttemplate',
    'power-port-templates': 'dcim.powerporttemplate',
    'power-outlet-templates': 'dcim.poweroutlettemplate',
    'front-port-templates': 'dcim.frontporttemplate',
    'rear-port-templates': 'dcim.rearporttemplate',
}


def _content_type_for(component):
    url = component.get('url') or ''
    for resource, content_type in RESOURCE_TO_CONTENT_TYPE.items():
        if f'/{resource}/' in url:
            return content_type
    return None


def convert(old_layout):
    """
    Convert one old-tool layout dict to this plugin's import format. Returns (new_layout, warnings) -
    entries that can't be converted are dropped and reported as warnings rather than guessed at, matching
    this plugin's own import_layout() behavior for entries it can't match.
    """
    components_by_id = {str(component['id']): component for component in old_layout.get('interfaces', [])}
    old_device_type = old_layout.get('deviceType', {})

    positions = []
    warnings = []

    for template_id, position in old_layout.get('positions', {}).items():
        component = components_by_id.get(str(template_id))
        if component is None:
            warnings.append(f"No matching entry in 'interfaces' for position id {template_id!r}; skipped.")
            continue

        name = component.get('name')
        if not name:
            warnings.append(f"Component {template_id!r} has no name; skipped.")
            continue

        content_type = _content_type_for(component)
        if content_type is None:
            warnings.append(
                f"Could not determine a NetBox content type for {name!r} "
                f"(no recognized resource in its 'url'); skipped."
            )
            continue

        positions.append({
            'content_type': content_type,
            'name': name,
            'face': position.get('side', 'front'),
            # The old tool stored x/y as 0-1 fractions of the photo; this plugin stores 0-100 percentages.
            'x': float(position['x']) * 100,
            'y': float(position['y']) * 100,
        })

    new_layout = {
        'schema_version': SCHEMA_VERSION,
        'plugin': 'netbox_deviceportvisualizer',
        'device_type': {
            'manufacturer': '',
            'model': old_device_type.get('model', ''),
            'slug': old_device_type.get('slug', ''),
        },
        'positions': positions,
    }
    return new_layout, warnings


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('input', help="Path to the old tool's exported layout JSON file.")
    parser.add_argument('-o', '--output', help='Where to write the converted layout (default: stdout).')
    args = parser.parse_args(argv)

    with open(args.input) as f:
        old_layout = json.load(f)

    new_layout, warnings = convert(old_layout)

    for warning in warnings:
        print(f'warning: {warning}', file=sys.stderr)

    output = json.dumps(new_layout, indent=2)
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output)
    else:
        print(output)


if __name__ == '__main__':
    main()
