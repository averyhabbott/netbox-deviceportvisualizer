from netbox.api.viewsets import NetBoxModelViewSet

from ..filtersets import ComponentPositionFilterSet
from ..models import ComponentPosition
from .serializers import ComponentPositionSerializer


class ComponentPositionViewSet(NetBoxModelViewSet):
    queryset = ComponentPosition.objects.all()
    serializer_class = ComponentPositionSerializer
    filterset_class = ComponentPositionFilterSet
