# NetBox Device Port Visualizer

A webpage that displays an interactive visualization of physical interfaces for a given Device Type from NetBox.

## Features

- Select a NetBox-based Device Type
  - Filter by Manufacturer
- Can show Device Type Image under interfaces to aid in visualizing or hide it to reduce clutter
- Refresh Interfaces button pulls any new interface templates created in NetBox since the device model was last saved
- Visualize interfaces with different shapes based on type:
  - SFP/SFP+
  - QSFP
  - RJ-45
- Highlight interfaces by name
  - Interfaces on drawing have shortened names (e.g., Gi1/0/1 instead of GigabitEthernet1/0/1)
  - Drop-down selection menu still shows full name
- **Responsive Scaling**: Models automatically scale to fit the full browser window width while maintaining accurate proportions
- Drag interfaces to position them on the device
- **Save Layout**: Save interface positions to server as JSON files
- **Model Caching**: Automatically loads saved models when available,
  reducing NetBox API calls
- **Direct Model Access**: Load specific models via Device Type model slug parameter
  (e.g., `?model=catalyst-c9300-24p`)
- **Direct Model and Interface Access**: Load Device Type model and highlight
  a specific interface (e.g., `?model=catalyst-c9300-24p&interface=GigabitEthernet1/0/1`)

## Direct Device and Interface Access

You can directly load a device type and highlight a specific interface using URL parameters:

```text
http://localhost:8002/?model=catalyst-c9300-24p&interface=GigabitEthernet0/1
```

**Parameters:**

- `model`: Device Type model slug (must match a Device Type in NetBox)
- `interface`: Interface name to highlight (must match an Interface Template on the Device Type)

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
