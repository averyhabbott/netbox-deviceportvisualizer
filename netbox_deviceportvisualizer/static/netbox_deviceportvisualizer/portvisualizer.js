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
  // Existing, already-saved positions the user has dragged back to the tray (or cleared): positionId set.
  const pendingDeletes = new Set();

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

  // Factored out so a chip created dynamically (by unplaceMarker(), below) gets the same drag-to-place
  // behavior as one rendered server-side, without duplicating the dragstart payload logic.
  function attachChipDragHandlers(chip) {
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
  }

  root.querySelectorAll('.component-marker-chip').forEach(attachChipDragHandlers);

  function createChipElement(data) {
    const chip = document.createElement('div');
    chip.className = 'component-marker-chip';
    chip.draggable = true;
    chip.dataset.shape = data.shape;
    chip.dataset.contentType = data.contentType;
    chip.dataset.objectId = data.objectId;
    chip.dataset.name = data.name;
    chip.dataset.width = data.width;
    chip.dataset.height = data.height;
    chip.textContent = data.shortName;
    attachChipDragHandlers(chip);
    return chip;
  }

  // The tray shows "Every component has been placed." only when it was empty at page load - once
  // unplaceMarker() below is about to add a chip back to it, that placeholder text no longer applies.
  function unplacedTrayElement() {
    const tray = document.getElementById('dpv-unplaced-tray');
    if (tray) {
      const placeholder = tray.querySelector('p');
      if (placeholder) {
        placeholder.remove();
      }
    }
    return tray;
  }

  // Mirrors the sidebar Components list row for a component that's just been unplaced, so it reads
  // "Unplaced" immediately instead of staying stale (and click-selectable-but-silently-broken, since
  // its matching marker no longer exists in the DOM) until the next Save reloads the page.
  function syncListRowToUnplaced(contentType, objectId) {
    const row = root.querySelector(
      `.dpv-component-list-item[data-content-type="${contentType}"][data-object-id="${objectId}"]`
    );
    if (!row) {
      return;
    }
    row.classList.add('text-muted');
    row.classList.remove('dpv-selected');
    row.removeAttribute('data-face');
    const badge = row.querySelector('.badge');
    if (badge) {
      badge.classList.remove('text-uppercase');
      badge.textContent = 'Unplaced';
    }
  }

  // Un-place: removes the marker from the diagram and returns its chip to the tray, staged exactly
  // like a move or a create - nothing hits the server until Save. A marker with a positionId is an
  // existing saved position, queued for deletion on Save (and dropped from pendingUpdates, since
  // there's no point PATCHing a position that's about to be deleted). A marker with no positionId was
  // itself an unsaved pendingCreate from earlier this session, so unplacing it is a pure client-side
  // no-op against the server - just discard the pending create.
  function unplaceMarker(marker) {
    const contentType = marker.dataset.contentType;
    const objectId = marker.dataset.objectId;
    const key = componentKey(contentType, objectId);
    const positionId = marker.dataset.positionId;

    if (positionId) {
      pendingDeletes.add(positionId);
      pendingUpdates.delete(positionId);
    } else {
      pendingCreates.delete(key);
    }

    const labelSpan = marker.querySelector('.component-marker-label');
    const tray = unplacedTrayElement();
    if (tray) {
      tray.appendChild(createChipElement({
        shape: marker.dataset.shape,
        contentType,
        objectId,
        name: marker.dataset.name,
        shortName: labelSpan ? labelSpan.textContent : marker.dataset.name,
        width: parseFloat(marker.style.width),
        height: parseFloat(marker.style.height),
      }));
    }

    marker.remove();
    syncListRowToUnplaced(contentType, objectId);
    markDirty();
  }

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

  // Dropping an already-placed marker back onto the tray un-places it. Which action a drop triggers
  // (move vs. unplace) is determined entirely by which element it lands on - this reuses the same
  // 'move' dragstart payload markers already send, no new payload shape needed.
  const unplacedTray = document.getElementById('dpv-unplaced-tray');
  if (unplacedTray) {
    unplacedTray.addEventListener('dragover', (event) => event.preventDefault());
    unplacedTray.addEventListener('drop', (event) => {
      event.preventDefault();
      const raw = event.dataTransfer.getData('application/json');
      if (!raw) {
        return;
      }
      const payload = JSON.parse(raw);
      if (payload.kind !== 'move') {
        return;
      }
      const marker = root.querySelector(
        `.component-marker[data-content-type="${payload.contentType}"][data-object-id="${payload.objectId}"]`
      );
      if (marker) {
        unplaceMarker(marker);
      }
    });
  }

  const clearModelButton = document.getElementById('dpv-clear-model');
  if (clearModelButton) {
    // Staged like every other change here - Clear Model queues a delete for everything currently
    // placed, same as dragging each one to the tray individually, and still waits for Save to actually
    // hit the server. The confirm() is the one exception to "no interruptions until Save": clearing
    // every placement on the device at once is a large enough blast radius to deserve a speed bump,
    // even though it's still undoable by simply not saving.
    clearModelButton.addEventListener('click', () => {
      const placedMarkers = Array.from(root.querySelectorAll('.component-marker'));
      if (!placedMarkers.length) {
        return;
      }
      if (!window.confirm('Remove every placed component from this diagram? This cannot be undone once saved.')) {
        return;
      }
      placedMarkers.forEach(unplaceMarker);
    });
  }

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
    const deletes = Array.from(pendingDeletes).map((positionId) => ({ id: Number(positionId) }));

    try {
      if (deletes.length) {
        const response = await fetch(apiUrl, { method: 'DELETE', headers, body: JSON.stringify(deletes) });
        if (!response.ok) {
          throw new Error(`Failed to remove unplaced positions (${response.status}).`);
        }
      }
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
  // A fixed target, not a minimum: this deliberately downscales an already-large source photo (keeping
  // exported file size predictable) just as much as it upscales a small one. Upscaling can't add detail
  // to the photo itself - it'll look softer the more it's stretched - but every marker box/label is
  // drawn fresh at the canvas's own resolution, so those come out crisp regardless of the source photo.
  const TARGET_EXPORT_WIDTH = 1500;

  function exportPng() {
    const activePanel = root.querySelector('.dpv-face-panel:not(.d-none)');
    if (!activePanel) {
      return;
    }
    const img = activePanel.querySelector('.dpv-photo');
    const rect = activePanel.getBoundingClientRect();
    const baseWidth = img ? img.naturalWidth : rect.width;
    const baseHeight = img ? img.naturalHeight : rect.height;
    const scale = TARGET_EXPORT_WIDTH / baseWidth;
    const canvas = document.createElement('canvas');
    canvas.width = TARGET_EXPORT_WIDTH;
    canvas.height = Math.round(baseHeight * scale);
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

        // The live CSS's box-shadow glow (the resting frame of the pulse animation - a still image
        // obviously can't pulse) is what actually makes a highlighted/selected port "pop"; the fill/
        // border colors alone already matched CSS before this, so a flat strokeRect without a shadow
        // read as noticeably weaker than the on-screen version despite the identical colors.
        if (emphasized) {
          ctx.save();
          ctx.shadowColor = borderColor;
          ctx.shadowBlur = canvas.width / 75;
        }
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = Math.max(2, canvas.width / 400);
        ctx.strokeRect(x, y, w, h);
        if (emphasized) {
          ctx.restore();
        }

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
