import django_filters

from netbox.filtersets import NetBoxModelFilterSet

from .models import ComponentPosition


class ComponentPositionFilterSet(NetBoxModelFilterSet):
    device_type_id = django_filters.NumberFilter(field_name='device_type_id')

    class Meta:
        model = ComponentPosition
        fields = ('id', 'device_type_id', 'content_type_id', 'object_id', 'face')

    def search(self, queryset, name, value):
        # ComponentPosition has no free-text field of its own worth searching; NetBoxModelFilterSet
        # requires this method to exist for the shared `q` filter to be usable without erroring.
        return queryset
