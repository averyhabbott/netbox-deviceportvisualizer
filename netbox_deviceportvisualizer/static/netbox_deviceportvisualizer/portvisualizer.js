/*
 * All scene composition (marker size/shape/label) happens server-side in the Django template - this
 * file only handles things that genuinely require a live browser: switching between front/rear,
 * dragging markers into place, batching the save, and the optional PNG export. It never computes a
 * component's size or NetBox `type`; it only ever moves DOM nodes that already have the right
 * dimensions baked in from the server render.
 */
(function () {
  const root = document.getElementById('netbox-dpv');
  if (!root) {
    return;
  }

  const editable = root.dataset.editable === 'true';
  const deviceTypeId = root.dataset.deviceTypeId;
  const apiUrl = root.dataset.apiUrl;
  const csrfInput = root.querySelector('input[name=csrfmiddlewaretoken]');
  const csrfToken = csrfInput ? csrfInput.value : '';

  const facePanels = root.querySelectorAll('.dpv-face-panel');
  const faceButtons = root.querySelectorAll('.face-toggle');

  function showFace(face) {
    facePanels.forEach((panel) => panel.classList.toggle('d-none', panel.dataset.face !== face));
    faceButtons.forEach((button) => button.classList.toggle('active', button.dataset.face === face));
  }

  faceButtons.forEach((button) => {
    button.addEventListener('click', () => showFace(button.dataset.face));
  });

  // Photo/Outline is purely a display preference - it never persists and always starts on "Photo" (the
  // data-image-mode the template already renders), so a busy or missing photo can be set aside without
  // that choice surviving a reload or affecting anyone else looking at the same layout.
  const imageModeButtons = root.querySelectorAll('.image-mode-toggle');

  function setImageMode(mode) {
    facePanels.forEach((panel) => { panel.dataset.imageMode = mode; });
    imageModeButtons.forEach((button) => button.classList.toggle('active', button.dataset.imageMode === mode));
  }

  imageModeButtons.forEach((button) => {
    button.addEventListener('click', () => setImageMode(button.dataset.imageMode));
  });

  // Labels on/off is the same kind of client-side-only display preference as Photo/Outline - it never
  // persists and always starts on "off" (the data-labels-mode the template already renders), since a
  // device with dozens of ports would otherwise open to a wall of overlapping text.
  const labelsModeButtons = root.querySelectorAll('.labels-mode-toggle');

  function setLabelsMode(mode) {
    root.dataset.labelsMode = mode;
    labelsModeButtons.forEach((button) => button.classList.toggle('active', button.dataset.labelsMode === mode));
  }

  labelsModeButtons.forEach((button) => {
    button.addEventListener('click', () => setLabelsMode(button.dataset.labelsMode));
  });

  // Click-to-select: a plain click (as opposed to a drag) never fires dragstart, so this needs no
  // separate guard against an in-progress drag. Delegated on the root so it covers markers created
  // later by handleCreateDrop() too, with no need to attach a handler to each one individually.
  // A selection can span two elements at once (a marker and its matching row in the component list),
  // so this clears every currently-selected element, not just the first one found.
  function clearSelection() {
    root.querySelectorAll('.dpv-selected').forEach((element) => element.classList.remove('dpv-selected'));
  }

  root.addEventListener('click', (event) => {
    const selectable = event.target.closest('.component-marker, .component-marker-chip');
    if (!selectable) {
      clearSelection();
      return;
    }
    const alreadySelected = selectable.classList.contains('dpv-selected');
    clearSelection();
    if (!alreadySelected) {
      selectable.classList.add('dpv-selected');
    }
  });

  // Component list: lets you find a component by name and see it picked out on the diagram (switching
  // face first if it's placed on the other one) instead of having to spot it visually among dozens of
  // markers. stopPropagation keeps this from also triggering the root click listener above, which
  // would otherwise treat this as a click on empty space and immediately clear the selection it just made.
  const componentListItems = root.querySelectorAll('.dpv-component-list-item');
  componentListItems.forEach((item) => {
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      const target = root.querySelector(
        `.component-marker[data-content-type="${item.dataset.contentType}"][data-object-id="${item.dataset.objectId}"],`
        + `.component-marker-chip[data-content-type="${item.dataset.contentType}"][data-object-id="${item.dataset.objectId}"]`
      );
      if (!target) {
        return;
      }
      if (item.dataset.face) {
        showFace(item.dataset.face);
      }
      clearSelection();
      target.classList.add('dpv-selected');
      item.classList.add('dpv-selected');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });

  // If a component was highlighted server-side (via ?highlight=<name>), make sure its face is the
  // one showing and scroll to it - the highlight itself (the .dpv-highlighted class) was already
  // applied server-side, this is just the client-side "make sure it's actually visible" step.
  const highlighted = root.querySelector('.component-marker.dpv-highlighted');
  if (highlighted) {
    showFace(highlighted.dataset.face);
    highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  setUpPngExport();

  if (!editable) {
    return;
  }

  const saveButton = document.getElementById('dpv-save');
  // Existing, already-saved positions the user has moved: positionId -> {x, y, face}.
  const pendingUpdates = new Map();
  // Components dragged out of the tray this session, not yet saved: contentType|objectId -> {..., x, y, face}.
  const pendingCreates = new Map();

  function markDirty() {
    if (saveButton) {
      saveButton.disabled = false;
    }
  }

  // Grid coarseness is admin-configurable (PLUGINS_CONFIG snap_x/snap_y, see README) since how fine a
  // grid actually reads as "snapping" depends on real photo resolution, not one fixed default.
  const snapStepX = parseFloat(root.dataset.snapX) || 0.25;
  const snapStepY = parseFloat(root.dataset.snapY) || 2.5;
  const snapX = (pct) => Math.round(pct / snapStepX) * snapStepX;
  const snapY = (pct) => Math.round(pct / snapStepY) * snapStepY;
  const clampPct = (value) => Math.min(100, Math.max(0, value));
  const componentKey = (contentType, objectId) => `${contentType}|${objectId}`;

  function attachMarkerDragHandlers(marker) {
    marker.addEventListener('dragstart', (event) => {
      const rect = marker.getBoundingClientRect();
      event.dataTransfer.setData('application/json', JSON.stringify({
        kind: 'move',
        positionId: marker.dataset.positionId || '',
        contentType: marker.dataset.contentType,
        objectId: marker.dataset.objectId,
        grabOffsetX: event.clientX - rect.left,
        grabOffsetY: event.clientY - rect.top,
      }));
      marker.classList.add('dpv-dragging');
    });
    marker.addEventListener('dragend', () => marker.classList.remove('dpv-dragging'));
  }

  root.querySelectorAll('.component-marker').forEach(attachMarkerDragHandlers);

  root.querySelectorAll('.component-marker-chip').forEach((chip) => {
    chip.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('application/json', JSON.stringify({
        kind: 'create',
        contentType: chip.dataset.contentType,
        objectId: chip.dataset.objectId,
        name: chip.dataset.name,
        width: parseFloat(chip.dataset.width),
        height: parseFloat(chip.dataset.height),
      }));
    });
  });

  function handleMoveDrop(payload, panel, rect, event) {
    const marker = root.querySelector(
      `.component-marker[data-content-type="${payload.contentType}"][data-object-id="${payload.objectId}"]`
    );
    if (!marker) {
      return;
    }

    const left = clampPct(((event.clientX - payload.grabOffsetX - rect.left) / rect.width) * 100);
    const top = clampPct(((event.clientY - payload.grabOffsetY - rect.top) / rect.height) * 100);
    const x = snapX(left);
    const y = snapY(top);
    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.dataset.face = panel.dataset.face;

    const key = componentKey(payload.contentType, payload.objectId);
    if (payload.positionId) {
      pendingUpdates.set(payload.positionId, { x, y, face: panel.dataset.face });
    } else if (pendingCreates.has(key)) {
      // This marker was placed from the tray earlier in the same edit session and hasn't been
      // saved yet - update the pending create in place instead of treating it as an existing position.
      const pending = pendingCreates.get(key);
      pendingCreates.set(key, { ...pending, x, y, face: panel.dataset.face });
    }
    markDirty();
  }

  function handleCreateDrop(payload, panel, rect, event) {
    const centerLeft = ((event.clientX - rect.left) / rect.width) * 100;
    const centerTop = ((event.clientY - rect.top) / rect.height) * 100;
    const x = snapX(clampPct(centerLeft - payload.width / 2));
    const y = snapY(clampPct(centerTop - payload.height / 2));

    const marker = document.createElement('div');
    marker.className = 'component-marker';
    marker.draggable = true;
    marker.title = payload.name;
    marker.dataset.contentType = payload.contentType;
    marker.dataset.objectId = payload.objectId;
    marker.dataset.name = payload.name;
    marker.dataset.face = panel.dataset.face;
    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.style.width = `${payload.width}%`;
    marker.style.height = `${payload.height}%`;

    const label = document.createElement('span');
    label.className = 'component-marker-label';
    label.textContent = payload.name;
    marker.appendChild(label);

    attachMarkerDragHandlers(marker);
    panel.querySelector('.dpv-marker-layer').appendChild(marker);

    const chip = root.querySelector(
      `.component-marker-chip[data-content-type="${payload.contentType}"][data-object-id="${payload.objectId}"]`
    );
    if (chip) {
      chip.remove();
    }

    pendingCreates.set(componentKey(payload.contentType, payload.objectId), {
      contentType: payload.contentType,
      objectId: payload.objectId,
      face: panel.dataset.face,
      x,
      y,
    });
    markDirty();
  }

  facePanels.forEach((panel) => {
    panel.addEventListener('dragover', (event) => event.preventDefault());
    panel.addEventListener('drop', (event) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData('application/json');
      if (!raw) {
        return;
      }
      const payload = JSON.parse(raw);
      const rect = panel.getBoundingClientRect();

      if (payload.kind === 'move') {
        handleMoveDrop(payload, panel, rect, event);
      } else if (payload.kind === 'create') {
        handleCreateDrop(payload, panel, rect, event);
      }
    });
  });

  async function save() {
    saveButton.disabled = true;
    const headers = { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken };

    const updates = Array.from(pendingUpdates.entries()).map(([positionId, change]) => ({
      id: Number(positionId),
      face: change.face,
      x: change.x,
      y: change.y,
    }));
    const creates = Array.from(pendingCreates.values()).map((item) => ({
      device_type: Number(deviceTypeId),
      content_type: item.contentType,
      object_id: Number(item.objectId),
      face: item.face,
      x: item.x,
      y: item.y,
    }));

    try {
      if (updates.length) {
        const response = await fetch(apiUrl, { method: 'PATCH', headers, body: JSON.stringify(updates) });
        if (!response.ok) {
          throw new Error(`Failed to save moved positions (${response.status}).`);
        }
      }
      if (creates.length) {
        const response = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(creates) });
        if (!response.ok) {
          throw new Error(`Failed to save new positions (${response.status}).`);
        }
      }
      window.location.reload();
    } catch (error) {
      saveButton.disabled = false;
      window.alert('Failed to save the layout. See the browser console for details.');
      console.error(error);
    }
  }

  if (saveButton) {
    saveButton.addEventListener('click', save);
  }

  function setUpPngExport() {
    const exportPngButton = document.getElementById('dpv-export-png');
    if (!exportPngButton) {
      return;
    }
    exportPngButton.addEventListener('click', exportPng);
  }

  // Mirrors portvisualizer.css's [data-shape="..."] border colors and the base marker fill, so the
  // exported PNG's un-emphasized markers look like their on-screen counterparts instead of a plain
  // black outline with no fill.
  const SHAPE_BORDER_COLORS = {
    qsfp: '#6f42c1',
    sfp: '#0d6efd',
    copper: '#198754',
    console: '#fd7e14',
    power: '#dc3545',
    'patch-fiber': '#0dcaf0',
    'patch-copper': '#20c997',
  };
  const DEFAULT_BORDER_COLOR = 'rgba(0, 0, 0, 0.6)';
  const BASE_FILL_COLOR = 'rgba(255, 255, 255, 0.55)';

  function exportPng() {
    const activePanel = root.querySelector('.dpv-face-panel:not(.d-none)');
    if (!activePanel) {
      return;
    }
    const img = activePanel.querySelector('.dpv-photo');
    const rect = activePanel.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = img ? img.naturalWidth : Math.round(rect.width);
    canvas.height = img ? img.naturalHeight : Math.round(rect.height);
    const ctx = canvas.getContext('2d');

    const drawMarkersAndDownload = () => {
      activePanel.querySelectorAll('.component-marker').forEach((marker) => {
        const x = (parseFloat(marker.style.left) / 100) * canvas.width;
        const y = (parseFloat(marker.style.top) / 100) * canvas.height;
        const w = (parseFloat(marker.style.width) / 100) * canvas.width;
        const h = (parseFloat(marker.style.height) / 100) * canvas.height;
        // Match the on-screen appearance as closely as a static image can: every marker gets the same
        // translucent fill and shape-colored border it has on the diagram, and a highlighted/selected
        // one swaps to its own solid-ish color, same as SHAPE_BORDER_COLORS/CSS below.
        const highlighted = marker.classList.contains('dpv-highlighted');
        const selected = marker.classList.contains('dpv-selected');
        const emphasized = highlighted || selected;

        let borderColor = SHAPE_BORDER_COLORS[marker.dataset.shape] || DEFAULT_BORDER_COLOR;
        let fillColor = BASE_FILL_COLOR;
        if (highlighted) {
          borderColor = '#ff9800';
          fillColor = 'rgba(255, 152, 0, 0.6)';
        } else if (selected) {
          borderColor = '#0dcaf0';
          fillColor = 'rgba(13, 202, 240, 0.6)';
        }

        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = Math.max(2, canvas.width / 400);
        ctx.strokeRect(x, y, w, h);

        // Only label the marker(s) the export is actually meant to call out - drawing every marker's
        // name onto a photo with dozens of ports produces the same unreadable clutter the on-screen
        // diagram had before it moved to hover/select-revealed labels. Pulled from the label span's own
        // text (the server-computed short name), not the marker's full name, to match what's on screen.
        if (emphasized) {
          const labelSpan = marker.querySelector('.component-marker-label');
          const text = (labelSpan ? labelSpan.textContent : marker.dataset.name || '').trim();
          const fontSize = Math.max(12, canvas.width / 90);
          const paddingX = fontSize * 0.4;
          const paddingY = fontSize * 0.25;
          const centerX = x + w / 2;
          const centerY = y + h / 2;

          ctx.font = `600 ${fontSize}px sans-serif`;
          const textWidth = ctx.measureText(text).width;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
          ctx.fillRect(
            centerX - textWidth / 2 - paddingX,
            centerY - fontSize / 2 - paddingY,
            textWidth + paddingX * 2,
            fontSize + paddingY * 2
          );
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, centerX, centerY);
        }
      });

      const link = document.createElement('a');
      link.download = 'port-visualizer.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

    if (!img) {
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawMarkersAndDownload();
      return;
    }

    if (img.complete) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawMarkersAndDownload();
    } else {
      img.addEventListener('load', () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        drawMarkersAndDownload();
      });
    }
  }
})();
