from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ObjectDoesNotExist

from .models import ComponentPosition

SCHEMA_VERSION = 1


def export_layout(device_type):
    """
    Serialize a DeviceType's current layout to a portable dict. Each position is identified by its
    component's `(content_type, name)` pair - never by numeric database ID - so the file can be
    imported into a *different* NetBox instance's copy of the same DeviceType.
    """
    positions = ComponentPosition.objects.filter(device_type=device_type).select_related('content_type')

    return {
        'schema_version': SCHEMA_VERSION,
        'plugin': 'netbox_deviceportvisualizer',
        'device_type': {
            'manufacturer': device_type.manufacturer.slug,
            'model': device_type.model,
            'slug': device_type.slug,
        },
        'positions': [
            {
                'content_type': f'{position.content_type.app_label}.{position.content_type.model}',
                'name': position.component.name,
                'face': position.face,
                'x': float(position.x),
                'y': float(position.y),
            }
            for position in positions
            if position.component is not None
        ],
    }


def import_layout(device_type, payload):
    """
    Apply an exported layout dict to `device_type`, matching each entry by `(content_type, name)`
    against the target DeviceType's own live component templates. Returns a list of human-readable
    warning strings for any entry that couldn't be matched; matched entries are saved immediately.

    Deliberately does not touch any live component with no corresponding entry in `payload` - it's left
    unplaced rather than guessed at, exactly like a component that has simply never been positioned yet.
    """
    warnings = []

    for row in payload.get('positions', []):
        try:
            app_label, model_name = row['content_type'].split('.')
            content_type = ContentType.objects.get_by_natural_key(app_label, model_name)
        except (KeyError, ValueError, ObjectDoesNotExist):
            warnings.append(f"Skipped an entry with an invalid content type: {row.get('content_type')!r}.")
            continue

        model_class = content_type.model_class()
        component = model_class.objects.filter(device_type=device_type, name=row.get('name')).first()
        if component is None:
            warnings.append(
                f"Skipped '{row.get('name')}' ({row['content_type']}): not found on this device type."
            )
            continue

        ComponentPosition.objects.update_or_create(
            content_type=content_type,
            object_id=component.pk,
            defaults={
                'device_type': device_type,
                'face': row.get('face', 'front'),
                'x': row['x'],
                'y': row['y'],
            },
        )

    return warnings
