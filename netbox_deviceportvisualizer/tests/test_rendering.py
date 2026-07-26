from django.test import TestCase

from dcim.models import DeviceType

from ..rendering import RACK_WIDTH_IN, build_diagram_context, device_type_dimensions_in
from .base import DeviceTypeFixtureMixin


class DeviceTypeDimensionsTests(DeviceTypeFixtureMixin, TestCase):

    def test_dimensions_derive_from_rack_width_and_u_height(self):
        width_in, height_in = device_type_dimensions_in(self.device_type)
        self.assertEqual(width_in, RACK_WIDTH_IN)
        self.assertEqual(height_in, 1.75)

    def test_zero_u_height_falls_back_to_one_u(self):
        fixed_config_device_type = DeviceType.objects.create(
            manufacturer=self.manufacturer,
            model='Fixed Config Switch',
            slug='fixed-config-switch',
            u_height=0,
        )
        width_in, height_in = device_type_dimensions_in(fixed_config_device_type)
        self.assertEqual(width_in, RACK_WIDTH_IN)
        self.assertEqual(height_in, 1.75)


class MarkerSizeConversionTests(DeviceTypeFixtureMixin, TestCase):
    """
    Marker width/height are computed from a component's real-world inch size (shapes.py), converted to
    a percentage of the DeviceType's own assumed real-world proportions (19" rack width, u_height * 1.75"
    tall) - not an arbitrary percentage of the photo. This locks that conversion in place.
    """

    def test_sfp_interface_size_matches_measured_inches(self):
        placed, unplaced = build_diagram_context(self.device_type)
        entry = next(item for item in unplaced if item['name'] == 'Ethernet1')

        self.assertAlmostEqual(entry['width'], 0.56 / 19 * 100)
        self.assertAlmostEqual(entry['height'], 0.35 / 1.75 * 100)

    def test_copper_interface_size_matches_measured_inches(self):
        placed, unplaced = build_diagram_context(self.device_type)
        entry = next(item for item in unplaced if item['name'] == 'Ethernet2')

        self.assertAlmostEqual(entry['width'], 0.60 / 19 * 100)
        self.assertAlmostEqual(entry['height'], 0.40 / 1.75 * 100)
