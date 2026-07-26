from django.contrib.contenttypes.models import ContentType

from dcim.models import (
    ConsolePortTemplate,
    ConsoleServerPortTemplate,
    FrontPortTemplate,
    InterfaceTemplate,
    PowerOutletTemplate,
    PowerPortTemplate,
    RearPortTemplate,
)

from .models import ComponentPosition
from .naming import shorten_component_name
from .shapes import get_shape

# (model, related_name on DeviceType) for every supported component template type, in the fixed
# priority order used to resolve a same-name collision across types under ?highlight=<name> (rare,
# documented limitation - see README).
SUPPORTED_MODELS = (
    (InterfaceTemplate, 'interfacetemplates'),
    (ConsolePortTemplate, 'consoleporttemplates'),
    (ConsoleServerPortTemplate, 'consoleserverporttemplates'),
    (PowerPortTemplate, 'powerporttemplates'),
    (PowerOutletTemplate, 'poweroutlettemplates'),
    (FrontPortTemplate, 'frontporttemplates'),
    (RearPortTemplate, 'rearporttemplates'),
)

# Standard EIA-310 rack width, in inches. Every device photo is assumed to depict a device exactly this
# wide - the same assumption views.py already makes for its no-photo aspect-ratio fallback - so a
# component's real-world inch size (shapes.py) and a DeviceType's own physical proportions can both be
# expressed as percentages of one consistent frame of reference.
RACK_WIDTH_IN = 19
RACK_UNIT_HEIGHT_IN = 1.75


def device_type_dimensions_in(device_type):
    """
    A DeviceType's assumed real-world (width_in, height_in), derived from the standard rack width and
    this DeviceType's own `u_height` (falling back to 1U for devices with no meaningful rack height,
    e.g. u_height of 0 or None).
    """
    return RACK_WIDTH_IN, float(device_type.u_height or 1) * RACK_UNIT_HEIGHT_IN


def _component_dict(component, content_type, shape, highlight_name, device_width_in, device_height_in):
    name = component.name
    return {
        'content_type': f'{content_type.app_label}.{content_type.model}',
        'content_type_id': content_type.pk,
        'object_id': component.pk,
        'name': name,
        'short_name': shorten_component_name(name),
        'width': shape['width_in'] / device_width_in * 100,
        'height': shape['height_in'] / device_height_in * 100,
        'category': shape['category'],
        'highlighted': highlight_name != '' and name == highlight_name,
    }


def _iter_all_components(device_type):
    for model, related_name in SUPPORTED_MODELS:
        content_type = ContentType.objects.get_for_model(model)
        for component in getattr(device_type, related_name).all():
            type_value = getattr(component, 'type', None)
            shape = get_shape(content_type.model, type_value)
            yield component, content_type, shape


def build_diagram_context(device_type, highlight_name=''):
    """
    Returns (placed, unplaced) - both lists of plain dicts ready for direct template rendering. `placed`
    entries additionally carry `face`/`x`/`y`; `unplaced` entries are components with no ComponentPosition
    row yet. All shape/size/short-name computation happens once here in Python, so the template and JS
    never need to know a component's NetBox `type` or compute anything about its size.
    """
    positions_by_key = {
        (position.content_type_id, position.object_id): position
        for position in ComponentPosition.objects.filter(device_type=device_type)
    }

    device_width_in, device_height_in = device_type_dimensions_in(device_type)

    placed = []
    unplaced = []

    for component, content_type, shape in _iter_all_components(device_type):
        entry = _component_dict(component, content_type, shape, highlight_name, device_width_in, device_height_in)
        position = positions_by_key.get((content_type.pk, component.pk))
        if position is None:
            unplaced.append(entry)
        else:
            entry['position_id'] = position.pk
            entry['face'] = position.face
            entry['x'] = float(position.x)
            entry['y'] = float(position.y)
            placed.append(entry)

    return placed, unplaced
