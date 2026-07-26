from netbox.plugins import PluginTemplateExtension


class DeviceTypeVisualizerButton(PluginTemplateExtension):
    models = ['dcim.devicetype']

    def buttons(self):
        return self.render('netbox_deviceportvisualizer/inc/devicetype_button.html')


class DeviceVisualizerButton(PluginTemplateExtension):
    models = ['dcim.device']

    def buttons(self):
        return self.render('netbox_deviceportvisualizer/inc/device_button.html')


class InterfaceVisualizerButton(PluginTemplateExtension):
    models = ['dcim.interface']

    def buttons(self):
        return self.render('netbox_deviceportvisualizer/inc/interface_button.html')


template_extensions = [DeviceTypeVisualizerButton, DeviceVisualizerButton, InterfaceVisualizerButton]
