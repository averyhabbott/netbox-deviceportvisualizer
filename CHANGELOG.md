# Changelog

All notable changes to this project are documented in this file.

## [0.2.0] - 2026-07-26

Rebuilt the standalone Flask/JS tool as a native NetBox plugin.

### Added

- Port Visualizer tab on DeviceType detail pages, positioning interface/console/power/
  front-port/rear-port templates on the front/rear photo.
- Drag-and-drop placement with a configurable snap grid and plugin-scoped permissions.
- Deep-link highlighting via `?highlight=<name>`, with native jump buttons on DeviceType,
  Device, and Interface pages.
- Portable JSON layout export/import, keyed by component name rather than database ID.
- A migration script (`scripts/migrate_from_standalone.py`) to convert layouts saved by
  the old standalone tool into this plugin's import format.
- PNG export of a diagram at a fixed 1500px width, with a highlight glow matching the
  live diagram.
- Un-place support: drag a placed component back to the Unplaced tray, or clear an
  entire layout at once via a confirm-gated "Clear Model" button.

---

The entries below are retrofitted from the standalone tool's GitHub release notes
(the same repo this plugin will take over), preserved here for continuity.

## [0.1.3] - 2025-12-24 (standalone tool)

### Changed

- Improved install script.
- Improved install documentation.

## [0.1.2] - 2025-12-24 (standalone tool)

### Added

- Better handling of loading a device by slug.
- Highlighted interface is now appended to the URL for easy sharing.

### Fixed

- Interfaces with no defined type now load as the default type.

### Changed

- Removed redundant code used when loading a device and interface at the same time.

## [0.1.1] - 2025-12-24 (standalone tool)

### Added

- Manufacturer filter.
- Address bar now updates on model/interface selection for easy sharing.
- Page title reflects the loaded model.
- "Refresh Interface" button pulls in any interfaces added in NetBox since the model's
  last save.
- More granular x-axis snap-to-grid for interface placement.

### Fixed

- Loading a device image no longer clears the current highlight.
- An invalid model selection now correctly redirects to the base URL.
- RJ-45 console ports are now sized the same as other copper interfaces.

### Changed

- Highlight is now a simpler toggle.
- Replaced the numeric interface-name extractor with a name shortener, and re-centered
  shortened names.
- Slightly enlarged SFP/QSFP markers to better reflect reality.
- "Load Device by Slug" now behaves consistently with the other load paths.
- Removed deprecated code; general readability cleanup.

## [0.0.1] - 2025-12-21 (standalone tool)

Initial tagged version. No release notes were recorded on GitHub for this tag.
