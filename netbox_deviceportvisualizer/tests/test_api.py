import json

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from django.urls import reverse

from users.models import User

from ..models import ComponentPosition
from .base import DeviceTypeFixtureMixin, grant_permission


class ComponentPositionAPITests(DeviceTypeFixtureMixin, TestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.list_url = reverse('plugins-api:netbox_deviceportvisualizer-api:componentposition-list')

    def _create_position(self, template, x=0.1, y=0.1):
        return ComponentPosition.objects.create(
            device_type=self.device_type,
            content_type=ContentType.objects.get_for_model(template),
            object_id=template.pk,
            x=x,
            y=y,
        )

    def test_session_auth_is_sufficient_no_token_required(self):
        # Proves the CORS/API-token problem is actually gone: a plain browser session, with no
        # Authorization header at all, is enough to authenticate against the plugin's own API.
        editor = User.objects.create_user(username='editor')
        grant_permission(editor, ComponentPosition, ['view', 'add', 'change', 'delete'])
        self.client.force_login(editor)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, 200)

    def test_bulk_patch_moves_multiple_positions_in_one_call(self):
        editor = User.objects.create_user(username='editor')
        grant_permission(editor, ComponentPosition, ['view', 'add', 'change', 'delete'])
        self.client.force_login(editor)

        position_one = self._create_position(self.interface_template)
        position_two = self._create_position(self.other_interface_template)

        response = self.client.patch(
            self.list_url,
            data=json.dumps([
                {'id': position_one.pk, 'x': 0.55, 'y': 0.66},
                {'id': position_two.pk, 'x': 0.77, 'y': 0.88},
            ]),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200, response.content)
        position_one.refresh_from_db()
        position_two.refresh_from_db()
        self.assertAlmostEqual(float(position_one.x), 0.55)
        self.assertAlmostEqual(float(position_two.x), 0.77)

    def test_post_without_add_permission_is_rejected(self):
        viewer = User.objects.create_user(username='viewer')
        grant_permission(viewer, ComponentPosition, ['view'])
        self.client.force_login(viewer)

        response = self.client.post(
            self.list_url,
            data=json.dumps({
                'device_type': self.device_type.pk,
                'content_type': 'dcim.interfacetemplate',
                'object_id': self.interface_template.pk,
                'face': 'front',
                'x': 0.1,
                'y': 0.1,
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 403)

    def test_patch_without_change_permission_is_rejected(self):
        viewer = User.objects.create_user(username='viewer')
        grant_permission(viewer, ComponentPosition, ['view'])
        self.client.force_login(viewer)
        position = self._create_position(self.interface_template)

        response = self.client.patch(
            self.list_url,
            data=json.dumps([{'id': position.pk, 'x': 0.9, 'y': 0.9}]),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 403)
