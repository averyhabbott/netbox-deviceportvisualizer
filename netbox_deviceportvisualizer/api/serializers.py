from core.models import ObjectType
from netbox.api.fields import ContentTypeField
from netbox.api.gfk_fields import GFKSerializerField
from netbox.api.serializers import NetBoxModelSerializer

from ..models import ComponentPosition


class ComponentPositionSerializer(NetBoxModelSerializer):
    content_type = ContentTypeField(queryset=ObjectType.objects.all())
    component = GFKSerializerField(read_only=True)

    class Meta:
        model = ComponentPosition
        fields = (
            'id', 'url', 'display', 'device_type', 'content_type', 'object_id', 'component',
            'face', 'x', 'y', 'created', 'last_updated',
        )
        brief_fields = ('id', 'url', 'display', 'x', 'y', 'face')
