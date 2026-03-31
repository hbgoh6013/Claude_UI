/**
 * app.js - Main application initialization and tab management
 * CC-Link PLC Vanilla Monitor
 */
(function () {
    'use strict';

    var activeTab = 'monitor';
    var demoInterval = null;
    var demoMode = false;

    var defaultColors = [
        '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
        '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
        '#6366f1', '#84cc16', '#e11d48', '#0ea5e9', '#d946ef'
    ];

    function init() {
        setupTabs();
        setupDemoMode();

        // Initialize Logger
        if (window.Logger) {
            window.Logger.info('Application initialized');
        }

        // Initialize WebSocket
        if (window.PLCWebSocket) {
            window.PLCWebSocket.onStatusChange(function (status) {
                updateConnectionStatus(status);
                // Freeze/unfreeze charts based on connection state
                if (window.MonitorTab && window.MonitorTab.setChartsFrozen) {
                    window.MonitorTab.setChartsFrozen(status !== 'connected');
                }
            });

            window.PLCWebSocket.onData(function (data) {
                if (data.registers && window.MonitorTab) {
                    window.MonitorTab.updateData(data.registers);
                }
                if (data.type === 'config_sync' && data.addresses && window.SettingsTab) {
                    handleConfigSync(data.addresses);
                }
                if (data.type === 'system_info' && window.SystemMonitor) {
                    window.SystemMonitor.updateData(data);
                }
            });

            window.PLCWebSocket.connect();
        }

        // Initialize Settings tab
        if (window.SettingsTab) {
            var settingsContainer = document.getElementById('settings-content');
            if (settingsContainer) {
                window.SettingsTab.init(settingsContainer);
            }
            window.SettingsTab.onAddressChange(function (addresses) {
                if (window.MonitorTab) {
                    window.MonitorTab.updateCharts();
                }
                if (window.Logger) {
                    window.Logger.info('Address configuration updated (' + addresses.length + ' addresses)');
                }
            });
        }

        // Initialize Monitor tab
        if (window.MonitorTab) {
            var monitorContainer = document.getElementById('monitor-content');
            if (monitorContainer) {
                window.MonitorTab.init(monitorContainer);
            }
        }

        switchTab('monitor');

        if (window.Logger) {
            window.Logger.success('Application ready');
        }
    }

    function setupTabs() {
        document.querySelectorAll('.tab-item').forEach(function (btn) {
            btn.addEventListener('click', function () {
                switchTab(this.getAttribute('data-tab'));
            });
        });
    }

    function switchTab(tabName) {
        activeTab = tabName;

        document.querySelectorAll('.tab-item').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
        });

        document.querySelectorAll('.tab-panel').forEach(function (panel) {
            panel.classList.toggle('active', panel.id === tabName + '-content');
        });

        // Resize charts when switching to monitor
        if (tabName === 'monitor' && window.MonitorTab) {
            setTimeout(function () {
                window.MonitorTab.updateCharts();
            }, 50);
        }
    }

    function updateConnectionStatus(status) {
        var wrapper = document.getElementById('connection-status');
        var text = document.getElementById('status-text');
        if (!wrapper || !text) return;

        wrapper.className = 'connection-status ' + status;
        var labels = {
            'connected': 'Connected',
            'disconnected': 'Disconnected',
            'connecting': 'Connecting...'
        };
        text.textContent = labels[status] || status;
    }

    function setupDemoMode() {
        var toggle = document.getElementById('demo-toggle');
        if (!toggle) return;
        toggle.addEventListener('change', function () {
            demoMode = this.checked;
            if (demoMode) {
                startDemo();
                if (window.Logger) window.Logger.info('Demo mode enabled');
            } else {
                stopDemo();
                if (window.Logger) window.Logger.info('Demo mode disabled');
            }
        });
    }

    function startDemo() {
        if (demoInterval) return;
        var demoValues = {};

        function getAddrs() {
            if (window.SettingsTab) {
                return window.SettingsTab.getAddresses();
            }
            return [
                { device: 'D', number: 100, label: 'LeakChannel_1', dataType: 'Word' },
                { device: 'D', number: 101, label: 'LeakChannel_2', dataType: 'Word' },
                { device: 'D', number: 102, label: 'LeakChannel_3', dataType: 'Word' },
                { device: 'D', number: 103, label: 'LeakChannel_4', dataType: 'Word' },
                { device: 'D', number: 104, label: 'LeakChannel_5', dataType: 'Word' }
            ];
        }

        var addrs = getAddrs();
        addrs.forEach(function (a) {
            demoValues[a.device + a.number] = Math.random() * 1000 - 500;
        });

        demoInterval = setInterval(function () {
            var addrs = getAddrs();
            var registers = addrs.map(function (a) {
                var key = a.device + a.number;
                if (demoValues[key] === undefined) {
                    demoValues[key] = Math.random() * 1000 - 500;
                }
                if (a.dataType === 'Bit') {
                    demoValues[key] = Math.random() < 0.05 ? (demoValues[key] ? 0 : 1) : demoValues[key];
                } else {
                    demoValues[key] += (Math.random() - 0.5) * 50;
                }
                return { addr: key, value: demoValues[key] };
            });

            if (window.MonitorTab) {
                window.MonitorTab.updateData(registers);
            }
        }, 100); // 10Hz
    }

    function stopDemo() {
        if (demoInterval) {
            clearInterval(demoInterval);
            demoInterval = null;
        }
    }

    function handleConfigSync(backendAddresses) {
        if (!window.SettingsTab) return;

        // Build lookup from existing settings to preserve overlay/color/graphEnabled
        var existing = window.SettingsTab.getAddresses();
        var existingMap = {};
        existing.forEach(function (a) {
            existingMap[a.device + a.number] = a;
        });

        var mapped = backendAddresses.map(function (addr, i) {
            var key = (addr.device || 'D') + (addr.address || 0);
            var prev = existingMap[key];
            return {
                id: prev ? prev.id : uuid(),
                label: addr.label || key,
                device: addr.device || 'D',
                number: addr.address || 0,
                bitIdx: addr.bitIdx || 0,
                count: addr.count || 1,
                dataType: addr.dataType || 'Word',
                triggerMatch: prev ? prev.triggerMatch : false,
                matchID: prev ? prev.matchID : 1,
                matchType: prev ? prev.matchType : 'Slave',
                overlay: prev ? prev.overlay : true,
                graphColor: prev ? prev.graphColor : defaultColors[i % defaultColors.length],
                graphEnabled: prev ? prev.graphEnabled : true
            };
        });
        window.SettingsTab.setAddresses(mapped);
        if (window.Logger) {
            window.Logger.success('Config synced from backend (' + mapped.length + ' addresses)');
        }
    }

    function uuid() {
        return 'xxxx-xxxx'.replace(/x/g, function () {
            return Math.floor(Math.random() * 16).toString(16);
        });
    }

    // Init on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.App = { switchTab: switchTab, startDemo: startDemo, stopDemo: stopDemo };
})();
