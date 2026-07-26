from django.contrib import messages
from django.contrib.auth.mixins import PermissionRequiredMixin
from django.core.exceptions import PermissionDenied
from django.db.models import Count
from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils.translation import gettext as _
from django.views import View

from dcim.models import DeviceType
from netbox.plugins import get_plugin_config
from netbox.views import generic
from utilities.views import ViewTab, register_model_view

from .forms import LayoutImportForm
from .importexport import export_layout, import_layout
from .models import ComponentPosition
from .rendering import build_diagram_context, device_type_dimensions_in


def _can_edit(user):
    return (
        user.has_perm('netbox_deviceportvisualizer.add_componentposition')
        or user.has_perm('netbox_deviceportvisualizer.change_componentposition')
    )


@register_model_view(DeviceType, 'port_visualizer', path='port-visualizer')
class DeviceTypePortVisualizerView(generic.ObjectView):
    queryset = DeviceType.objects.all()
    template_name = 'netbox_deviceportvisualizer/devicetype_portvisualizer.html'
    tab = ViewTab(
        label=_('Port Visualizer'),
        permission='dcim.view_devicetype',
        weight=595,
    )

    def get_extra_context(self, request, instance):
        highlight = request.GET.get('highlight', '')
        placed, unplaced = build_diagram_context(instance, highlight)
        aspect_width, aspect_height = device_type_dimensions_in(instance)
        return {
            'placed': placed,
            'unplaced': unplaced,
            'can_edit': _can_edit(request.user),
            'highlight': highlight,
            'placed_highlighted': any(item['highlighted'] for item in placed),
            'faces': (
                ('front', instance.front_image.url if instance.front_image else None),
                ('rear', instance.rear_image.url if instance.rear_image else None),
            ),
            # Rack-unit-derived fallback aspect ratio, used only when a face has no photo, so the marker
            # layer still has sane proportions to lay components onto.
            'aspect_width': aspect_width,
            'aspect_height': aspect_height,
            # Percent-of-photo drag snap grid, admin-configurable via PLUGINS_CONFIG (see README) since
            # the right grid coarseness depends on real photo resolution/detail, not something one
            # default suits for every device.
            'snap_x': get_plugin_config('netbox_deviceportvisualizer', 'snap_x', 0.25),
            'snap_y': get_plugin_config('netbox_deviceportvisualizer', 'snap_y', 2.5),
        }


@register_model_view(DeviceType, 'port_visualizer_export', path='port-visualizer/export')
class DeviceTypePortVisualizerExportView(generic.ObjectView):
    queryset = DeviceType.objects.all()

    def get(self, request, **kwargs):
        instance = self.get_object(**kwargs)
        payload = export_layout(instance)
        response = JsonResponse(payload, json_dumps_params={'indent': 2})
        response['Content-Disposition'] = f'attachment; filename="{instance.slug}_layout.json"'
        return response


@register_model_view(DeviceType, 'port_visualizer_import', path='port-visualizer/import')
class DeviceTypePortVisualizerImportView(generic.ObjectView):
    queryset = DeviceType.objects.all()
    template_name = 'netbox_deviceportvisualizer/componentposition_import.html'

    def get_extra_context(self, request, instance):
        return {'form': LayoutImportForm()}

    def post(self, request, **kwargs):
        instance = self.get_object(**kwargs)
        if not request.user.has_perm('netbox_deviceportvisualizer.change_componentposition'):
            raise PermissionDenied(_('You do not have permission to import a layout for this device type.'))

        form = LayoutImportForm(request.POST, request.FILES)
        if form.is_valid():
            warnings = import_layout(instance, form.cleaned_data['layout_file'])
            for warning in warnings:
                messages.warning(request, warning)
            if not warnings:
                messages.success(request, _('Layout imported successfully.'))
            else:
                messages.info(request, _('Layout imported with %(count)d skipped entries.') % {
                    'count': len(warnings),
                })
            return redirect(reverse('dcim:devicetype_port_visualizer', kwargs={'pk': instance.pk}))

        return render(request, self.get_template_name(), {
            'object': instance,
            'form': form,
            'tab': self.tab,
        })


class LayoutIndexView(PermissionRequiredMixin, View):
    """
    A plain list of DeviceTypes that have at least one saved position, since every other entry point
    into this plugin is scoped to a specific DeviceType (reached via its own tab) - this is what the
    plugin's nav menu item links to, so the plugin has some presence in the nav beyond "go find a
    DeviceType page and look for a tab."
    """
    permission_required = 'dcim.view_devicetype'
    template_name = 'netbox_deviceportvisualizer/layout_index.html'

    def get(self, request):
        device_types = DeviceType.objects.filter(
            port_visualizer_positions__isnull=False,
        ).distinct().annotate(
            position_count=Count('port_visualizer_positions'),
        ).order_by('manufacturer__name', 'model')
        return render(request, self.template_name, {'device_types': device_types})
