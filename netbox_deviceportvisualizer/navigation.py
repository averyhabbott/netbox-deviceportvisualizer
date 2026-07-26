from netbox.plugins import PluginMenuItem

menu_items = (
    PluginMenuItem(
        link='plugins:netbox_deviceportvisualizer:layout_index',
        link_text='Port Visualizer Layouts',
        permissions=['dcim.view_devicetype'],
    ),
)
