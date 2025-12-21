let currentDeviceType = null;
let interfaces = [];
let positions = {};
let draggedElement = null;
let offset = {x: 0, y: 0};

document.addEventListener('DOMContentLoaded', async () => {
    await loadDeviceTypes();
    document.getElementById('loadButton').addEventListener('click', loadDevice);
    document.getElementById('saveButton').addEventListener('click', saveLayout);
    document.getElementById('resetButton').addEventListener('click', resetLayout);
    document.getElementById('highlightButton').addEventListener('click', highlightInterface);
    document.getElementById('clearHighlightButton').addEventListener('click', clearHighlight);
    document.getElementById('refreshInterfacesButton').addEventListener('click', async () => {
        // Only refresh if there is a local model
        if (currentDeviceType && Object.keys(positions).length > 0) {
            await refreshInterfaces();
        } else {
            await loadDevice();
        }
    });
    document.getElementById('toggleImagesButton').addEventListener('click', toggleDeviceImages);

    // Handle window resize to rescale the device
    window.addEventListener('resize', () => {
        if (currentDeviceType) {
            drawDevice();
        }
    });

    // Check for URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const modelSlug = urlParams.get('model');
    const interfaceName = urlParams.get('interface');
    
    if (modelSlug && interfaceName) {
        // Load device and highlight interface
        loadDeviceAndHighlightInterface(modelSlug, interfaceName);
    } else if (modelSlug) {
        // Load saved model by slug
        loadModelBySlug(modelSlug);
    }
});

function getHeaders() {
    const headers = {
        'Authorization': `Token ${apiKey}`,
        'Content-Type': 'application/json'
    };
    console.log('Generated headers:', headers);
    return headers;
}

async function loadDeviceTypes() {
    try {
        const headers = getHeaders();
        console.log('Fetching device types with headers:', headers);
        const response = await fetch(`${netboxUrl}/dcim/device-types/?limit=0`, {
            headers: headers
        });
        console.log('Response status:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        console.log('Data received:', data);
        const select = document.getElementById('deviceTypeSelect');
        select.innerHTML = '<option value="">Select a device type</option>';
        if (data.results && data.results.length > 0) {
            data.results.forEach(dt => {
                const option = document.createElement('option');
                option.value = dt.id;
                option.textContent = dt.model;
                select.appendChild(option);
            });
        } else {
            select.innerHTML = '<option value="">No device types found</option>';
        }
    } catch (error) {
        console.error('Error loading device types:', error);
        const select = document.getElementById('deviceTypeSelect');
        select.innerHTML = '<option value="">Error loading device types</option>';
    }
}

async function loadDevice() {
    const deviceTypeId = document.getElementById('deviceTypeSelect').value;
    if (!deviceTypeId) return;

    try {
        const headers = getHeaders();

        // First, try to load existing model
        const deviceTypeResponse = await fetch(`${netboxUrl}/dcim/device-types/${deviceTypeId}/`, { headers });
        currentDeviceType = await deviceTypeResponse.json();

        // Check if model exists on server
        try {
            const modelResponse = await fetch(`api/load-model/${currentDeviceType.slug}`);
            if (modelResponse.ok) {
                const modelData = await modelResponse.json();
                positions = modelData.positions || {};
                interfaces = modelData.interfaces || [];
                console.log('Loaded model from server');
            } else {
                // Model doesn't exist, load from NetBox
                console.log('Model not found on server, loading from NetBox');
                await loadInterfacesFromNetBox(deviceTypeId, headers);
            }
        } catch (error) {
            console.log('Error checking for existing model, loading from NetBox:', error);
            await loadInterfacesFromNetBox(deviceTypeId, headers);
        }

        drawDevice();
        populateHighlightDropdown();
        
        // Load device images as backgrounds if they are currently enabled
        const frontSvg = document.getElementById('frontSvg');
        if (frontSvg.style.backgroundImage && frontSvg.style.backgroundImage !== 'none') {
            loadDeviceImagesAsBackgrounds();
        }
    } catch (error) {
        console.error('Error loading device:', error);
    }
}

async function loadDeviceAndHighlightInterface(deviceSlug, interfaceName) {
    try {        
        // Find the device type with matching slug
        const headers = getHeaders();
        try {
            const deviceTypeResponse = await fetch(`${netboxUrl}/dcim/device-types/?slug=${deviceSlug}`, { headers });
            const deviceTypeData = await deviceTypeResponse.json();
            deviceType = deviceTypeData.results[0];
        } catch (error) {
            console.error(`Error fetching device type with slug '${deviceSlug}':`, error);
            return;
        }
        
        // Set the device type in the selector
        const select = document.getElementById('deviceTypeSelect');
        select.value = deviceType.id;
        
        // Load the device (this will populate interfaces and draw the device)
        await loadDevice();
        
        // Wait a bit for the device to load, then highlight the interface
        setTimeout(() => {
            const selectElement = document.getElementById('highlightSelect');
            selectElement.value = interfaceName;
            highlightInterface();
        }, 500); // Small delay to ensure everything is loaded
        
    } catch (error) {
        console.error('Error loading device and highlighting interface:', error);
    }
}

async function loadInterfacesFromNetBox(deviceTypeId, headers) {
    const interfacesResponse = await fetch(`${netboxUrl}/dcim/interface-templates/?device_type_id=${deviceTypeId}&type__n=virtual&limit=0&mgmt_only=false`, { headers });
    const interfacesData = await interfacesResponse.json();
    interfaces = interfacesData.results;

    
    // Now, re-run the query with "mgmt_only" set to true, and extend interfaces with the results
    const mgmtOnlyInterfacesResponse = await fetch(`${netboxUrl}/dcim/interface-templates/?device_type_id=${deviceTypeId}&type__n=virtual&limit=0&mgmt_only=true`, { headers });
    const mgmtOnlyInterfacesData = await mgmtOnlyInterfacesResponse.json();
    interfaces.push(...mgmtOnlyInterfacesData.results);
    
    // Last, grab the console ports
    const consolePortsResponse = await fetch(`${netboxUrl}/dcim/console-port-templates/?device_type_id=${deviceTypeId}`, { headers });
    const consolePortsData = await consolePortsResponse.json();
    interfaces.push(...consolePortsData.results);
}

// Refresh Interfaces logic
async function refreshInterfaces() {
    if (!currentDeviceType) return;
    const deviceTypeId = currentDeviceType.id;
    const headers = getHeaders();

    // Try to load existing model
    let modelExists = false;
    let savedPositions = {};
    try {
        const modelResponse = await fetch(`api/load-model/${currentDeviceType.slug}`);
        if (modelResponse.ok) {
            const modelData = await modelResponse.json();
            savedPositions = modelData.positions || {};
            modelExists = true;
        }
    } catch (e) {
        // Model does not exist or error
        modelExists = false;
    }

    // Always reload interfaces from NetBox
    await loadInterfacesFromNetBox(deviceTypeId, headers);

    if (modelExists) {
        // Preserve placement of any existing interfaces
        // Only keep positions for interfaces that still exist
        const newIds = new Set(interfaces.map(i => i.id));
        positions = {};
        for (const [id, pos] of Object.entries(savedPositions)) {
            if (newIds.has(Number(id)) || newIds.has(id)) {
                positions[id] = pos;
            }
        }
    } else {
        // No model: reset all positions
        positions = {};
    }

    drawDevice();
    populateHighlightDropdown();
}

function drawDevice() {
    const frontSvg = document.getElementById('frontSvg');
    const rearSvg = document.getElementById('rearSvg');

    // Calculate actual device dimensions
    const rackUnitHeight = 1.75; // inches
    const rackWidth = 19; // inches
    const deviceHeight = (currentDeviceType.u_height || 1) * rackUnitHeight;

    // Scale to fit browser window width with minimum size for visibility
    // Account for body margins and container padding/border
    const bodyMargins = 40; // 20px left + 20px right body margins
    const containerPadding = 2; // 1px border on each side
    const availableWidth = window.innerWidth - bodyMargins - containerPadding;
    const minPixelsPerInch = 20; // Minimum scale for interface visibility
    const idealPixelsPerInch = availableWidth / rackWidth;
    const pixelsPerInch = Math.max(idealPixelsPerInch, minPixelsPerInch);
    const svgWidth = (idealPixelsPerInch >= minPixelsPerInch) ? availableWidth : rackWidth * pixelsPerInch;
    const svgHeight = deviceHeight * pixelsPerInch;

    // Update both SVG dimensions
    frontSvg.setAttribute('width', svgWidth);
    frontSvg.setAttribute('height', svgHeight);
    rearSvg.setAttribute('width', svgWidth);
    rearSvg.setAttribute('height', svgHeight);

    // Clear existing content
    frontSvg.innerHTML = '';
    rearSvg.innerHTML = '';

    // Draw device body on both SVGs
    const frontDeviceBody = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    frontDeviceBody.setAttribute('x', 0);
    frontDeviceBody.setAttribute('y', 0);
    frontDeviceBody.setAttribute('width', svgWidth);
    frontDeviceBody.setAttribute('height', svgHeight);
    frontDeviceBody.classList.add('device-body');
    // Make device body transparent if background image is set
    if (frontSvg.style.backgroundImage && frontSvg.style.backgroundImage !== 'none') {
        frontDeviceBody.style.fill = 'transparent';
    }
    frontSvg.appendChild(frontDeviceBody);

    const rearDeviceBody = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rearDeviceBody.setAttribute('x', 0);
    rearDeviceBody.setAttribute('y', 0);
    rearDeviceBody.setAttribute('width', svgWidth);
    rearDeviceBody.setAttribute('height', svgHeight);
    rearDeviceBody.classList.add('device-body');
    // Make device body transparent if background image is set
    if (rearSvg.style.backgroundImage && rearSvg.style.backgroundImage !== 'none') {
        rearDeviceBody.style.fill = 'transparent';
    }
    rearSvg.appendChild(rearDeviceBody);

    // Add dimension labels to front view
    const dimensionsText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    dimensionsText.setAttribute('x', 10);
    dimensionsText.setAttribute('y', 20);
    dimensionsText.classList.add('dimensions-text');
    dimensionsText.textContent = `${rackWidth}" × ${deviceHeight}" (${currentDeviceType.u_height}U)`;
    frontSvg.appendChild(dimensionsText);

    // Draw interfaces on appropriate side
    interfaces.forEach(iface => {
        const posData = positions[iface.id] || getDefaultPosition(iface, svgWidth, svgHeight);
        const side = posData.side || 'front'; // Default to front for backward compatibility
        const svg = side === 'front' ? frontSvg : rearSvg;
        
        // Convert relative positions (0-1) to absolute pixels
        const absolutePos = {
            x: posData.x * svgWidth,
            y: posData.y * svgHeight
        };
        drawInterface(svg, iface, absolutePos.x, absolutePos.y, pixelsPerInch);
    });
}

function getDefaultPosition(iface, svgWidth, svgHeight) {
    // Position interfaces relative to actual device dimensions (return 0-1 coordinates)
    // Leave some margin from edges
    const margin = 40; // pixels
    const availableWidth = svgWidth - (margin * 2);
    const availableHeight = svgHeight - (margin * 2);

    // Simple grid placement within the device boundaries
    const index = interfaces.indexOf(iface);
    const rows = currentDeviceType.u_height * 2;
    const cols = Math.floor(interfaces.length / rows);
    const col = (currentDeviceType.manufacturer.slug === 'brocade' ? ((Math.floor(index / 8) * 4) + index % 4) % cols : Math.floor(index / 2) % cols);
    const row = (currentDeviceType.manufacturer.slug === 'brocade' ? (Math.floor(index / 4) % 2) + 2 * (Math.floor(index / (2 * cols))) : index % rows);

    // Calculate relative positions (0-1 range)
    const rawRelativeX = margin / svgWidth + (col / cols) * (availableWidth / svgWidth);
    const rawRelativeY = margin / svgHeight + (row / rows) * (availableHeight / svgHeight);
    
    // Snap to grid: X snaps to 0.25% increments, Y snaps to 5% increments
    const relativeX = Math.round(rawRelativeX * 400) / 400; // 0.25% increments
    const relativeY = Math.round(rawRelativeY * 20) / 20; // 5% increments

    return {x: relativeX, y: relativeY, side: 'front'}; // Default to front
}

function drawInterface(svg, iface, x, y, pixelsPerInch) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.classList.add('interface');
    g.setAttribute('data-id', iface.id);
    g.setAttribute('data-name', iface.name);

    let shape = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    let width, height;
    const type = iface.type.value || '';
    
    // Use actual physical dimensions scaled by pixels per inch
    // SFP Types:
    const sfpTypes = ['10gbase-x-sfpp', '25gbase-x-sfp28', '64gfc-sfpp', '64gfc-sfpdd', '1000base-x-sfp', '10gbase-x-xfp'];
    const qsfpTypes = ['100gbase-x-qsfp28', 'cisco-stackwise'];
    const copperTypes = ['1000base-t', '1000base-tx', '10gbase-t', '100base-tx', 'rj-45'];
    if (sfpTypes.includes(type)) {
        // SFP cage: 0.53" × 0.33"
        width = 0.56 * pixelsPerInch;
        height = 0.35 * pixelsPerInch;
    } else if (qsfpTypes.includes(type)) {
        // QSFP cage: 0.722" × 0.33"
        width = 0.74 * pixelsPerInch;
        height = 0.35 * pixelsPerInch;
    } else if (copperTypes.includes(type)) {
        // RJ-45 approximate: 0.6" × 0.4"
        width = 0.6 * pixelsPerInch;
        height = 0.4 * pixelsPerInch;
    } else {
        // Default size for unknown types
        width = 0.5 * pixelsPerInch;
        height = 0.4 * pixelsPerInch;
    }

    shape.setAttribute('width', width);
    shape.setAttribute('height', height);
    shape.setAttribute('x', x);
    shape.setAttribute('y', y);
    g.appendChild(shape);

    // Label
    const label = extractNumeric(iface.name);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', x + width/2);
    text.setAttribute('y', y + height + 10);
    text.classList.add('text');
    text.textContent = label;
    g.appendChild(text);

    // Drag events
    g.addEventListener('mousedown', startDrag);
    g.addEventListener('click', handleInterfaceClick);
    svg.appendChild(g);
}

function extractNumeric(name) {
    // Extract numeric part from names like 'Et1' or 'GigabitEthernet1/0/1'
    // Only matches 'Et\d' or 'Gigabit.*' patterns
    
    // Match 'Gigabit*' pattern (e.g., GigabitEthernet1/0/1 -> 1/0/1)
    const gigabitMatch = name.match(/Gigabit[a-zA-Z]*(\d+(?:\/\d+)*)/);
    if (gigabitMatch) {
        return gigabitMatch[1];
    }
    
    // Match 'Et\d' pattern (e.g., Et1 -> 1)
    const etMatch = name.match(/Et(\d+(?:\/\d+)*)/);
    if (etMatch) {
        return etMatch[1];
    }
    
    return name;
}

function startDrag(event) {
    draggedElement = event.currentTarget;
    const svg = draggedElement.closest('svg');
    const svgRect = svg.getBoundingClientRect();
    const shape = draggedElement.querySelector('rect');
    const x = parseFloat(shape.getAttribute('x'));
    const y = parseFloat(shape.getAttribute('y'));
    offset.x = event.clientX - (svgRect.left + x);
    offset.y = event.clientY - (svgRect.top + y);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', endDrag);
}

function drag(event) {
    if (!draggedElement) return;
    
    // Find the SVG under the mouse cursor
    const elementAtPoint = document.elementFromPoint(event.clientX, event.clientY);
    const targetSvg = elementAtPoint ? elementAtPoint.closest('svg') : draggedElement.closest('svg');
    
    // If the target SVG is different from the current one, move the element
    const currentSvg = draggedElement.closest('svg');
    if (targetSvg && targetSvg !== currentSvg && (targetSvg.id === 'frontSvg' || targetSvg.id === 'rearSvg')) {
        // Remove from current SVG
        currentSvg.removeChild(draggedElement);
        // Add to target SVG
        targetSvg.appendChild(draggedElement);
    }
    
    const svg = draggedElement.closest('svg');
    const svgRect = svg.getBoundingClientRect();
    const newX = event.clientX - svgRect.left - offset.x;
    const newY = event.clientY - svgRect.top - offset.y;
    
    // Get SVG dimensions for relative calculations
    const svgWidth = parseFloat(svg.getAttribute('width'));
    const svgHeight = parseFloat(svg.getAttribute('height'));
    
    // Convert to relative positions (0-1 range)
    const relativeX = Math.max(0, Math.min(1, newX / svgWidth));
    const relativeY = Math.max(0, Math.min(1, newY / svgHeight));
    
    // Snap to grid: X snaps to 0.25% increments, Y snaps to 5% increments
    const snappedX = Math.round(relativeX * 400) / 400; // 0.25% increments
    const snappedY = Math.round(relativeY * 20) / 20; // 5% increments
    
    // Convert back to absolute pixels
    const snappedAbsX = snappedX * svgWidth;
    const snappedAbsY = snappedY * svgHeight;
    
    const shape = draggedElement.querySelector('rect');
    const text = draggedElement.querySelector('text');
    const width = parseFloat(shape.getAttribute('width'));
    const height = parseFloat(shape.getAttribute('height'));
    shape.setAttribute('x', snappedAbsX);
    shape.setAttribute('y', snappedAbsY);
    text.setAttribute('x', snappedAbsX + width/2);
    text.setAttribute('y', snappedAbsY + height + 10);
}

function endDrag() {
    if (!draggedElement) return;
    const id = draggedElement.getAttribute('data-id');
    const shape = draggedElement.querySelector('rect');
    const svg = draggedElement.closest('svg');
    const svgRect = svg.getBoundingClientRect();
    
    // Get absolute position
    const absoluteX = parseFloat(shape.getAttribute('x'));
    const absoluteY = parseFloat(shape.getAttribute('y'));
    
    // Convert to relative position (0-1 range)
    const svgWidth = parseFloat(svg.getAttribute('width'));
    const svgHeight = parseFloat(svg.getAttribute('height'));
    const relativeX = absoluteX / svgWidth;
    const relativeY = absoluteY / svgHeight;
    
    // Apply the same snapping as in drag function
    const snappedX = Math.round(relativeX * 400) / 400; // 0.25% increments
    const snappedY = Math.round(relativeY * 20) / 20; // 5% increments
    
    // Determine side based on SVG container
    const side = svg.id === 'frontSvg' ? 'front' : 'rear';
    
    positions[id] = {x: snappedX, y: snappedY, side: side};
    // localStorage.setItem(`positions_${currentDeviceType.id}`, JSON.stringify(positions));
    draggedElement = null;
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', endDrag);
}

function highlightInterface() {
    const name = document.getElementById('highlightSelect').value;
    clearHighlight();
    if (!name) return; // If no interface selected, just clear highlights
    const elements = document.querySelectorAll('.interface');
    elements.forEach(el => {
        if (el.getAttribute('data-name') === name) {
            el.classList.add('highlighted');
        }
    });
}

function clearHighlight() {
    document.querySelectorAll('.interface.highlighted').forEach(el => {
        el.classList.remove('highlighted');
    });
}

function handleInterfaceClick(event) {
    // Prevent click from triggering if it was part of a drag
    if (draggedElement) return;
    
    const interfaceName = event.currentTarget.getAttribute('data-name');
    const select = document.getElementById('highlightSelect');
    select.value = interfaceName;
    highlightInterface();
}

function toggleDeviceImages() {
    const frontSvg = document.getElementById('frontSvg');
    const rearSvg = document.getElementById('rearSvg');
    const button = document.getElementById('toggleImagesButton');
    
    if (frontSvg.style.backgroundImage === '' || frontSvg.style.backgroundImage === 'none') {
        // Show device images as backgrounds
        loadDeviceImagesAsBackgrounds();
        button.textContent = 'Hide Device Images';
    } else {
        // Hide device images
        frontSvg.style.backgroundImage = 'none';
        rearSvg.style.backgroundImage = 'none';
        frontSvg.style.backgroundSize = '';
        rearSvg.style.backgroundSize = '';
        button.textContent = 'Show Device Images';
    }
    
    // Redraw the device to update device body transparency
    if (currentDeviceType) {
        drawDevice();
    }
}

function loadDeviceImagesAsBackgrounds() {
    if (!currentDeviceType) return;
    
    const frontSvg = document.getElementById('frontSvg');
    const rearSvg = document.getElementById('rearSvg');
    
    // Load front image as background
    if (currentDeviceType.front_image) {
        let frontImageUrl = currentDeviceType.front_image;
        if (!frontImageUrl.startsWith('http')) {
            frontImageUrl = netboxUrl.replace('/api', '') + frontImageUrl;
        }
        frontSvg.style.backgroundImage = `url('${frontImageUrl}')`;
        frontSvg.style.backgroundSize = '100% 100%';
        frontSvg.style.backgroundRepeat = 'no-repeat';
        frontSvg.style.backgroundPosition = 'center';
    }
    
    // Load rear image as background
    if (currentDeviceType.rear_image) {
        let rearImageUrl = currentDeviceType.rear_image;
        if (!rearImageUrl.startsWith('http')) {
            rearImageUrl = netboxUrl.replace('/api', '') + rearImageUrl;
        }
        rearSvg.style.backgroundImage = `url('${rearImageUrl}')`;
        rearSvg.style.backgroundSize = '100% 100%';
        rearSvg.style.backgroundRepeat = 'no-repeat';
        rearSvg.style.backgroundPosition = 'center';
    }
}

function populateHighlightDropdown() {
    const select = document.getElementById('highlightSelect');
    // Clear existing options except the first one
    select.innerHTML = '<option value="">Select an interface...</option>';
    
    // Add interface names as options
    interfaces.forEach(iface => {
        const option = document.createElement('option');
        option.value = iface.name;
        option.textContent = iface.name;
        select.appendChild(option);
    });
}

async function saveLayout() {
    if (!currentDeviceType || !positions || Object.keys(positions).length === 0) {
        alert('No layout to save. Please load a device and position some interfaces first.');
        return;
    }

    const layoutData = {
        deviceType: {
            id: currentDeviceType.id,
            model: currentDeviceType.model,
            slug: currentDeviceType.slug
        },
        interfaces: interfaces,
        positions: positions,
        timestamp: new Date().toISOString()
    };

    try {
        const response = await fetch('api/save-model', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(layoutData)
        });

        if (response.ok) {
            const result = await response.json();
            alert(`Layout saved to server as ${result.filename}`);
        } else {
            throw new Error(`Server error: ${response.status}`);
        }
    } catch (error) {
        console.error('Error saving layout:', error);
        alert('Error saving layout to server.');
    }
}

function resetLayout() {
    if (!currentDeviceType) {
        alert('Please load a device first.');
        return;
    }

    // Clear positions for current device type
    positions = {};
    
    // Remove from localStorage
    // localStorage.removeItem(`positions_${currentDeviceType.id}`);
    
    // Redraw the device with default positions
    drawDevice();
    
    // Clear highlight selection
    document.getElementById('highlightSelect').value = '';
    clearHighlight();
    
    alert('Layout has been reset to default positions.');
}

async function loadModelBySlug(slug) {
    try {
        const response = await fetch(`api/load-model/${slug}`);
        if (response.ok) {
            const modelData = await response.json();
            
            // Fetch full device type data from NetBox to get u_height and other details
            const headers = getHeaders();
            const deviceTypeResponse = await fetch(`${netboxUrl}/dcim/device-types/${modelData.deviceType.id}/`, { headers });
            currentDeviceType = await deviceTypeResponse.json();
            
            interfaces = modelData.interfaces || [];
            positions = modelData.positions || {};

            // Repopulate the interface dropdown
            populateHighlightDropdown();

            // Update the device type selector
            const select = document.getElementById('deviceTypeSelect');
            select.value = currentDeviceType.id;

            drawDevice();

            // Load device images as backgrounds if they are currently enabled
            const frontSvg = document.getElementById('frontSvg');
            if (frontSvg.style.backgroundImage && frontSvg.style.backgroundImage !== 'none') {
                loadDeviceImagesAsBackgrounds();
            }

            // Update page title to show loaded model
            document.title = `NetBox Device Port Visualizer - ${currentDeviceType.model}`;
        } else {
            // Model doesn't exist
            showModelNotFoundError(slug);
        }
    } catch (error) {
        console.error('Error loading model by slug:', error);
        showModelNotFoundError(slug);
    }
}

function showModelNotFoundError(slug) {
    const container = document.getElementById('deviceContainer');
    container.innerHTML = `
        <div style="text-align: center; padding: 50px; color: red;">
            <h2>Model Not Found</h2>
            <p>The model for device type "${slug}" does not exist.</p>
            <p>Redirecting to create a new model in 3 seconds...</p>
        </div>
    `;

    // Clear the URL parameter
    const url = new URL(window.location);
    url.searchParams.delete('model');
    window.history.replaceState({}, '', url);

    // Redirect after 3 seconds
    setTimeout(async () => {
        // Load device types and show the interface for creating a new model
        await loadDeviceTypes();
        container.innerHTML = `
            <div style="text-align: center; padding: 50px;">
                <h2>Create New Model</h2>
                <p>Select the device type "${slug}" from the dropdown and click "Load Device" to create a model.</p>
            </div>
        `;
        // Try to pre-select the device type if it exists
        setTimeout(() => {
            const select = document.getElementById('deviceTypeSelect');
            const options = Array.from(select.options);
            const matchingOption = options.find(option => {
                const text = option.textContent.toLowerCase();
                return text.includes(slug.toLowerCase()) || option.textContent.includes(slug);
            });
            if (matchingOption) {
                select.value = matchingOption.value;
            }
        }, 100);
    }, 3000);
}