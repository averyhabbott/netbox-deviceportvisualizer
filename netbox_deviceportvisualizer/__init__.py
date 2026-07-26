from netbox.plugins import PluginConfig

__version__ = '0.2.0'


class DevicePortVisualizerConfig(PluginConfig):
    name = 'netbox_deviceportvisualizer'
    verbose_name = 'Device Port Visualizer'
    description = (
        "Position DeviceType component templates on front/rear photos, and highlight a "
        "specific port to share as a screenshot."
    )
    version = __version__
    author = 'Avery Abbott'
    author_email = 'averyhabbott@yahoo.com'
    base_url = 'device-port-visualizer'
    min_version = '4.5.0'
    max_version = '4.6.99'
    default_settings = {
        # Drag snap grid, as a percentage of the photo's own width/height. The right coarseness depends
        # on how much real detail a given instance's device photos have, so it's admin-configurable via
        # PLUGINS_CONFIG rather than a fixed constant - see README.
        'snap_x': 0.25,
        'snap_y': 2.5,
    }

    def ready(self):
        super().ready()
        # super().ready() already auto-imports navigation.menu_items and template_content.template_extensions
        # (their default resource paths), so only signals and views need importing explicitly here:
        # `views` registers its DeviceType tab/export/import views via @register_model_view, which the
        # dcim app's own urls.py reads from a shared registry when it builds its URLconf. That import
        # must happen during app startup, not lazily on first use, to guarantee it runs before
        # dcim/urls.py evaluates get_model_urls('dcim', 'devicetype').
        from . import signals, views  # noqa: F401


config = DevicePortVisualizerConfig
