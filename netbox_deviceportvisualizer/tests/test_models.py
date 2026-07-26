from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from ..models import ComponentPosition
from .base import DeviceTypeFixtureMixin


class ComponentPositionModelTests(DeviceTypeFixtureMixin, TestCase):

    def _interface_content_type(self):
        return ContentType.objects.get_for_model(self.interface_template)

    def test_unique_constraint_rejects_duplicate_component(self):
        content_type = self._interface_content_type()
        ComponentPosition.objects.create(
            device_type=self.device_type,
            content_type=content_type,
            object_id=self.interface_template.pk,
            x=0.1,
            y=0.1,
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ComponentPosition.objects.create(
                    device_type=self.device_type,
                    content_type=content_type,
                    object_id=self.interface_template.pk,
                    x=0.2,
                    y=0.2,
                )

    def test_clean_rejects_unsupported_content_type(self):
        position = ComponentPosition(
            device_type=self.device_type,
            content_type=ContentType.objects.get_for_model(self.device_type),
            object_id=self.device_type.pk,
            x=0.1,
            y=0.1,
        )
        with self.assertRaises(ValidationError):
            position.clean()

    def test_clean_rejects_component_from_a_different_device_type(self):
        position = ComponentPosition(
            device_type=self.other_device_type,
            content_type=self._interface_content_type(),
            object_id=self.interface_template.pk,
            x=0.1,
            y=0.1,
        )
        with self.assertRaises(ValidationError):
            position.clean()

    def test_device_type_autopopulates_when_blank(self):
        position = ComponentPosition(
            content_type=self._interface_content_type(),
            object_id=self.interface_template.pk,
            x=0.1,
            y=0.1,
        )
        position.clean()
        self.assertEqual(position.device_type_id, self.device_type.pk)
