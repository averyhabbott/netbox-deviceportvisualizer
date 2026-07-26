from django.contrib.contenttypes.models import ContentType

from dcim.choices import InterfaceTypeChoices
from dcim.models import ConsolePortTemplate, DeviceType, InterfaceTemplate, Manufacturer
from users.models import ObjectPermission


def grant_permission(user, model, actions):
    """
    Grant `user` an ObjectPermission covering `actions` (e.g. ['view'] or ['add', 'change', 'delete'])
    on every instance of `model`. NetBox's only configured auth backend is ObjectPermissionBackend, so
    plain Django `user.user_permissions.add(...)` is never consulted - this is the actual mechanism
    that has to be exercised to test permission-gated behavior.
    """
    permission = ObjectPermission.objects.create(
        name=f'test-{model._meta.model_name}-{"-".join(actions)}',
        actions=list(actions),
    )
    permission.object_types.set([ContentType.objects.get_for_model(model)])
    permission.users.set([user])
    return permission


class DeviceTypeFixtureMixin:
    """
    Shared fixture setup: one Manufacturer, one DeviceType, and a couple of component templates on it.
    """

    @classmethod
    def setUpTestData(cls):
        cls.manufacturer = Manufacturer.objects.create(name='Test Manufacturer', slug='test-manufacturer')
        cls.device_type = DeviceType.objects.create(
            manufacturer=cls.manufacturer,
            model='Test Switch',
            slug='test-switch',
            u_height=1,
        )
        cls.other_device_type = DeviceType.objects.create(
            manufacturer=cls.manufacturer,
            model='Other Switch',
            slug='other-switch',
            u_height=1,
        )
        cls.interface_template = InterfaceTemplate.objects.create(
            device_type=cls.device_type,
            name='Ethernet1',
            type=InterfaceTypeChoices.TYPE_10GE_SFP_PLUS,
        )
        cls.other_interface_template = InterfaceTemplate.objects.create(
            device_type=cls.device_type,
            name='Ethernet2',
            type=InterfaceTypeChoices.TYPE_1GE_FIXED,
        )
        cls.console_port_template = ConsolePortTemplate.objects.create(
            device_type=cls.device_type,
            name='Console1',
        )
