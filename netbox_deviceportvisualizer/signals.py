from django.contrib.contenttypes.models import ContentType
from django.db.models.signals import post_delete

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

# A GenericForeignKey has no on_delete cascade, so orphaned ComponentPosition rows must be cleaned up
# explicitly when the component template they reference is deleted. This mirrors NetBox core's own
# pattern for cross-model cleanup a plain FK can't reach (see dcim/signals.py's Cable/CableTermination
# post_delete receivers).
TEMPLATE_MODELS = (
    ConsolePortTemplate,
    ConsoleServerPortTemplate,
    PowerPortTemplate,
    PowerOutletTemplate,
    InterfaceTemplate,
    FrontPortTemplate,
    RearPortTemplate,
)


def cleanup_component_position(sender, instance, **kwargs):
    content_type = ContentType.objects.get_for_model(sender)
    ComponentPosition.objects.filter(content_type=content_type, object_id=instance.pk).delete()


# Signal.connect()'s `sender` filter must be a single model class, not a tuple - so each supported
# template model is connected individually, all to the same handler.
for _model in TEMPLATE_MODELS:
    post_delete.connect(cleanup_component_position, sender=_model, weak=False)
