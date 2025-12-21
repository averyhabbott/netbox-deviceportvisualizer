# NetBox Device Port Visualizer

A webpage that displays an interactive visualization of device types from NetBox.

## Features

- Select a device type from NetBox
- Visualize interfaces with different shapes based on type:
  - SFP/SFP+: Square
  - QSFP: Rectangle
  - 1GE: Rectangle (representing RJ-45)
- **Responsive Scaling**: Models automatically scale to fit the full browser window width while maintaining accurate proportions
- Drag interfaces to position them on the device
- Positions are saved per device type in localStorage
- **Save Layout**: Save interface positions to server as JSON files
- **Model Caching**: Automatically loads saved models when available,
  reducing NetBox API calls
- **Direct Model Access**: Load specific models via URL parameters
  (e.g., `?model=catalyst-c9300-24p`)
- **Direct Device and Interface Access**: Load device types and highlight
  interfaces via URL parameters (e.g., `?model=catalyst-c9300-24p&interface=GigabitEthernet1/0/1`)
- Highlight interfaces by name

**Behavior:**

- If the model exists: Loads instantly from the saved model
- If the model doesn't exist: Shows an error message, waits 3 seconds, then
  redirects to create a new model

## Direct Device and Interface Access

You can directly load a device type and highlight a specific interface using URL parameters:

```text
http://localhost:8002/?model=catalyst-c9300-24p&interface=GigabitEthernet0/1
```

**Parameters:**

- `model`: Device type slug (must match a device type in NetBox)
- `interface`: Interface name to highlight (must match an interface on the device)

**Behavior:**

- If both `model` and `interface` are provided: Loads the specified device type and highlights the interface
- If only `model` is provided: Loads the saved model with that slug
- Falls back to normal operation if device or interface is not found

## Setup

Follow the steps in install/Install steps.md

## Saved Layouts

Layout files are saved server-side as JSON with the format: `models/{device_type_slug}_layout.json`

Example: `models/catalyst-c9300-24p_layout.json`

The JSON contains:

- Device type information (id, model, slug)
- Interface list and positions (x, y coordinates)
- Timestamp of when the layout was saved

**Model Loading Priority:**

1. Check for existing server-side model file
2. If found, load interfaces and positions from file
3. If not found, query NetBox for interface templates

## Notes

- **Responsive Scaling**: Models scale to fit the full browser window width while maintaining accurate 19" rack width proportions and minimum visibility (20 pixels per inch)
- **Accurate Interface Scaling**: Interface objects are sized to actual physical dimensions and scale with the device
- **Interface Dimensions**: SFP (0.53"×0.33"), QSFP (0.722"×0.33"), RJ-45 (0.6"×0.4")
- **Dynamic Resizing**: Device models automatically adjust when the browser window is resized
- **Position Compatibility**: Saved positions are stored as relative coordinates and automatically scale with device size changes
- **Interface Shapes**: SFP/SFP+ = rectangle, QSFP = rectangle, 1GE = rectangle (RJ-45 representation)
