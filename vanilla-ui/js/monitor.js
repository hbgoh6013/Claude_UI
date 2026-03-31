/**
 * Monitor Tab Module
 * Real-time trend charts, register value table, and communication log.
 * Integrates with TrendChart (canvas engine), SettingsTab, and Logger.
 */
(function () {
    'use strict';

    var container = null;
    var overlayChart = null;
    var individualCharts = {};   // addr -> TrendChart
    var currentValues = {};      // addr -> value
    var flashTimers = {};
    var logContainer = null;
    var tableBody = null;
    var overlayTimeRange = 60;
    var overlayPaused = false;
    var chartsSection = null;
    var overlayChartArea = null;
    var individualChartsGrid = null;
    var dataBuffer = {};         // addr -> [{time, value}] for chart rebuild

    // Max data points to keep in buffer for chart rebuild
    var MAX_BUFFER = 600;

    // --------------------------------------------------------------------------
    // Helpers
    // --------------------------------------------------------------------------

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

    /** Get address string from settings entry: device + number (e.g. "D100") */
    function addrKey(cfg) {
        return cfg.device + cfg.number;
    }

    /** Find settings config for a given addr string */
    function configForAddr(addr) {
        if (!window.SettingsTab) return null;
        var all = window.SettingsTab.getAddresses();
        for (var i = 0; i < all.length; i++) {
            if (addrKey(all[i]) === addr) return all[i];
        }
        return null;
    }

    function formatValue(value, dataType) {
        if (value === null || value === undefined) return '--';
        var t = (dataType || '').toLowerCase();
        if (t === 'bit') return value ? 'ON' : 'OFF';
        if (t === 'float' || t === 'double') return Number(value).toFixed(2);
        if (t === 'string') return String(value);
        var num = Number(value);
        if (!isNaN(num)) return num === Math.floor(num) ? String(num) : num.toFixed(2);
        return String(value);
    }

    // --------------------------------------------------------------------------
    // Section 1: Charts
    // --------------------------------------------------------------------------

    function buildChartsSection() {
        chartsSection = el('div', {
            className: 'card',
            style: { marginBottom: '16px', padding: '16px' }
        });

        overlayChartArea = el('div');
        chartsSection.appendChild(overlayChartArea);

        individualChartsGrid = el('div', {
            style: {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))',
                gap: '12px',
                marginTop: '12px'
            }
        });
        chartsSection.appendChild(individualChartsGrid);

        rebuildCharts();
        return chartsSection;
    }

    function destroyCharts() {
        if (overlayChart) {
            overlayChart.destroy();
            overlayChart = null;
        }
        Object.keys(individualCharts).forEach(function (addr) {
            if (individualCharts[addr]) individualCharts[addr].destroy();
        });
        individualCharts = {};
    }

    function rebuildCharts() {
        if (!overlayChartArea || !individualChartsGrid) return;

        destroyCharts();
        overlayChartArea.innerHTML = '';
        individualChartsGrid.innerHTML = '';

        if (!window.TrendChart || !window.SettingsTab) return;

        var all = window.SettingsTab.getAddresses();
        var overlaySeries = all.filter(function (a) { return a.overlay; });
        var individualSeries = all.filter(function (a) { return !a.overlay && a.graphEnabled; });

        // -- Overlay Chart --
        if (overlaySeries.length > 0) {
            overlayChartArea.appendChild(buildOverlayControls(overlaySeries));

            var canvasWrapper = el('div', { style: { position: 'relative', width: '100%', height: '320px' } });
            var canvas = document.createElement('canvas');
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';
            canvasWrapper.appendChild(canvas);
            overlayChartArea.appendChild(canvasWrapper);

            overlayChart = new window.TrendChart(canvas, {
                maxPoints: MAX_BUFFER,
                timeRangeSeconds: overlayTimeRange
            });

            overlaySeries.forEach(function (cfg) {
                var addr = addrKey(cfg);
                overlayChart.addSeries(addr, {
                    label: cfg.label || addr,
                    color: cfg.graphColor,
                    visible: true
                });
            });

            // Restore buffered data
            restoreBufferToChart(overlayChart, overlaySeries);

            if (overlayPaused) overlayChart.pause();
        }

        // -- Individual Charts --
        individualSeries.forEach(function (cfg) {
            var addr = addrKey(cfg);

            var wrapper = el('div', {
                className: 'card',
                style: { padding: '12px' }
            });

            wrapper.appendChild(el('h4', {
                textContent: cfg.label || addr,
                style: { margin: '0 0 8px', fontSize: '13px', fontWeight: '600', color: 'var(--text-primary)' }
            }));

            var canvasWrapper = el('div', { style: { position: 'relative', width: '100%', height: '200px' } });
            var canvas = document.createElement('canvas');
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.display = 'block';
            canvasWrapper.appendChild(canvas);
            wrapper.appendChild(canvasWrapper);

            individualChartsGrid.appendChild(wrapper);

            var chart = new window.TrendChart(canvas, {
                maxPoints: MAX_BUFFER,
                timeRangeSeconds: overlayTimeRange
            });
            chart.addSeries(addr, {
                label: cfg.label || addr,
                color: cfg.graphColor,
                visible: true
            });

            // Restore buffered data
            if (dataBuffer[addr]) {
                dataBuffer[addr].forEach(function (pt) {
                    var map = {};
                    map[addr] = pt.value;
                    chart.pushData(map);
                });
            }

            individualCharts[addr] = chart;
        });
    }

    function restoreBufferToChart(chart, seriesList) {
        // Collect all timestamps from all series and replay in order
        var addrList = seriesList.map(addrKey);
        var allTimes = [];
        var timeSet = {};

        addrList.forEach(function (addr) {
            if (!dataBuffer[addr]) return;
            dataBuffer[addr].forEach(function (pt) {
                var t = pt.time;
                if (!timeSet[t]) {
                    timeSet[t] = true;
                    allTimes.push(t);
                }
            });
        });

        allTimes.sort(function (a, b) { return a - b; });

        // Build lookup: addr -> time -> value
        var lookup = {};
        addrList.forEach(function (addr) {
            lookup[addr] = {};
            if (dataBuffer[addr]) {
                dataBuffer[addr].forEach(function (pt) {
                    lookup[addr][pt.time] = pt.value;
                });
            }
        });

        allTimes.forEach(function (t) {
            var map = {};
            addrList.forEach(function (addr) {
                if (lookup[addr][t] !== undefined) {
                    map[addr] = lookup[addr][t];
                }
            });
            chart.pushData(map);
        });
    }

    function buildOverlayControls(overlaySeries) {
        var bar = el('div', {
            style: {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '8px', flexWrap: 'wrap', gap: '8px'
            }
        });

        bar.appendChild(el('h3', {
            textContent: 'Combined Trend (' + overlaySeries.length + ' series)',
            style: { margin: '0', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }
        }));

        var btnGroup = el('div', { style: { display: 'flex', gap: '4px', alignItems: 'center' } });

        var ranges = [
            { label: '30s', value: 30 },
            { label: '1m', value: 60 },
            { label: '5m', value: 300 },
            { label: '10m', value: 600 }
        ];

        ranges.forEach(function (r) {
            var isActive = overlayTimeRange === r.value;
            var btn = el('button', {
                textContent: r.label,
                className: 'btn-sm' + (isActive ? ' active' : ''),
                style: {
                    padding: '4px 12px', fontSize: '12px', cursor: 'pointer', borderRadius: '4px', border: 'none',
                    background: isActive ? 'var(--accent)' : 'var(--bg-secondary)',
                    color: isActive ? '#fff' : 'var(--text-secondary)'
                },
                onClick: function () {
                    overlayTimeRange = r.value;
                    if (overlayChart) overlayChart.setTimeRange(r.value);
                    // Update all individual charts too
                    Object.keys(individualCharts).forEach(function (addr) {
                        individualCharts[addr].setTimeRange(r.value);
                    });
                    // Update button styles
                    btnGroup.querySelectorAll('button').forEach(function (b) {
                        b.style.background = 'var(--bg-secondary)';
                        b.style.color = 'var(--text-secondary)';
                    });
                    btn.style.background = 'var(--accent)';
                    btn.style.color = '#fff';
                }
            });
            btnGroup.appendChild(btn);
        });

        // Pause/Resume
        var pauseBtn = el('button', {
            textContent: overlayPaused ? 'Resume' : 'Pause',
            style: {
                padding: '4px 12px', fontSize: '12px', cursor: 'pointer', borderRadius: '4px', border: 'none',
                marginLeft: '8px',
                background: overlayPaused ? 'var(--success)' : 'var(--warning)',
                color: '#fff'
            },
            onClick: function () {
                overlayPaused = !overlayPaused;
                if (overlayChart) {
                    overlayPaused ? overlayChart.pause() : overlayChart.resume();
                }
                pauseBtn.textContent = overlayPaused ? 'Resume' : 'Pause';
                pauseBtn.style.background = overlayPaused ? 'var(--success)' : 'var(--warning)';
            }
        });
        btnGroup.appendChild(pauseBtn);

        bar.appendChild(btnGroup);
        return bar;
    }

    // --------------------------------------------------------------------------
    // Section 2: Register Values Table
    // --------------------------------------------------------------------------

    function buildTableSection() {
        var section = el('div', { className: 'card', style: { marginTop: '16px', padding: '16px' } });

        section.appendChild(el('h3', {
            textContent: 'Current Values',
            style: { margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }
        }));

        var table = el('table', {
            style: {
                width: '100%', borderCollapse: 'collapse', fontSize: '13px'
            }
        });

        var thead = el('thead');
        var headerRow = el('tr');
        ['Address', 'Label', 'Value', 'Type'].forEach(function (h) {
            headerRow.appendChild(el('th', {
                textContent: h,
                style: {
                    textAlign: 'left', padding: '8px 12px',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-muted)', fontWeight: '600', fontSize: '12px',
                    textTransform: 'uppercase', letterSpacing: '0.5px'
                }
            }));
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        tableBody = el('tbody');
        table.appendChild(tableBody);

        // Pre-populate from settings
        if (window.SettingsTab) {
            var configs = window.SettingsTab.getAddresses();
            configs.forEach(function (cfg) {
                addTableRow(addrKey(cfg), cfg.label, cfg.dataType);
            });
        }

        section.appendChild(table);
        return section;
    }

    function addTableRow(addr, label, dataType) {
        if (!tableBody) return;
        if (tableBody.querySelector('[data-addr="' + addr + '"]')) return;

        var tr = el('tr', { 'data-addr': addr });
        var cellStyle = {
            padding: '6px 12px', borderBottom: '1px solid var(--border)',
            color: 'var(--text-primary)'
        };

        tr.appendChild(el('td', {
            textContent: addr,
            style: Object.assign({}, cellStyle, { fontFamily: 'monospace', fontWeight: '500' })
        }));

        tr.appendChild(el('td', { textContent: label || addr, style: cellStyle }));

        var valueTd = el('td', {
            className: 'value-cell',
            textContent: '--',
            style: Object.assign({}, cellStyle, {
                fontFamily: 'monospace',
                transition: 'background-color 0.3s ease'
            })
        });
        tr.appendChild(valueTd);

        tr.appendChild(el('td', {
            textContent: dataType || '--',
            style: Object.assign({}, cellStyle, { fontSize: '12px', color: 'var(--text-muted)' })
        }));

        tableBody.appendChild(tr);
    }

    function updateTableRow(addr, value) {
        if (!tableBody) return;
        var tr = tableBody.querySelector('[data-addr="' + addr + '"]');
        var cfg = configForAddr(addr);
        var dataType = cfg ? cfg.dataType : '';

        if (!tr) {
            addTableRow(addr, cfg ? cfg.label : addr, dataType);
            tr = tableBody.querySelector('[data-addr="' + addr + '"]');
            if (!tr) return;
        }

        var valueTd = tr.querySelector('.value-cell');
        if (!valueTd) return;

        var formatted = formatValue(value, dataType);
        var t = (dataType || '').toLowerCase();

        if (t === 'bit') {
            valueTd.textContent = formatted;
            valueTd.style.color = value ? 'var(--success)' : 'var(--text-muted)';
            valueTd.style.fontWeight = '600';
        } else {
            valueTd.textContent = formatted;
            valueTd.style.color = 'var(--text-primary)';
            valueTd.style.fontWeight = 'normal';
        }

        // Flash on change
        var prev = currentValues[addr];
        if (prev !== undefined && prev !== value) {
            valueTd.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
            if (flashTimers[addr]) clearTimeout(flashTimers[addr]);
            flashTimers[addr] = setTimeout(function () {
                valueTd.style.backgroundColor = 'transparent';
                delete flashTimers[addr];
            }, 400);
        }
    }

    function rebuildTable() {
        if (!tableBody) return;
        tableBody.innerHTML = '';
        if (!window.SettingsTab) return;
        var configs = window.SettingsTab.getAddresses();
        configs.forEach(function (cfg) {
            var addr = addrKey(cfg);
            addTableRow(addr, cfg.label, cfg.dataType);
            if (currentValues[addr] !== undefined) {
                updateTableRow(addr, currentValues[addr]);
            }
        });
    }

    // --------------------------------------------------------------------------
    // Section 3: Communication Log
    // --------------------------------------------------------------------------

    function buildLogSection() {
        var section = el('div', { className: 'card', style: { marginTop: '16px', padding: '16px' } });

        var header = el('div', {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }
        });
        header.appendChild(el('h3', {
            textContent: 'Communication Log',
            style: { margin: '0', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }
        }));
        header.appendChild(el('button', {
            textContent: 'Clear',
            style: {
                padding: '4px 12px', fontSize: '12px', cursor: 'pointer', borderRadius: '4px',
                border: '1px solid var(--border)', background: 'var(--bg-secondary)',
                color: 'var(--text-secondary)'
            },
            onClick: function () {
                if (window.Logger) window.Logger.clear();
                if (logContainer) logContainer.innerHTML = '';
            }
        }));
        section.appendChild(header);

        logContainer = el('div', {
            style: {
                maxHeight: '300px', overflowY: 'auto',
                background: 'var(--bg-primary)', borderRadius: '6px',
                border: '1px solid var(--border)', padding: '8px',
                fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.7'
            }
        });
        section.appendChild(logContainer);

        // Load existing entries
        if (window.Logger) {
            window.Logger.getEntries().forEach(appendLogEntry);
            window.Logger.onNewEntry(appendLogEntry);
        }

        return section;
    }

    function appendLogEntry(entry) {
        if (!logContainer) return;

        var colors = {
            info: '#60a5fa',
            success: '#4ade80',
            warn: '#fbbf24',
            error: '#f87171'
        };
        var bgColors = {
            info: '#3b82f6',
            success: '#22c55e',
            warn: '#f59e0b',
            error: '#ef4444'
        };

        var row = el('div', { style: { marginBottom: '2px' } });

        row.appendChild(el('span', {
            textContent: '[' + entry.timestamp + '] ',
            style: { color: 'var(--text-muted)' }
        }));

        row.appendChild(el('span', {
            textContent: entry.level.toUpperCase(),
            style: {
                backgroundColor: bgColors[entry.level] || '#666',
                color: '#fff', padding: '1px 5px', borderRadius: '3px',
                fontSize: '10px', fontWeight: '600', marginRight: '6px'
            }
        }));

        row.appendChild(el('span', {
            textContent: entry.message,
            style: { color: colors[entry.level] || 'var(--text-secondary)' }
        }));

        logContainer.appendChild(row);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // --------------------------------------------------------------------------
    // Public API
    // --------------------------------------------------------------------------

    window.MonitorTab = {
        init: function (containerElement) {
            container = containerElement;
            if (!container) return;
            container.innerHTML = '';

            container.appendChild(buildChartsSection());
            container.appendChild(buildTableSection());

            // System Monitor section
            var sysmonSection = el('div', { className: 'card', style: { marginTop: '16px', padding: '16px' } });
            sysmonSection.appendChild(el('h3', {
                textContent: 'System Resources',
                style: { margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: 'var(--text-primary)' }
            }));
            var sysmonContainer = el('div');
            sysmonSection.appendChild(sysmonContainer);
            container.appendChild(sysmonSection);
            if (window.SystemMonitor) {
                window.SystemMonitor.init(sysmonContainer);
            }

            container.appendChild(buildLogSection());
        },

        updateData: function (registers) {
            if (!Array.isArray(registers)) return;

            // Build a dataMap for the overlay chart
            var overlayMap = {};
            var now = Date.now();

            registers.forEach(function (reg) {
                var addr = reg.addr;
                var value = reg.value;

                // Buffer data for chart rebuilds
                if (!dataBuffer[addr]) dataBuffer[addr] = [];
                dataBuffer[addr].push({ time: now, value: value });
                if (dataBuffer[addr].length > MAX_BUFFER) {
                    dataBuffer[addr].shift();
                }

                // Update table
                updateTableRow(addr, value);
                currentValues[addr] = value;

                // Check if this addr is in overlay
                var cfg = configForAddr(addr);
                if (cfg && cfg.overlay && overlayChart) {
                    overlayMap[addr] = value;
                }

                // Individual chart
                if (individualCharts[addr]) {
                    var indMap = {};
                    indMap[addr] = value;
                    individualCharts[addr].pushData(indMap);
                }
            });

            // Push to overlay chart (one call with all values)
            if (overlayChart && Object.keys(overlayMap).length > 0) {
                overlayChart.pushData(overlayMap);
            }
        },

        updateCharts: function () {
            rebuildCharts();
            rebuildTable();
        },

        setChartsFrozen: function (frozen) {
            if (overlayChart && overlayChart.setFrozen) {
                overlayChart.setFrozen(frozen);
            }
            Object.keys(individualCharts).forEach(function (addr) {
                if (individualCharts[addr] && individualCharts[addr].setFrozen) {
                    individualCharts[addr].setFrozen(frozen);
                }
            });
        },

        destroy: function () {
            destroyCharts();
            Object.keys(flashTimers).forEach(function (k) { clearTimeout(flashTimers[k]); });
            flashTimers = {};
            currentValues = {};
            dataBuffer = {};
            logContainer = null;
            tableBody = null;
            if (container) { container.innerHTML = ''; container = null; }
        }
    };
})();
