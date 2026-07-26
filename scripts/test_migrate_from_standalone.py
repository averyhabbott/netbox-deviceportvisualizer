import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from migrate_from_standalone import convert  # noqa: E402


def _old_layout(**overrides):
    layout = {
        'deviceType': {'id': 1, 'model': 'Catalyst 9300', 'slug': 'catalyst-9300'},
        'interfaces': [
            {
                'id': 501,
                'name': 'GigabitEthernet1/0/1',
                'url': 'https://netbox.example.com/api/dcim/interface-templates/501/',
            },
            {
                'id': 502,
                'name': 'Console',
                'url': 'https://netbox.example.com/api/dcim/console-port-templates/502/',
            },
        ],
        'positions': {
            '501': {'x': 0.25, 'y': 0.475, 'side': 'front'},
            '502': {'x': 0.9, 'y': 0.1, 'side': 'rear'},
        },
        'timestamp': '2025-01-01T00:00:00Z',
    }
    layout.update(overrides)
    return layout


class ConvertTests(unittest.TestCase):

    def test_converts_positions_keyed_by_name_with_percent_coordinates(self):
        new_layout, warnings = convert(_old_layout())

        self.assertEqual(warnings, [])
        self.assertEqual(new_layout['schema_version'], 1)
        self.assertEqual(new_layout['device_type']['slug'], 'catalyst-9300')
        self.assertEqual(
            new_layout['positions'],
            [
                {
                    'content_type': 'dcim.interfacetemplate',
                    'name': 'GigabitEthernet1/0/1',
                    'face': 'front',
                    'x': 25.0,
                    'y': 47.5,
                },
                {
                    'content_type': 'dcim.consoleporttemplate',
                    'name': 'Console',
                    'face': 'rear',
                    'x': 90.0,
                    'y': 10.0,
                },
            ],
        )

    def test_position_with_no_matching_interface_is_skipped_and_warned(self):
        old_layout = _old_layout()
        old_layout['positions']['999'] = {'x': 0.5, 'y': 0.5, 'side': 'front'}

        new_layout, warnings = convert(old_layout)

        self.assertEqual(len(new_layout['positions']), 2)
        self.assertEqual(len(warnings), 1)
        self.assertIn('999', warnings[0])

    def test_unrecognized_url_resource_is_skipped_and_warned(self):
        old_layout = _old_layout()
        old_layout['interfaces'][0]['url'] = 'https://netbox.example.com/api/dcim/device-bay-templates/501/'

        new_layout, warnings = convert(old_layout)

        self.assertEqual(len(new_layout['positions']), 1)
        self.assertEqual(len(warnings), 1)

    def test_missing_name_is_skipped_and_warned(self):
        old_layout = _old_layout()
        del old_layout['interfaces'][0]['name']

        new_layout, warnings = convert(old_layout)

        self.assertEqual(len(new_layout['positions']), 1)
        self.assertEqual(len(warnings), 1)


if __name__ == '__main__':
    unittest.main()
