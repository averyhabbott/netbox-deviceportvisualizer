from django.test import SimpleTestCase

from ..naming import shorten_component_name
from ..shapes import get_shape


class ShapeLookupTests(SimpleTestCase):

    def test_qsfp_variants_bucket_together(self):
        self.assertEqual(get_shape('interfacetemplate', '100gbase-x-qsfp28')['category'], 'qsfp')
        self.assertEqual(get_shape('interfacetemplate', '400gbase-x-osfp')['category'], 'qsfp')

    def test_sizes_are_measured_real_world_inches(self):
        # These carry forward the old standalone tool's field-validated connector dimensions - not
        # arbitrary percentages of whatever photo they happen to be shown against.
        self.assertEqual(
            get_shape('interfacetemplate', '100gbase-x-qsfp28'),
            {'width_in': 0.74, 'height_in': 0.35, 'category': 'qsfp'},
        )
        self.assertEqual(
            get_shape('interfacetemplate', '10gbase-x-sfpp'),
            {'width_in': 0.56, 'height_in': 0.35, 'category': 'sfp'},
        )
        self.assertEqual(
            get_shape('interfacetemplate', '1000base-t'),
            {'width_in': 0.60, 'height_in': 0.40, 'category': 'copper'},
        )

    def test_sfp_variants_bucket_together(self):
        self.assertEqual(get_shape('interfacetemplate', '10gbase-x-sfpp')['category'], 'sfp')
        self.assertEqual(get_shape('interfacetemplate', '1000base-x-sfp')['category'], 'sfp')

    def test_fixed_copper_falls_back_to_copper_bucket(self):
        self.assertEqual(get_shape('interfacetemplate', '1000base-t')['category'], 'copper')

    def test_unrecognized_type_falls_back_to_copper_bucket(self):
        self.assertEqual(get_shape('interfacetemplate', 'some-future-type-xyz')['category'], 'copper')

    def test_console_and_power_ignore_type_value(self):
        self.assertEqual(get_shape('consoleporttemplate', 'rj-45')['category'], 'console')
        self.assertEqual(get_shape('powerporttemplate', 'iec-60320-c14')['category'], 'power')

    def test_patch_port_fiber_vs_copper(self):
        self.assertEqual(get_shape('frontporttemplate', 'lc')['category'], 'patch-fiber')
        self.assertEqual(get_shape('rearporttemplate', '8p8c')['category'], 'patch-copper')

    def test_unsupported_model_falls_back_to_default(self):
        self.assertEqual(get_shape('devicebaytemplate')['category'], 'default')


class NamingTests(SimpleTestCase):

    def test_shortens_known_prefixes(self):
        self.assertEqual(shorten_component_name('GigabitEthernet1/0/1'), 'Gi1/0/1')
        self.assertEqual(shorten_component_name('TenGigabitEthernet1/1'), 'Te1/1')
        self.assertEqual(shorten_component_name('Ethernet1/18'), 'Eth1/18')

    def test_leaves_unrecognized_names_unchanged(self):
        self.assertEqual(shorten_component_name('SomeVendorName-3'), 'SomeVendorName-3')
