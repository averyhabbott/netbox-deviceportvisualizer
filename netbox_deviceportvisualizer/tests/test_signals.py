from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from ..models import ComponentPosition
from .base import DeviceTypeFixtureMixin


class OrphanCleanupSignalTests(DeviceTypeFixtureMixin, TestCase):

    def test_deleting_a_component_template_deletes_its_position(self):
        content_type = ContentType.objects.get_for_model(self.interface_template)
        position = ComponentPosition.objects.create(
            device_type=self.device_type,
            content_type=content_type,
            object_id=self.interface_template.pk,
            x=0.1,
            y=0.1,
        )
        other_content_type = ContentType.objects.get_for_model(self.other_interface_template)
        other_position = ComponentPosition.objects.create(
            device_type=self.device_type,
            content_type=other_content_type,
            object_id=self.other_interface_template.pk,
            x=0.2,
            y=0.2,
        )

        self.interface_template.delete()

        self.assertFalse(ComponentPosition.objects.filter(pk=position.pk).exists())
        self.assertTrue(ComponentPosition.objects.filter(pk=other_position.pk).exists())

    def test_deleting_a_console_port_template_deletes_its_position(self):
        content_type = ContentType.objects.get_for_model(self.console_port_template)
        position = ComponentPosition.objects.create(
            device_type=self.device_type,
            content_type=content_type,
            object_id=self.console_port_template.pk,
            x=0.5,
            y=0.5,
        )

        self.console_port_template.delete()

        self.assertFalse(ComponentPosition.objects.filter(pk=position.pk).exists())
