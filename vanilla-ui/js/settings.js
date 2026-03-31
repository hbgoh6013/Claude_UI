/**
 * Settings Tab Module - Multi-Protocol, Multi-PLC Support
 * Manages PLC connections, protocol selection, address configuration,
 * overlay settings, and color assignments.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  var STORAGE_KEY = 'vanilla-plc-settings-v2';
  var LEGACY_KEY = 'vanilla-plc-settings';

  var PROTOCOLS = {
    cclink: {
      name: 'CC-Link IE',
      devices: ['D', 'M', 'X', 'Y', 'W', 'B', 'RW'],
      addressMode: 'device-number',
      placeholder: 'e.g. 100'
    },
    opcua: {
      name: 'OPC UA',
      devices: ['Node'],
      addressMode: 'nodeid',
      placeholder: 'e.g. ns=2;s=Temperature'
    },
    mc: {
      name: 'MC Protocol',
      devices: ['D', 'M', 'Y', 'X', 'W', 'R', 'ZR'],
      addressMode: 'device-number',
      placeholder: 'e.g. 100'
    },
    s7: {
      name: 'S7/Siemens',
      devices: ['DB', 'I', 'Q', 'M'],
      addressMode: 's7',
      placeholder: 'e.g. DB1.DBW0 or M0.0'
    },
    fins: {
      name: 'FINS/Omron',
      devices: ['DM', 'CIO', 'WR', 'HR', 'AR'],
      addressMode: 'device-number',
      placeholder: 'e.g. 100'
    }
  };

  var DATA_TYPE_OPTIONS = ['Bit', 'Word', 'DWord', 'Float', 'Double', 'String'];
  var MATCH_TYPE_OPTIONS = ['Master', 'Slave'];

  var COLOR_PALETTE = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
    '#6366f1', '#84cc16', '#e11d48', '#0ea5e9', '#d946ef'
  ];

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  var plcs = [];
  var activePlcId = null;
  var changeCallbacks = [];
  var container = null;
  var colorPickerCleanup = null;
  var nextColorIndex = 0;

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function uuid() {
    return 'xxxx-xxxx-xxxx'.replace(/x/g, function () {
      return Math.floor(Math.random() * 16).toString(16);
    });
  }

  function pickNextColor() {
    var color = COLOR_PALETTE[nextColorIndex % COLOR_PALETTE.length];
    nextColorIndex++;
    return color;
  }

  function getActivePlc() {
    for (var i = 0; i < plcs.length; i++) {
      if (plcs[i].id === activePlcId) return plcs[i];
    }
    return plcs[0] || null;
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ plcs: plcs, activePlcId: activePlcId }));
    } catch (_) {}
  }

  function loadFromLocalStorage() {
    try {
      // Try v2 format
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed.plcs && Array.isArray(parsed.plcs)) {
          plcs = parsed.plcs;
          activePlcId = parsed.activePlcId || (plcs[0] && plcs[0].id);
          return;
        }
      }
      // Migrate from legacy format
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        var addrs = JSON.parse(legacy);
        if (Array.isArray(addrs)) {
          plcs = [createDefaultPlc('PLC1', addrs)];
          activePlcId = plcs[0].id;
          saveToLocalStorage();
          return;
        }
      }
    } catch (_) {}
    // Default
    plcs = [createDefaultPlc('PLC1', [])];
    activePlcId = plcs[0].id;
  }

  function createDefaultPlc(name, addresses) {
    return {
      id: uuid(),
      name: name || 'PLC' + (plcs.length + 1),
      ip: '192.168.0.10',
      port: 4600,
      protocol: 'cclink',
      addresses: addresses || []
    };
  }

  function fireChange() {
    saveToLocalStorage();
    syncBackend();
    changeCallbacks.forEach(function (cb) {
      try { cb(getActiveAddresses()); } catch (_) {}
    });
  }

  function getActiveAddresses() {
    var plc = getActivePlc();
    return plc ? plc.addresses : [];
  }

  function syncBackend() {
    if (!window.PLCWebSocket || !window.PLCWebSocket.send) return;
    if (!window.PLCWebSocket.isConnected()) {
      if (window.Logger) window.Logger.warn('Settings changed locally (backend not connected)');
      return;
    }
    var plc = getActivePlc();
    if (!plc) return;
    var payload = {
      type: 'settings_update',
      plcId: plc.name,
      protocol: plc.protocol,
      addresses: plc.addresses.map(function (a) {
        return {
          protocol: plc.protocol,
          device: a.device,
          address: a.number,
          nodeId: a.nodeId || '',
          count: a.count,
          label: a.label,
          dataType: a.dataType
        };
      })
    };
    var sent = window.PLCWebSocket.send(payload);
    if (sent && window.Logger) {
      window.Logger.info('settings_update sent (' + plc.name + ', ' + plc.addresses.length + ' addresses)');
    }
  }

  // ---------------------------------------------------------------------------
  // DOM Helpers
  // ---------------------------------------------------------------------------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'textContent') node.textContent = attrs[k];
        else if (k === 'style' && typeof attrs[k] === 'object') {
          Object.keys(attrs[k]).forEach(function (s) { node.style[s] = attrs[k][s]; });
        }
        else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        if (typeof c === 'string') node.appendChild(document.createTextNode(c));
        else node.appendChild(c);
      });
    }
    return node;
  }

  // ---------------------------------------------------------------------------
  // Color Picker
  // ---------------------------------------------------------------------------

  function openColorPicker(anchorEl, currentColor, onSelect) {
    closeColorPicker();
    var popup = el('div', { style: { position: 'absolute', zIndex: '9999', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', boxShadow: 'var(--shadow-lg)', width: '172px' } });
    var grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 28px)', gap: '4px', justifyContent: 'center' } });
    COLOR_PALETTE.forEach(function (c) {
      grid.appendChild(el('div', {
        style: { width: '28px', height: '28px', borderRadius: '4px', background: c, cursor: 'pointer', border: c === currentColor ? '2px solid #fff' : '2px solid transparent', boxSizing: 'border-box' },
        onClick: function () { onSelect(c); closeColorPicker(); }
      }));
    });
    popup.appendChild(grid);
    var hexRow = el('div', { style: { display: 'flex', gap: '4px', marginTop: '8px' } });
    var hexInput = el('input', { type: 'text', value: currentColor || '#000000', style: { flex: '1', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', padding: '4px 6px', fontSize: '12px', fontFamily: 'monospace' } });
    var hexBtn = el('button', { textContent: 'Set', className: 'btn btn-primary btn-sm', onClick: function () { var v = hexInput.value.trim(); if (/^#[0-9a-fA-F]{3,8}$/.test(v)) { onSelect(v); closeColorPicker(); } } });
    hexRow.appendChild(hexInput);
    hexRow.appendChild(hexBtn);
    popup.appendChild(hexRow);
    var rect = anchorEl.getBoundingClientRect();
    popup.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    popup.style.left = (rect.left + window.scrollX) + 'px';
    document.body.appendChild(popup);
    function outsideHandler(e) { if (!popup.contains(e.target) && e.target !== anchorEl) closeColorPicker(); }
    setTimeout(function () { document.addEventListener('mousedown', outsideHandler); }, 0);
    colorPickerCleanup = function () { document.removeEventListener('mousedown', outsideHandler); if (popup.parentNode) popup.parentNode.removeChild(popup); colorPickerCleanup = null; };
  }

  function closeColorPicker() { if (colorPickerCleanup) colorPickerCleanup(); }

  function buildToggleSwitch(initialValue, onChange) {
    var label = el('label', { className: 'toggle-switch' });
    var cb = el('input', { type: 'checkbox' });
    cb.checked = initialValue;
    var slider = el('span', { className: 'toggle-slider' });
    cb.addEventListener('change', function () { onChange(cb.checked); });
    label.appendChild(cb);
    label.appendChild(slider);
    return label;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  function render() {
    if (!container) return;
    container.innerHTML = '';

    // PLC Tabs
    container.appendChild(buildPlcTabs());

    var plc = getActivePlc();
    if (!plc) return;

    // Connection Settings
    container.appendChild(buildConnectionSettings(plc));

    // Read Addresses header
    var headerRow = el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', margin: '16px 0 12px' } });
    headerRow.appendChild(el('h2', { textContent: 'Read Addresses', style: { margin: '0', color: 'var(--text-primary)', fontSize: '18px' } }));
    headerRow.appendChild(el('span', { textContent: String(plc.addresses.length), className: 'tab-badge', style: { background: 'var(--accent)' } }));
    container.appendChild(headerRow);

    // Add Address Form
    container.appendChild(buildAddForm(plc));

    // Address Table
    container.appendChild(buildTable(plc));

    // Write Addresses placeholder
    container.appendChild(buildWritePlaceholder());
  }

  // ---------------------------------------------------------------------------
  // PLC Tabs
  // ---------------------------------------------------------------------------

  function buildPlcTabs() {
    var bar = el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' } });

    plcs.forEach(function (plc) {
      var isActive = plc.id === activePlcId;
      var tab = el('button', {
        textContent: plc.name,
        style: {
          padding: '6px 16px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', borderRadius: '6px 6px 0 0', border: '1px solid var(--border)', borderBottom: isActive ? '2px solid var(--accent)' : '1px solid var(--border)',
          background: isActive ? 'var(--bg-card)' : 'var(--bg-secondary)', color: isActive ? 'var(--accent)' : 'var(--text-secondary)'
        },
        onClick: function () { activePlcId = plc.id; saveToLocalStorage(); render(); fireChange(); }
      });
      bar.appendChild(tab);
    });

    // Add PLC button
    bar.appendChild(el('button', {
      textContent: '+ Add PLC',
      className: 'btn btn-sm',
      style: { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '6px', marginLeft: '4px' },
      onClick: function () {
        var newPlc = createDefaultPlc('PLC' + (plcs.length + 1), []);
        plcs.push(newPlc);
        activePlcId = newPlc.id;
        saveToLocalStorage();
        render();
        if (window.Logger) window.Logger.info('Added ' + newPlc.name);
      }
    }));

    return bar;
  }

  // ---------------------------------------------------------------------------
  // Connection Settings
  // ---------------------------------------------------------------------------

  function buildConnectionSettings(plc) {
    var card = el('div', { className: 'card', style: { padding: '16px', marginBottom: '12px' } });
    card.appendChild(el('h3', { textContent: 'Connection Settings', style: { margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' } }));

    var fieldStyle = { background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', padding: '7px 10px', fontSize: '13px', width: '100%', boxSizing: 'border-box' };
    var labelStyle = { color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px', display: 'block' };

    function makeField(labelText, inputNode, flex) {
      var cell = el('div', { style: { flex: flex || '1', minWidth: '120px' } });
      cell.appendChild(el('label', { textContent: labelText, style: labelStyle }));
      cell.appendChild(inputNode);
      return cell;
    }

    // Row 1: Name, IP, Port
    var row1 = el('div', { style: { display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' } });

    var nameInput = el('input', { type: 'text', value: plc.name, style: fieldStyle });
    nameInput.addEventListener('change', function () { plc.name = nameInput.value.trim() || plc.name; saveToLocalStorage(); render(); });
    row1.appendChild(makeField('PLC Name', nameInput));

    var ipInput = el('input', { type: 'text', value: plc.ip, style: fieldStyle });
    ipInput.addEventListener('change', function () { plc.ip = ipInput.value.trim(); saveToLocalStorage(); });
    row1.appendChild(makeField('IP Address', ipInput));

    var portInput = el('input', { type: 'number', value: plc.port, style: fieldStyle });
    portInput.addEventListener('change', function () { plc.port = Number(portInput.value) || 4600; saveToLocalStorage(); });
    row1.appendChild(makeField('Port', portInput, '0.5'));

    card.appendChild(row1);

    // Row 2: Protocol selector
    var row2 = el('div', { style: { display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' } });

    var protoSel = el('select', { style: fieldStyle });
    Object.keys(PROTOCOLS).forEach(function (key) {
      var opt = el('option', { value: key, textContent: PROTOCOLS[key].name });
      if (key === plc.protocol) opt.selected = true;
      protoSel.appendChild(opt);
    });
    protoSel.addEventListener('change', function () {
      plc.protocol = protoSel.value;
      saveToLocalStorage();
      render();
    });
    row2.appendChild(makeField('Protocol', protoSel));

    // Delete PLC button (only if more than 1)
    if (plcs.length > 1) {
      var delBtn = el('button', { textContent: 'Delete PLC', className: 'btn btn-danger btn-sm', style: { marginBottom: '2px' },
        onClick: function () {
          if (!confirm('Delete "' + plc.name + '"?')) return;
          plcs = plcs.filter(function (p) { return p.id !== plc.id; });
          activePlcId = plcs[0].id;
          saveToLocalStorage();
          render();
          fireChange();
          if (window.Logger) window.Logger.info('Deleted PLC');
        }
      });
      row2.appendChild(el('div', { style: { flex: '0' } }, [delBtn]));
    }

    card.appendChild(row2);
    return card;
  }

  // ---------------------------------------------------------------------------
  // Add Address Form
  // ---------------------------------------------------------------------------

  function buildAddForm(plc) {
    var proto = PROTOCOLS[plc.protocol] || PROTOCOLS.cclink;
    var wrapper = el('div', { className: 'card', style: { marginBottom: '12px', overflow: 'hidden', padding: '0' } });

    var collapsed = true;
    var body = el('div', { style: { padding: '0 16px 16px', display: 'none' } });
    var chevron = el('span', { textContent: '\u25B6', style: { transition: 'transform 0.2s', display: 'inline-block', marginRight: '8px', fontSize: '12px' } });

    var header = el('div', {
      style: { padding: '12px 16px', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', fontWeight: '600', fontSize: '14px' },
      onClick: function () { collapsed = !collapsed; body.style.display = collapsed ? 'none' : 'block'; chevron.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(90deg)'; }
    }, [chevron, 'Add Address']);
    wrapper.appendChild(header);

    var fieldStyle = { background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-primary)', padding: '7px 10px', fontSize: '13px', width: '100%', boxSizing: 'border-box' };
    var labelStyle = { color: 'var(--text-secondary)', fontSize: '12px', marginBottom: '4px', display: 'block' };

    var formState = { label: '', device: proto.devices[0], number: '', nodeId: '', bitIdx: 0, count: 1, dataType: 'Word', triggerMatch: false, matchID: 0, matchType: 'Slave' };

    function makeField(labelText, inputNode) {
      var cell = el('div', { style: { flex: '1', minWidth: '120px' } });
      cell.appendChild(el('label', { textContent: labelText, style: labelStyle }));
      cell.appendChild(inputNode);
      return cell;
    }

    function textInput(key, type, placeholder) {
      var inp = el('input', { type: type || 'text', style: fieldStyle });
      if (placeholder) inp.placeholder = placeholder;
      if (formState[key] !== undefined && formState[key] !== '') inp.value = formState[key];
      inp.addEventListener('input', function () { formState[key] = type === 'number' ? Number(inp.value) : inp.value; });
      return inp;
    }

    function selectInput(key, options) {
      var sel = el('select', { style: fieldStyle });
      options.forEach(function (o) {
        var opt = el('option', { value: o, textContent: o });
        if (o === formState[key]) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () { formState[key] = sel.value; });
      return sel;
    }

    // Row 1: Label + address (depends on protocol)
    var row1 = el('div', { style: { display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' } });
    row1.appendChild(makeField('Label', textInput('label', 'text', 'e.g. LeakChannel_1')));

    if (proto.addressMode === 'nodeid') {
      row1.appendChild(makeField('Node ID', textInput('nodeId', 'text', proto.placeholder)));
    } else if (proto.addressMode === 's7') {
      row1.appendChild(makeField('Device', selectInput('device', proto.devices)));
      row1.appendChild(makeField('Address', textInput('nodeId', 'text', proto.placeholder)));
    } else {
      row1.appendChild(makeField('Device', selectInput('device', proto.devices)));
      row1.appendChild(makeField('Number', textInput('number', 'number', proto.placeholder)));
    }
    body.appendChild(row1);

    // Row 2: BitIdx, Count, DataType
    var row2 = el('div', { style: { display: 'flex', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' } });
    if (proto.addressMode !== 'nodeid') {
      row2.appendChild(makeField('Bit Index (0-15)', textInput('bitIdx', 'number')));
    }
    row2.appendChild(makeField('Count', textInput('count', 'number')));
    row2.appendChild(makeField('Data Type', selectInput('dataType', DATA_TYPE_OPTIONS)));
    body.appendChild(row2);

    // Row 3: TriggerMatch, MatchID, MatchType (CC-Link only)
    if (plc.protocol === 'cclink') {
      var row3 = el('div', { style: { display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'flex-end' } });
      var toggleWrap = el('div', { style: { flex: '1', minWidth: '120px' } });
      toggleWrap.appendChild(el('label', { textContent: 'Trigger Match', style: labelStyle }));
      toggleWrap.appendChild(buildToggleSwitch(false, function (v) { formState.triggerMatch = v; }));
      row3.appendChild(toggleWrap);
      row3.appendChild(makeField('Match ID', textInput('matchID', 'number')));
      row3.appendChild(makeField('Match Type', selectInput('matchType', MATCH_TYPE_OPTIONS)));
      body.appendChild(row3);
    }

    // Error + Add button
    var errorArea = el('div', { style: { color: 'var(--danger)', fontSize: '12px', marginBottom: '8px', minHeight: '16px' } });
    body.appendChild(errorArea);

    body.appendChild(el('button', {
      textContent: 'Add Address', className: 'btn btn-primary',
      onClick: function () {
        errorArea.textContent = '';
        if (!formState.label.trim()) { errorArea.textContent = 'Label is required.'; return; }
        if (proto.addressMode === 'nodeid' && !formState.nodeId.trim()) { errorArea.textContent = 'Node ID is required.'; return; }
        if (proto.addressMode === 'device-number' && (formState.number === '' || isNaN(Number(formState.number)))) { errorArea.textContent = 'Number is required.'; return; }
        var dup = plc.addresses.some(function (a) { return a.label === formState.label.trim(); });
        if (dup) { errorArea.textContent = 'Duplicate label.'; return; }

        plc.addresses.push({
          id: uuid(),
          label: formState.label.trim(),
          device: formState.device,
          number: Number(formState.number) || 0,
          nodeId: formState.nodeId || '',
          bitIdx: Math.min(15, Math.max(0, Number(formState.bitIdx) || 0)),
          count: Number(formState.count) || 1,
          dataType: formState.dataType,
          triggerMatch: formState.triggerMatch,
          matchID: Number(formState.matchID) || 0,
          matchType: formState.matchType,
          overlay: false,
          graphColor: pickNextColor(),
          graphEnabled: true
        });
        fireChange();
        render();
      }
    }));

    wrapper.appendChild(body);
    return wrapper;
  }

  // ---------------------------------------------------------------------------
  // Address Table
  // ---------------------------------------------------------------------------

  function buildTable(plc) {
    var section = el('div', { style: { marginBottom: '12px' } });
    var addresses = plc.addresses;
    var proto = PROTOCOLS[plc.protocol] || PROTOCOLS.cclink;

    if (addresses.length === 0) {
      section.appendChild(el('p', { textContent: 'No addresses configured.', style: { color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '13px' } }));
      return section;
    }

    var table = el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' } });
    var thead = el('thead');
    var headerTr = el('tr');
    var cols = ['Label', 'Address', 'DataType', 'Overlay', 'Color', 'Actions'];
    cols.forEach(function (txt) { headerTr.appendChild(el('th', { textContent: txt })); });
    thead.appendChild(headerTr);
    table.appendChild(thead);

    var tbody = el('tbody');
    addresses.forEach(function (addr) {
      var tr = el('tr');

      // Label (click to edit)
      var labelTd = el('td');
      labelTd.appendChild(el('span', {
        textContent: addr.label,
        style: { cursor: 'pointer', borderBottom: '1px dashed var(--border-light)' },
        onClick: function () { startInlineEdit(labelTd, plc, addr); }
      }));
      tr.appendChild(labelTd);

      // Address display
      var addrText = '';
      if (proto.addressMode === 'nodeid') {
        addrText = addr.nodeId || '(empty)';
      } else if (proto.addressMode === 's7') {
        addrText = addr.device + (addr.nodeId || addr.number);
      } else {
        addrText = addr.device + addr.number;
      }
      tr.appendChild(el('td', { textContent: addrText, style: { fontFamily: 'monospace' } }));

      // DataType badge
      var dtTd = el('td');
      dtTd.appendChild(el('span', { textContent: addr.dataType, style: { background: 'var(--bg-hover)', color: 'var(--text-primary)', borderRadius: '4px', padding: '2px 8px', fontSize: '12px' } }));
      tr.appendChild(dtTd);

      // Overlay toggle
      var overlayTd = el('td');
      overlayTd.appendChild(buildToggleSwitch(addr.overlay, function (val) { addr.overlay = val; fireChange(); }));
      tr.appendChild(overlayTd);

      // Color swatch
      var colorTd = el('td');
      var swatch = el('div', {
        style: { width: '24px', height: '24px', borderRadius: '50%', background: addr.graphColor, cursor: 'pointer', border: '2px solid var(--border)', boxSizing: 'border-box' },
        onClick: function () {
          openColorPicker(swatch, addr.graphColor, function (c) { addr.graphColor = c; swatch.style.background = c; fireChange(); });
        }
      });
      colorTd.appendChild(swatch);
      tr.appendChild(colorTd);

      // Delete
      var actTd = el('td');
      actTd.appendChild(el('button', {
        textContent: 'Delete', className: 'btn btn-danger btn-sm',
        onClick: function () {
          if (!confirm('Delete "' + addr.label + '"?')) return;
          plc.addresses = plc.addresses.filter(function (a) { return a.id !== addr.id; });
          fireChange();
          render();
        }
      }));
      tr.appendChild(actTd);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    section.appendChild(table);
    return section;
  }

  function startInlineEdit(td, plc, addr) {
    td.textContent = '';
    var input = el('input', { type: 'text', value: addr.label, style: { background: 'var(--bg-input)', border: '1px solid var(--accent)', borderRadius: '4px', color: 'var(--text-primary)', padding: '4px 8px', fontSize: '13px', width: '100%', boxSizing: 'border-box' } });
    function commit() {
      var v = input.value.trim();
      if (!v || plc.addresses.some(function (a) { return a.id !== addr.id && a.label === v; })) { render(); return; }
      addr.label = v;
      fireChange();
      render();
    }
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(); if (e.key === 'Escape') render(); });
    td.appendChild(input);
    input.focus();
    input.select();
  }

  // ---------------------------------------------------------------------------
  // Write Placeholder
  // ---------------------------------------------------------------------------

  function buildWritePlaceholder() {
    var section = el('div', { className: 'card', style: { padding: '16px', opacity: '0.5', pointerEvents: 'none', marginTop: '8px' } });
    var hr = el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' } });
    hr.appendChild(el('h3', { textContent: 'Write Addresses', style: { margin: '0', color: 'var(--text-secondary)', fontSize: '16px' } }));
    hr.appendChild(el('span', { textContent: 'Coming Soon', className: 'overlay-badge badge-inactive' }));
    section.appendChild(hr);
    section.appendChild(el('p', { textContent: 'Write address configuration will be available in a future update.', style: { color: 'var(--text-muted)', fontSize: '13px', margin: '0' } }));
    return section;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  window.SettingsTab = {
    init: function (containerElement) {
      container = containerElement;
      container.style.padding = '16px';
      loadFromLocalStorage();
      nextColorIndex = getActiveAddresses().length;
      render();
    },

    getPlcs: function () { return plcs.slice(); },

    getActivePlc: function () {
      var p = getActivePlc();
      return p ? Object.assign({}, p) : null;
    },

    getAddresses: function () { return getActiveAddresses().slice(); },

    setAddresses: function (newAddresses) {
      var plc = getActivePlc();
      if (!plc || !Array.isArray(newAddresses)) return;
      plc.addresses = newAddresses.map(function (a) {
        return {
          id: a.id || uuid(),
          label: a.label || '',
          device: a.device || 'D',
          number: typeof a.number === 'number' ? a.number : (Number(a.number) || 0),
          nodeId: a.nodeId || '',
          bitIdx: typeof a.bitIdx === 'number' ? a.bitIdx : 0,
          count: typeof a.count === 'number' ? a.count : 1,
          dataType: a.dataType || 'Word',
          triggerMatch: !!a.triggerMatch,
          matchID: typeof a.matchID === 'number' ? a.matchID : 0,
          matchType: a.matchType || 'Slave',
          overlay: !!a.overlay,
          graphColor: a.graphColor || pickNextColor(),
          graphEnabled: a.graphEnabled !== false
        };
      });
      nextColorIndex = plc.addresses.length;
      saveToLocalStorage();
      if (container) render();
      changeCallbacks.forEach(function (cb) { try { cb(plc.addresses); } catch (_) {} });
    },

    onAddressChange: function (callback) {
      if (typeof callback === 'function') changeCallbacks.push(callback);
    },

    getOverlayAddresses: function () {
      return getActiveAddresses().filter(function (a) { return a.overlay === true; });
    },

    getNonOverlayAddresses: function () {
      return getActiveAddresses().filter(function (a) { return a.overlay === false && a.graphEnabled === true; });
    }
  };
})();
