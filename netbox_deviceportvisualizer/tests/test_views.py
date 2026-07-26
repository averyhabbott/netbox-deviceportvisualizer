from django.test import TestCase
from django.urls import reverse

from dcim.models import DeviceType
from users.models import User

from ..models import ComponentPosition
from .base import DeviceTypeFixtureMixin, grant_permission


class DeviceTypePortVisualizerViewTests(DeviceTypeFixtureMixin, TestCase):

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.tab_url = reverse('dcim:devicetype_port_visualizer', kwargs={'pk': cls.device_type.pk})
        cls.import_url = reverse('dcim:devicetype_port_visualizer_import', kwargs={'pk': cls.device_type.pk})

    def test_anonymous_user_is_redirected_to_login(self):
        response = self.client.get(self.tab_url)
        self.assertEqual(response.status_code, 302)

    def test_view_only_user_sees_tab_without_edit_affordances(self):
        viewer = User.objects.create_user(username='viewer')
        grant_permission(viewer, DeviceType, ['view'])
        self.client.force_login(viewer)

        response = self.client.get(self.tab_url)

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.context['can_edit'])

    def test_view_only_user_cannot_post_an_import(self):
        viewer = User.objects.create_user(username='viewer')
        grant_permission(viewer, DeviceType, ['view'])
        self.client.force_login(viewer)

        response = self.client.post(self.import_url, data={})

        self.assertEqual(response.status_code, 403)

    def test_editor_sees_edit_affordances_and_can_import(self):
        editor = User.objects.create_user(username='editor')
        grant_permission(editor, DeviceType, ['view'])
        grant_permission(editor, ComponentPosition, ['view', 'add', 'change', 'delete'])
        self.client.force_login(editor)

        tab_response = self.client.get(self.tab_url)
        self.assertTrue(tab_response.context['can_edit'])

        # An empty/invalid upload re-renders the form rather than 403ing - permission, not validity,
        # is what this test is verifying.
        import_response = self.client.post(self.import_url, data={})
        self.assertEqual(import_response.status_code, 200)
