/**
 * SystemMonitor - 3D-style system resource gauges (CPU, Memory, Disk, GPU)
 * Uses Canvas for rendering with animated transitions.
 */
(function () {
    'use strict';

    var container = null;
    var canvases = {};       // key -> { canvas, ctx, animId }
    var currentData = null;
    var targetData = null;
    var animData = null;
    var animStart = 0;
    var ANIM_DURATION = 500;
    var resizeHandler = null;

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

    function easeOut(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function colorForUsage(pct) {
        if (pct >= 90) return '#ef4444';
        if (pct >= 70) return '#f59e0b';
        return '#3b82f6';
    }

    function formatMB(mb) {
        if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
        return Math.round(mb) + ' MB';
    }

    // -------------------------------------------------------------------------
    // Canvas setup
    // -------------------------------------------------------------------------

    function setupCanvas(canvas) {
        var dpr = window.devicePixelRatio || 1;
        var rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        var ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { w: rect.width, h: rect.height, ctx: ctx };
    }

    // -------------------------------------------------------------------------
    // CPU Gauge - Semi-circular arc
    // -------------------------------------------------------------------------

    function drawCpuGauge(canvas, usage, name) {
        var s = setupCanvas(canvas);
        var ctx = s.ctx, w = s.w, h = s.h;

        ctx.clearRect(0, 0, w, h);

        var cx = w / 2, cy = h * 0.6;
        var radius = Math.min(w, h) * 0.38;
        var lineWidth = radius * 0.22;
        var startAngle = Math.PI;
        var endAngle = 2 * Math.PI;

        // Track (background arc)
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = '#2e3346';
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Inner shadow
        var grad = ctx.createRadialGradient(cx, cy - 2, radius - lineWidth / 2, cx, cy - 2, radius + lineWidth / 2);
        grad.addColorStop(0, 'rgba(0,0,0,0.3)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = grad;
        ctx.lineWidth = lineWidth + 2;
        ctx.stroke();

        // Value arc
        var pct = Math.max(0, Math.min(100, usage));
        var valueAngle = startAngle + (pct / 100) * Math.PI;
        var color = colorForUsage(pct);

        if (pct > 0) {
            var arcGrad = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
            arcGrad.addColorStop(0, color);
            arcGrad.addColorStop(1, shiftColor(color, 30));

            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, valueAngle);
            ctx.strokeStyle = arcGrad;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Glow
            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, valueAngle - 0.05, valueAngle);
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth * 0.5;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Percentage text
        ctx.fillStyle = '#e8eaf0';
        ctx.font = 'bold ' + Math.round(radius * 0.55) + 'px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(pct) + '%', cx, cy - radius * 0.1);

        // Label
        ctx.fillStyle = '#8b8fa3';
        ctx.font = Math.round(radius * 0.18) + 'px "Segoe UI", sans-serif';
        ctx.fillText('CPU', cx, cy + radius * 0.25);

        // CPU name
        if (name) {
            ctx.fillStyle = '#5a5e72';
            ctx.font = Math.round(Math.min(11, radius * 0.15)) + 'px "Segoe UI", sans-serif';
            var displayName = name.length > 30 ? name.substring(0, 30) + '...' : name;
            ctx.fillText(displayName, cx, cy + radius * 0.55);
        }
    }

    // -------------------------------------------------------------------------
    // Memory Gauge - Donut ring with perspective
    // -------------------------------------------------------------------------

    function drawMemoryGauge(canvas, used, total, unit) {
        var s = setupCanvas(canvas);
        var ctx = s.ctx, w = s.w, h = s.h;
        ctx.clearRect(0, 0, w, h);

        var cx = w / 2, cy = h * 0.5;
        var radius = Math.min(w, h) * 0.35;
        var lineWidth = radius * 0.25;
        var pct = total > 0 ? (used / total) * 100 : 0;
        var color = colorForUsage(pct);

        // Track
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#2e3346';
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        // Value arc
        if (pct > 0) {
            var startA = -Math.PI / 2;
            var endA = startA + (pct / 100) * Math.PI * 2;

            var grad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
            grad.addColorStop(0, color);
            grad.addColorStop(1, shiftColor(color, 40));

            ctx.beginPath();
            ctx.arc(cx, cy, radius, startA, endA);
            ctx.strokeStyle = grad;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Outer glow
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, endA - 0.1, endA);
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth * 0.3;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Center text
        ctx.fillStyle = '#e8eaf0';
        ctx.font = 'bold ' + Math.round(radius * 0.4) + 'px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(pct) + '%', cx, cy - radius * 0.08);

        ctx.fillStyle = '#8b8fa3';
        ctx.font = Math.round(radius * 0.17) + 'px "Segoe UI", sans-serif';
        ctx.fillText(formatMB(used) + ' / ' + formatMB(total), cx, cy + radius * 0.25);

        ctx.fillStyle = '#5a5e72';
        ctx.font = Math.round(radius * 0.16) + 'px "Segoe UI", sans-serif';
        ctx.fillText('Memory', cx, cy + radius * 0.55);
    }

    // -------------------------------------------------------------------------
    // Disk Gauge - 3D Cylinder
    // -------------------------------------------------------------------------

    function drawDiskGauge(canvas, drive, used, total) {
        var s = setupCanvas(canvas);
        var ctx = s.ctx, w = s.w, h = s.h;
        ctx.clearRect(0, 0, w, h);

        var pct = total > 0 ? (used / total) * 100 : 0;
        var color = colorForUsage(pct);

        var cylW = w * 0.5;
        var cylH = h * 0.55;
        var ellH = cylH * 0.15;
        var cx = w / 2;
        var topY = h * 0.12;
        var botY = topY + cylH;
        var fillY = botY - (pct / 100) * cylH;
        var left = cx - cylW / 2;
        var right = cx + cylW / 2;

        // Body shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(cx + 3, botY + 3, cylW / 2, ellH, 0, 0, Math.PI * 2);
        ctx.fill();

        // Cylinder body (dark background)
        ctx.fillStyle = '#1a1d27';
        ctx.beginPath();
        ctx.moveTo(left, topY);
        ctx.lineTo(left, botY);
        ctx.ellipse(cx, botY, cylW / 2, ellH, 0, Math.PI, 0, true);
        ctx.lineTo(right, topY);
        ctx.ellipse(cx, topY, cylW / 2, ellH, 0, 0, Math.PI, true);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#2e3346';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Fill level
        if (pct > 0) {
            var fillGrad = ctx.createLinearGradient(left, fillY, right, fillY);
            fillGrad.addColorStop(0, shiftColor(color, -20));
            fillGrad.addColorStop(0.5, color);
            fillGrad.addColorStop(1, shiftColor(color, -30));

            ctx.fillStyle = fillGrad;
            ctx.beginPath();
            ctx.moveTo(left, fillY);
            ctx.lineTo(left, botY);
            ctx.ellipse(cx, botY, cylW / 2, ellH, 0, Math.PI, 0, true);
            ctx.lineTo(right, fillY);
            ctx.ellipse(cx, fillY, cylW / 2, ellH, 0, 0, Math.PI, true);
            ctx.closePath();
            ctx.fill();

            // Fill top ellipse
            var topGrad = ctx.createRadialGradient(cx, fillY, 0, cx, fillY, cylW / 2);
            topGrad.addColorStop(0, shiftColor(color, 40));
            topGrad.addColorStop(1, color);
            ctx.fillStyle = topGrad;
            ctx.beginPath();
            ctx.ellipse(cx, fillY, cylW / 2, ellH, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Top ellipse (cap)
        ctx.fillStyle = '#21242f';
        ctx.beginPath();
        ctx.ellipse(cx, topY, cylW / 2, ellH, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#2e3346';
        ctx.stroke();

        // Bottom ellipse outline
        ctx.beginPath();
        ctx.ellipse(cx, botY, cylW / 2, ellH, 0, 0, Math.PI);
        ctx.strokeStyle = '#2e3346';
        ctx.stroke();

        // Text
        ctx.fillStyle = '#e8eaf0';
        ctx.font = 'bold ' + Math.round(h * 0.11) + 'px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(drive, cx, botY + ellH + h * 0.08);

        ctx.fillStyle = '#8b8fa3';
        ctx.font = Math.round(h * 0.08) + 'px "Segoe UI", sans-serif';
        ctx.fillText(formatMB(used) + ' / ' + formatMB(total), cx, botY + ellH + h * 0.18);

        ctx.fillStyle = color;
        ctx.font = 'bold ' + Math.round(h * 0.09) + 'px "Segoe UI", sans-serif';
        ctx.fillText(Math.round(pct) + '%', cx, botY + ellH + h * 0.28);
    }

    // -------------------------------------------------------------------------
    // GPU Gauge - Semi-circular (purple accent)
    // -------------------------------------------------------------------------

    function drawGpuGauge(canvas, usage, name, memUsed, memTotal) {
        var s = setupCanvas(canvas);
        var ctx = s.ctx, w = s.w, h = s.h;
        ctx.clearRect(0, 0, w, h);

        var cx = w / 2, cy = h * 0.6;
        var radius = Math.min(w, h) * 0.38;
        var lineWidth = radius * 0.22;
        var startAngle = Math.PI;
        var endAngle = 2 * Math.PI;
        var color = '#8b5cf6';

        // Track
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.strokeStyle = '#2e3346';
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Value arc
        var pct = Math.max(0, Math.min(100, usage || 0));
        if (pct > 0) {
            var valueAngle = startAngle + (pct / 100) * Math.PI;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, valueAngle);
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.stroke();

            ctx.shadowColor = color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, valueAngle - 0.05, valueAngle);
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth * 0.5;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Text
        ctx.fillStyle = '#e8eaf0';
        ctx.font = 'bold ' + Math.round(radius * 0.5) + 'px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(pct) + '%', cx, cy - radius * 0.1);

        ctx.fillStyle = '#8b8fa3';
        ctx.font = Math.round(radius * 0.18) + 'px "Segoe UI", sans-serif';
        ctx.fillText('GPU', cx, cy + radius * 0.25);

        if (name) {
            ctx.fillStyle = '#5a5e72';
            ctx.font = Math.round(Math.min(11, radius * 0.15)) + 'px "Segoe UI", sans-serif';
            var dn = name.length > 28 ? name.substring(0, 28) + '...' : name;
            ctx.fillText(dn, cx, cy + radius * 0.5);
        }

        if (memTotal > 0) {
            ctx.fillStyle = '#5a5e72';
            ctx.font = Math.round(Math.min(10, radius * 0.13)) + 'px "Segoe UI", sans-serif';
            ctx.fillText('VRAM: ' + formatMB(memUsed) + ' / ' + formatMB(memTotal), cx, cy + radius * 0.72);
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function shiftColor(hex, amount) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        r = Math.max(0, Math.min(255, r + amount));
        g = Math.max(0, Math.min(255, g + amount));
        b = Math.max(0, Math.min(255, b + amount));
        return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function createGaugeCard(title, key, heightPx) {
        var card = el('div', {
            className: 'card',
            style: { padding: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center' }
        });
        card.appendChild(el('div', {
            textContent: title,
            style: { fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }
        }));
        var canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.height = (heightPx || 180) + 'px';
        canvas.style.display = 'block';
        card.appendChild(canvas);
        canvases[key] = canvas;
        return card;
    }

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    function render() {
        if (!container) return;
        container.innerHTML = '';

        var grid = el('div', {
            style: {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '12px'
            }
        });

        grid.appendChild(createGaugeCard('CPU', 'cpu', 180));
        grid.appendChild(createGaugeCard('Memory', 'memory', 180));

        // Disks - create placeholders, will add more on data
        grid.appendChild(createGaugeCard('Disk C:', 'disk_C:', 220));
        grid.appendChild(createGaugeCard('Disk D:', 'disk_D:', 220));

        container.appendChild(grid);

        // Initial draw
        if (animData) {
            drawAll(animData);
        } else {
            drawPlaceholders();
        }
    }

    function drawPlaceholders() {
        Object.keys(canvases).forEach(function (key) {
            var s = setupCanvas(canvases[key]);
            s.ctx.fillStyle = '#5a5e72';
            s.ctx.font = '12px "Segoe UI", sans-serif';
            s.ctx.textAlign = 'center';
            s.ctx.textBaseline = 'middle';
            s.ctx.fillText('Waiting for data...', s.w / 2, s.h / 2);
        });
    }

    function drawAll(data) {
        if (!data) return;

        if (data.cpu && canvases.cpu) {
            drawCpuGauge(canvases.cpu, data.cpu.usage || 0, data.cpu.name || '');
        }

        if (data.memory && canvases.memory) {
            drawMemoryGauge(canvases.memory, data.memory.used || 0, data.memory.total || 0);
        }

        if (data.disks && Array.isArray(data.disks)) {
            data.disks.forEach(function (disk) {
                var key = 'disk_' + disk.drive;
                if (canvases[key]) {
                    drawDiskGauge(canvases[key], disk.drive, disk.used || 0, disk.total || 0);
                }
            });
        }

        if (data.gpu && data.gpu.name && canvases.gpu) {
            drawGpuGauge(canvases.gpu, data.gpu.usage || 0, data.gpu.name, data.gpu.memory_used || 0, data.gpu.memory_total || 0);
        }
    }

    // -------------------------------------------------------------------------
    // Animation
    // -------------------------------------------------------------------------

    var animFrameId = null;

    function animateTransition() {
        if (!targetData || !animData) return;

        var now = Date.now();
        var elapsed = now - animStart;
        var t = Math.min(1, elapsed / ANIM_DURATION);
        var et = easeOut(t);

        // Interpolate values
        var interp = {};

        if (targetData.cpu && animData.cpu) {
            interp.cpu = {
                usage: lerp(animData.cpu.usage || 0, targetData.cpu.usage || 0, et),
                name: targetData.cpu.name,
                cores: targetData.cpu.cores
            };
        }

        if (targetData.memory && animData.memory) {
            interp.memory = {
                used: lerp(animData.memory.used || 0, targetData.memory.used || 0, et),
                total: targetData.memory.total
            };
        }

        if (targetData.disks) {
            interp.disks = targetData.disks.map(function (disk, i) {
                var prev = (animData.disks && animData.disks[i]) ? animData.disks[i] : { used: 0, total: disk.total };
                return {
                    drive: disk.drive,
                    used: lerp(prev.used || 0, disk.used || 0, et),
                    total: disk.total
                };
            });
        }

        if (targetData.gpu) {
            var prevGpu = animData.gpu || { usage: 0, memory_used: 0 };
            interp.gpu = {
                usage: lerp(prevGpu.usage || 0, targetData.gpu.usage || 0, et),
                name: targetData.gpu.name,
                memory_used: lerp(prevGpu.memory_used || 0, targetData.gpu.memory_used || 0, et),
                memory_total: targetData.gpu.memory_total
            };
        }

        drawAll(interp);

        if (t < 1) {
            animFrameId = requestAnimationFrame(animateTransition);
        } else {
            animData = targetData;
            animFrameId = null;
        }
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    window.SystemMonitor = {
        init: function (containerElement) {
            container = containerElement;
            canvases = {};
            render();

            resizeHandler = function () {
                if (animData) drawAll(animData);
                else drawPlaceholders();
            };
            window.addEventListener('resize', resizeHandler);
        },

        updateData: function (data) {
            if (!data || !container) return;

            // If new disks appear or GPU appears, rebuild
            var needRebuild = false;
            if (data.disks) {
                data.disks.forEach(function (d) {
                    if (!canvases['disk_' + d.drive]) needRebuild = true;
                });
            }
            if (data.gpu && data.gpu.name && !canvases.gpu) needRebuild = true;

            if (needRebuild) {
                // Rebuild grid with correct disks/GPU
                container.innerHTML = '';
                canvases = {};
                var grid = el('div', {
                    style: {
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                        gap: '12px'
                    }
                });
                grid.appendChild(createGaugeCard('CPU', 'cpu', 180));
                grid.appendChild(createGaugeCard('Memory', 'memory', 180));
                if (data.disks) {
                    data.disks.forEach(function (d) {
                        grid.appendChild(createGaugeCard('Disk ' + d.drive, 'disk_' + d.drive, 220));
                    });
                }
                if (data.gpu && data.gpu.name) {
                    grid.appendChild(createGaugeCard('GPU', 'gpu', 180));
                }
                container.appendChild(grid);
            }

            // Start animation
            if (!animData) animData = data;
            targetData = data;
            animStart = Date.now();
            if (!animFrameId) {
                animFrameId = requestAnimationFrame(animateTransition);
            }
        },

        showDemo: function () {
            this.updateData({
                cpu: { usage: 45.2, cores: 8, name: 'Intel Core i7-12700' },
                memory: { total: 32768, used: 18432, unit: 'MB' },
                disks: [
                    { drive: 'C:', total: 512000, used: 384000, unit: 'MB' },
                    { drive: 'D:', total: 1024000, used: 640000, unit: 'MB' }
                ],
                gpu: { name: 'NVIDIA GeForce RTX 3060', usage: 30, memory_total: 12288, memory_used: 4096 }
            });
        },

        destroy: function () {
            if (animFrameId) {
                cancelAnimationFrame(animFrameId);
                animFrameId = null;
            }
            if (resizeHandler) {
                window.removeEventListener('resize', resizeHandler);
                resizeHandler = null;
            }
            canvases = {};
            currentData = null;
            targetData = null;
            animData = null;
            if (container) { container.innerHTML = ''; container = null; }
        }
    };
})();
