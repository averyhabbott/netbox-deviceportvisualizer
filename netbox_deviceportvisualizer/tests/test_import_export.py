from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from ..importexport import export_layout, import_layout
from ..models import ComponentPosition
from .base import DeviceTypeFixtureMixin


class ImportExportTests(DeviceTypeFixtureMixin, TestCase):

    def setUp(self):
        ComponentPosition.objects.create(
            device_type=self.device_type,
            content_type=ContentType.objects.get_for_model(self.interface_template),
            object_id=self.interface_template.pk,
            face='front',
            x=0.25,
            y=0.50,
        )
        ComponentPosition.objects.create(
            device_type=self.device_type,
            content_type=ContentType.objects.get_for_model(self.console_port_template),
            object_id=self.console_port_template.pk,
            face='rear',
            x=0.75,
            y=0.10,
        )

    def test_export_then_reimport_round_trips_positions(self):
        payload = export_layout(self.device_type)
        self.assertEqual(len(payload['positions']), 2)

        ComponentPosition.objects.all().delete()
        warnings = import_layout(self.device_type, payload)

        self.assertEqual(warnings, [])
        interface_position = ComponentPosition.objects.get(
            content_type=ContentType.objects.get_for_model(self.interface_template),
            object_id=self.interface_template.pk,
        )
        self.assertEqual(interface_position.face, 'front')
        self.assertAlmostEqual(float(interface_position.x), 0.25)
        self.assertAlmostEqual(float(interface_position.y), 0.50)

    def test_import_skips_and_warns_on_unmatched_name(self):
        payload = export_layout(self.device_type)
        payload['positions'].append({
            'content_type': 'dcim.interfacetemplate',
            'name': 'Ethernet99',
            'face': 'front',
            'x': 0.9,
            'y': 0.9,
        })

        warnings = import_layout(self.device_type, payload)

        self.assertEqual(len(warnings), 1)
        self.assertIn('Ethernet99', warnings[0])

    def test_import_leaves_unmentioned_live_component_unplaced(self):
        payload = export_layout(self.device_type)
        payload['positions'] = [
            row for row in payload['positions'] if row['name'] != 'Ethernet1'
        ]

        ComponentPosition.objects.all().delete()
        import_layout(self.device_type, payload)

        self.assertFalse(
            ComponentPosition.objects.filter(
                content_type=ContentType.objects.get_for_model(self.interface_template),
                object_id=self.interface_template.pk,
            ).exists()
        )
        self.assertTrue(
            ComponentPosition.objects.filter(
                content_type=ContentType.objects.get_for_model(self.console_port_template),
                object_id=self.console_port_template.pk,
            ).exists()
        )
