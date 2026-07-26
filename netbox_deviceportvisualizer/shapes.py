"""
Default marker size/category for each supported component template type.

These are starting points, not measurements: a component's size on the actual photo depends on the
specific device and photo resolution, and the user is always expected to drag a newly-placed marker
into its exact spot. What matters here is *relative* proportion - a QSFP cage should default noticeably
larger than a copper RJ-45 port, which should default larger than a console port - so a freshly-placed
row of ports looks roughly right before any manual adjustment.

Sizes are given in real-world inches, not percentages: a marker only has a meaningful size relative to
the photo once you know how many inches that photo actually depicts. rendering.py converts these to
percentages of the photo's own width/height using the same 19"-wide, DeviceType.u_height-tall assumption
already used elsewhere in this plugin for the no-photo aspect-ratio fallback (see views.py), so a
marker's default footprint scales correctly against a real device photo instead of an arbitrary guess.
"""

DEFAULT_SHAPE = {'width_in': 0.50, 'height_in': 0.40, 'category': 'default'}

_SHAPES_BY_CATEGORY = {
    # Values below for qsfp/sfp/copper carry forward the old standalone tool's measured, field-validated
    # connector dimensions; console/power/patch-fiber/virtual are new buckets this plugin adds, sized by
    # reasonable estimate of their real-world connector footprint.
    'qsfp': {'width_in': 0.74, 'height_in': 0.35, 'category': 'qsfp'},
    'sfp': {'width_in': 0.56, 'height_in': 0.35, 'category': 'sfp'},
    'copper': {'width_in': 0.60, 'height_in': 0.40, 'category': 'copper'},
    'virtual': {'width_in': 0.30, 'height_in': 0.20, 'category': 'virtual'},
    'console': {'width_in': 0.60, 'height_in': 0.40, 'category': 'console'},
    'power': {'width_in': 0.75, 'height_in': 0.50, 'category': 'power'},
    'patch-fiber': {'width_in': 0.35, 'height_in': 0.25, 'category': 'patch-fiber'},
    'patch-copper': {'width_in': 0.60, 'height_in': 0.40, 'category': 'patch-copper'},
}

# Substring buckets for InterfaceTypeChoices/PortTypeChoices values, checked in order. NetBox adds new
# type choices over time (new transceiver form factors, new speeds); matching by substring instead of an
# exhaustive value list means new types fall through to a sane bucket automatically instead of silently
# landing in DEFAULT_SHAPE.
_INTERFACE_KEYWORD_BUCKETS = (
    ('qsfp', 'qsfp'), ('osfp', 'qsfp'), ('cfp', 'qsfp'), ('cxp', 'qsfp'), ('cdfp', 'qsfp'), ('cpak', 'qsfp'),
    ('sfp', 'sfp'), ('xfp', 'sfp'), ('gbic', 'sfp'), ('x2', 'sfp'), ('xenpak', 'sfp'),
    ('virtual', 'virtual'), ('bridge', 'virtual'), ('lag', 'virtual'),
    ('ieee802', 'virtual'), ('wireless', 'virtual'), ('gsm', 'virtual'), ('cdma', 'virtual'),
    ('lte', 'virtual'), ('4g', 'virtual'), ('5g', 'virtual'),
)

_PATCH_FIBER_KEYWORDS = (
    'lc', 'sc', 'st', 'fc', 'mtrj', 'mpo', 'lsh', 'lx5', 'splice', 'cs', 'sn', 'sma', 'urm',
)


def _bucket_for_interface_type(type_value):
    if not type_value:
        return 'copper'
    value = type_value.lower()
    for keyword, bucket in _INTERFACE_KEYWORD_BUCKETS:
        if keyword in value:
            return bucket
    # base-t, fixed base-fx/tx, fibrechannel/sonet fixed ports, etc. all default to the copper bucket -
    # they're fixed, non-modular connectors similar in scale to an RJ-45 port.
    return 'copper'


def _bucket_for_patch_port_type(type_value):
    if not type_value:
        return 'patch-copper'
    value = type_value.lower()
    if any(keyword in value for keyword in _PATCH_FIBER_KEYWORDS):
        return 'patch-fiber'
    return 'patch-copper'


def get_shape(model_name, type_value=None):
    """
    model_name: the lowercase model name of the component template, e.g. 'interfacetemplate'.
    type_value: the component's own `type` choice value, if it has one (InterfaceTemplate/
        FrontPortTemplate/RearPortTemplate do; ConsolePortTemplate/PowerPortTemplate/etc. do too, but
        their marker size doesn't vary meaningfully by sub-type so it's not consulted for them).
    """
    if model_name == 'interfacetemplate':
        bucket = _bucket_for_interface_type(type_value)
    elif model_name in ('frontporttemplate', 'rearporttemplate'):
        bucket = _bucket_for_patch_port_type(type_value)
    elif model_name in ('consoleporttemplate', 'consoleserverporttemplate'):
        bucket = 'console'
    elif model_name in ('powerporttemplate', 'poweroutlettemplate'):
        bucket = 'power'
    else:
        return DEFAULT_SHAPE

    return _SHAPES_BY_CATEGORY.get(bucket, DEFAULT_SHAPE)
