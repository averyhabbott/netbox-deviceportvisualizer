from django.contrib.contenttypes.fields import GenericForeignKey
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import models
from django.db.models import Q
from django.urls import reverse
from django.utils.translation import gettext_lazy as _

from netbox.models import NetBoxModel

from .choices import ComponentFaceChoices

# The component template types this plugin can position. Console/console-server/power/power-outlet/
# interface/front-port/rear-port templates all represent a single, fixed physical connector on a
# device's faceplate, which is exactly what this plugin visualizes. ModuleBayTemplate/DeviceBayTemplate
# are deliberately excluded: they have no `type` field, so there's no principled default size/orientation
# for their marker, and this model has no per-position size override to compensate. InventoryItemTemplate
# is excluded because it represents nested/embedded hardware, not a fixed faceplate location.
SUPPORTED_COMPONENT_MODELS = (
    'consoleporttemplate',
    'consoleserverporttemplate',
    'powerporttemplate',
    'poweroutlettemplate',
    'interfacetemplate',
    'frontporttemplate',
    'rearporttemplate',
)


class ComponentPosition(NetBoxModel):
    """
    The position of a single dcim component template (interface, console port, power port, front/rear
    port) on its DeviceType's front or rear photo, expressed as percentages so it scales at any resolution.
    """
    device_type = models.ForeignKey(
        to='dcim.DeviceType',
        on_delete=models.CASCADE,
        related_name='port_visualizer_positions',
    )
    content_type = models.ForeignKey(
        to='contenttypes.ContentType',
        on_delete=models.CASCADE,
        related_name='+',
        limit_choices_to=Q(app_label='dcim', model__in=SUPPORTED_COMPONENT_MODELS),
    )
    object_id = models.PositiveBigIntegerField()
    component = GenericForeignKey(ct_field='content_type', fk_field='object_id')

    face = models.CharField(
        max_length=10,
        choices=ComponentFaceChoices,
        default=ComponentFaceChoices.FACE_FRONT,
    )
    x = models.DecimalField(
        max_digits=6,
        decimal_places=4,
        help_text=_('Horizontal position as a fraction of the photo width (0.0000-1.0000).'),
    )
    y = models.DecimalField(
        max_digits=6,
        decimal_places=4,
        help_text=_('Vertical position as a fraction of the photo height (0.0000-1.0000).'),
    )

    class Meta:
        ordering = ('device_type', 'content_type', 'object_id')
        constraints = (
            models.UniqueConstraint(
                fields=('content_type', 'object_id'),
                name='%(app_label)s_%(class)s_unique_component',
            ),
        )
        indexes = (
            models.Index(fields=('device_type',)),
        )
        verbose_name = _('component position')
        verbose_name_plural = _('component positions')

    def __str__(self):
        return f'{self.component} ({self.get_face_display()})'

    def get_absolute_url(self):
        return reverse('dcim:devicetype_port_visualizer', kwargs={'pk': self.device_type_id})

    def clean(self):
        super().clean()

        if self.content_type_id and (
            self.content_type.app_label != 'dcim' or self.content_type.model not in SUPPORTED_COMPONENT_MODELS
        ):
            raise ValidationError({'content_type': _('Unsupported component type.')})

        if self.content_type_id and self.object_id:
            try:
                component = self.content_type.get_object_for_this_type(pk=self.object_id)
            except ObjectDoesNotExist:
                raise ValidationError({'object_id': _('No matching component template found.')})

            if self.device_type_id and component.device_type_id != self.device_type_id:
                raise ValidationError(
                    _('This component does not belong to the specified device type.')
                )
            self.device_type_id = self.device_type_id or component.device_type_id
