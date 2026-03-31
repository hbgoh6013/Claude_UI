/**
 * TrendChart - Canvas-based real-time trend chart engine for PLC monitoring.
 * Provides smooth, high-performance visualization of multiple data series.
 */
(function () {
  'use strict';

  var DEFAULT_COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
    '#6366f1', '#84cc16', '#e11d48', '#0ea5e9', '#d946ef'
  ];

  var DEFAULT_OPTIONS = {
    maxPoints: 600,
    timeRangeSeconds: 60,
    backgroundColor: '#1a1d27',
    gridColor: '#2e3346',
    textColor: '#8b8fa3',
    padding: { top: 20, right: 20, bottom: 40, left: 60 }
  };

  function merge(defaults, overrides) {
    var result = {};
    var key;
    for (key in defaults) {
      if (defaults.hasOwnProperty(key)) {
        if (
          typeof defaults[key] === 'object' &&
          defaults[key] !== null &&
          !Array.isArray(defaults[key]) &&
          overrides && typeof overrides[key] === 'object'
        ) {
          result[key] = merge(defaults[key], overrides[key]);
        } else {
          result[key] = (overrides && overrides.hasOwnProperty(key)) ? overrides[key] : defaults[key];
        }
      }
    }
    return result;
  }

  /**
   * @constructor
   * @param {HTMLCanvasElement} canvasElement
   * @param {Object} [options]
   */
  function TrendChart(canvasElement, options) {
    if (!(this instanceof TrendChart)) {
      return new TrendChart(canvasElement, options);
    }

    this._canvas = canvasElement;
    this._ctx = canvasElement.getContext('2d');
    this._options = merge(DEFAULT_OPTIONS, options || {});

    // Data storage
    this._timestamps = [];          // shared timestamp array
    this._series = {};              // id -> { label, color, visible, data[] }
    this._seriesOrder = [];         // insertion order of series IDs
    this._colorIndex = 0;

    // State
    this._paused = false;
    this._frozen = true;       // frozen until first data arrives
    this._needsRedraw = true;
    this._animFrameId = null;
    this._lastFrameTime = 0;
    this._destroyed = false;

    // Mouse
    this._mouseX = -1;
    this._mouseY = -1;
    this._mouseInCanvas = false;

    // Bind event handlers
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseLeave = this._handleMouseLeave.bind(this);
    this._onResize = this.resize.bind(this);

    this._canvas.addEventListener('mousemove', this._onMouseMove);
    this._canvas.addEventListener('mouseleave', this._onMouseLeave);
    window.addEventListener('resize', this._onResize);

    this.resize();
    this._startLoop();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Add a data series.
   * @param {string} id
   * @param {Object} [options] - { label, color, visible }
   */
  TrendChart.prototype.addSeries = function (id, options) {
    options = options || {};
    var color = options.color || DEFAULT_COLORS[this._colorIndex % DEFAULT_COLORS.length];
    this._series[id] = {
      label: options.label || id,
      color: color,
      visible: options.visible !== undefined ? options.visible : true,
      data: []
    };
    // Back-fill with NaN so the data array length matches timestamps
    for (var i = 0; i < this._timestamps.length; i++) {
      this._series[id].data.push(NaN);
    }
    this._seriesOrder.push(id);
    this._colorIndex++;
    this._needsRedraw = true;
  };

  /**
   * Remove a data series.
   * @param {string} id
   */
  TrendChart.prototype.removeSeries = function (id) {
    delete this._series[id];
    var idx = this._seriesOrder.indexOf(id);
    if (idx !== -1) {
      this._seriesOrder.splice(idx, 1);
    }
    this._needsRedraw = true;
  };

  /**
   * Push a data point for one or more series.
   * @param {Object} dataMap - e.g. { "D100": 123.4, "D101": 456.7 }
   */
  TrendChart.prototype.pushData = function (dataMap) {
    this._frozen = false; // unfreeze on data arrival
    var now = new Date();
    var maxPoints = this._options.maxPoints;

    // If buffer is full, shift oldest entry
    if (this._timestamps.length >= maxPoints) {
      this._timestamps.shift();
      for (var sid in this._series) {
        if (this._series.hasOwnProperty(sid)) {
          this._series[sid].data.shift();
        }
      }
    }

    this._timestamps.push(now);

    for (var id in this._series) {
      if (this._series.hasOwnProperty(id)) {
        var val = (dataMap && dataMap.hasOwnProperty(id)) ? dataMap[id] : NaN;
        this._series[id].data.push(val);
      }
    }

    this._needsRedraw = true;
  };

  TrendChart.prototype.setSeriesColor = function (id, color) {
    if (this._series[id]) {
      this._series[id].color = color;
      this._needsRedraw = true;
    }
  };

  TrendChart.prototype.setSeriesVisible = function (id, visible) {
    if (this._series[id]) {
      this._series[id].visible = visible;
      this._needsRedraw = true;
    }
  };

  TrendChart.prototype.setTimeRange = function (seconds) {
    this._options.timeRangeSeconds = seconds;
    this._needsRedraw = true;
  };

  TrendChart.prototype.pause = function () {
    this._paused = true;
  };

  TrendChart.prototype.resume = function () {
    this._paused = false;
    this._needsRedraw = true;
  };

  TrendChart.prototype.isPaused = function () {
    return this._paused;
  };

  /** Freeze the time axis (e.g., when WebSocket is disconnected) */
  TrendChart.prototype.setFrozen = function (frozen) {
    this._frozen = frozen;
    this._needsRedraw = true;
  };

  TrendChart.prototype.getSeriesIds = function () {
    return this._seriesOrder.slice();
  };

  TrendChart.prototype.resize = function () {
    var dpr = window.devicePixelRatio || 1;
    var rect = this._canvas.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;

    this._canvas.width = w * dpr;
    this._canvas.height = h * dpr;
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this._width = w;
    this._height = h;
    this._needsRedraw = true;
  };

  TrendChart.prototype.destroy = function () {
    this._destroyed = true;
    if (this._animFrameId) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    this._canvas.removeEventListener('mouseleave', this._onMouseLeave);
    window.removeEventListener('resize', this._onResize);
    this._timestamps = [];
    this._series = {};
    this._seriesOrder = [];
  };

  // -------------------------------------------------------------------------
  // Internal: animation loop
  // -------------------------------------------------------------------------

  TrendChart.prototype._startLoop = function () {
    var self = this;
    var FRAME_INTERVAL = 1000 / 30; // ~30 fps

    function loop(timestamp) {
      if (self._destroyed) return;
      self._animFrameId = requestAnimationFrame(loop);

      if (!self._needsRedraw) return;
      // Throttle to ~30fps
      if (timestamp - self._lastFrameTime < FRAME_INTERVAL) return;

      self._lastFrameTime = timestamp;
      self._needsRedraw = false;
      self._draw();
    }

    this._animFrameId = requestAnimationFrame(loop);
  };

  // -------------------------------------------------------------------------
  // Internal: drawing
  // -------------------------------------------------------------------------

  TrendChart.prototype._draw = function () {
    var ctx = this._ctx;
    var w = this._width;
    var h = this._height;
    var pad = this._options.padding;
    var opts = this._options;

    // 1. Clear
    ctx.fillStyle = opts.backgroundColor;
    ctx.fillRect(0, 0, w, h);

    var plotLeft = pad.left;
    var plotTop = pad.top;
    var plotWidth = w - pad.left - pad.right;
    var plotHeight = h - pad.top - pad.bottom;

    if (plotWidth <= 0 || plotHeight <= 0) return;

    // 2. Determine visible time range
    // Freeze time axis when paused OR when no new data has arrived recently (disconnected)
    var useLastTimestamp = this._paused || this._frozen;
    var now = useLastTimestamp && this._timestamps.length > 0
      ? this._timestamps[this._timestamps.length - 1]
      : new Date();
    var timeRangeMs = opts.timeRangeSeconds * 1000;
    var tMax = now.getTime();
    var tMin = tMax - timeRangeMs;

    // 3. Find visible data index range
    var startIdx = this._bisectLeft(this._timestamps, tMin);
    var endIdx = this._timestamps.length;

    // 4. Calculate Y-axis auto-scale
    var yBounds = this._calcYBounds(startIdx, endIdx);
    var yMin = yBounds.min;
    var yMax = yBounds.max;

    // Handle edge cases
    if (!isFinite(yMin) || !isFinite(yMax)) {
      yMin = 0;
      yMax = 100;
    }
    if (yMin === yMax) {
      yMin -= 1;
      yMax += 1;
    }
    // 10% padding
    var yPad = (yMax - yMin) * 0.1;
    yMin -= yPad;
    yMax += yPad;

    // Mapping helpers
    function mapX(t) {
      return plotLeft + ((t - tMin) / timeRangeMs) * plotWidth;
    }
    function mapY(v) {
      return plotTop + plotHeight - ((v - yMin) / (yMax - yMin)) * plotHeight;
    }

    // 5. Draw grid
    this._drawGrid(ctx, plotLeft, plotTop, plotWidth, plotHeight, tMin, tMax, yMin, yMax, mapX, mapY);

    // 6. Draw series
    this._drawSeries(ctx, startIdx, endIdx, tMin, mapX, mapY);

    // 7. Draw plot border
    ctx.strokeStyle = opts.gridColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(plotLeft, plotTop, plotWidth, plotHeight);

    // 8. Draw crosshair and tooltip
    if (this._mouseInCanvas) {
      this._drawCrosshair(ctx, plotLeft, plotTop, plotWidth, plotHeight, tMin, tMax, yMin, yMax, startIdx, endIdx, mapX, mapY);
    }
  };

  TrendChart.prototype._calcYBounds = function (startIdx, endIdx) {
    var min = Infinity;
    var max = -Infinity;
    var hasVisibleSeries = false;

    for (var id in this._series) {
      if (!this._series.hasOwnProperty(id)) continue;
      var s = this._series[id];
      if (!s.visible) continue;
      hasVisibleSeries = true;
      var data = s.data;
      for (var i = startIdx; i < endIdx; i++) {
        var v = data[i];
        if (isNaN(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }

    if (!hasVisibleSeries) {
      return { min: 0, max: 100 };
    }

    return { min: min, max: max };
  };

  TrendChart.prototype._drawGrid = function (ctx, plotLeft, plotTop, plotWidth, plotHeight, tMin, tMax, yMin, yMax, mapX, mapY) {
    var opts = this._options;
    ctx.save();

    // --- Horizontal grid lines and Y-axis labels ---
    var yTicks = this._niceScale(yMin, yMax, 6);
    ctx.strokeStyle = opts.gridColor;
    ctx.lineWidth = 1;
    ctx.fillStyle = opts.textColor;
    ctx.font = '11px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (var i = 0; i < yTicks.length; i++) {
      var yVal = yTicks[i];
      var py = mapY(yVal);
      if (py < plotTop || py > plotTop + plotHeight) continue;

      ctx.beginPath();
      ctx.moveTo(plotLeft, py);
      ctx.lineTo(plotLeft + plotWidth, py);
      ctx.stroke();

      ctx.fillText(this._formatYLabel(yVal), plotLeft - 8, py);
    }

    // --- Vertical grid lines and X-axis labels ---
    var timeRange = tMax - tMin;
    var xTickInterval = this._niceTimeInterval(timeRange);
    // Align first tick
    var firstTick = Math.ceil(tMin / xTickInterval) * xTickInterval;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    for (var t = firstTick; t <= tMax; t += xTickInterval) {
      var px = mapX(t);
      if (px < plotLeft || px > plotLeft + plotWidth) continue;

      ctx.beginPath();
      ctx.strokeStyle = opts.gridColor;
      ctx.moveTo(px, plotTop);
      ctx.lineTo(px, plotTop + plotHeight);
      ctx.stroke();

      ctx.fillText(this._formatTime(new Date(t)), px, plotTop + plotHeight + 6);
    }

    ctx.restore();
  };

  TrendChart.prototype._drawSeries = function (ctx, startIdx, endIdx, tMin, mapX, mapY) {
    for (var o = 0; o < this._seriesOrder.length; o++) {
      var id = this._seriesOrder[o];
      var s = this._series[id];
      if (!s || !s.visible) continue;

      var data = s.data;
      var timestamps = this._timestamps;

      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();

      var started = false;
      // Start one index before visible range for line continuity
      var from = startIdx > 0 ? startIdx - 1 : startIdx;
      for (var i = from; i < endIdx; i++) {
        var v = data[i];
        if (isNaN(v)) {
          started = false;
          continue;
        }
        var px = mapX(timestamps[i].getTime());
        var py = mapY(v);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else {
          ctx.lineTo(px, py);
        }
      }

      ctx.stroke();
      ctx.restore();
    }
  };

  TrendChart.prototype._drawCrosshair = function (ctx, plotLeft, plotTop, plotWidth, plotHeight, tMin, tMax, yMin, yMax, startIdx, endIdx, mapX, mapY) {
    var mx = this._mouseX;
    var my = this._mouseY;

    if (mx < plotLeft || mx > plotLeft + plotWidth || my < plotTop || my > plotTop + plotHeight) {
      return;
    }

    var opts = this._options;
    var timeRangeMs = tMax - tMin;

    // Map mouse X to time
    var hoverTime = tMin + ((mx - plotLeft) / plotWidth) * timeRangeMs;

    // Find nearest timestamp index
    var nearestIdx = this._bisectNearest(this._timestamps, hoverTime, startIdx, endIdx);
    if (nearestIdx < 0 || nearestIdx >= this._timestamps.length) return;

    var snapTime = this._timestamps[nearestIdx].getTime();
    var snapX = mapX(snapTime);

    // Draw vertical crosshair line
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(snapX, plotTop);
    ctx.lineTo(snapX, plotTop + plotHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Build tooltip content
    var lines = [];
    lines.push(this._formatTime(this._timestamps[nearestIdx]));

    for (var o = 0; o < this._seriesOrder.length; o++) {
      var id = this._seriesOrder[o];
      var s = this._series[id];
      if (!s || !s.visible) continue;
      var val = s.data[nearestIdx];
      var valStr = isNaN(val) ? '---' : val.toFixed(2);
      lines.push({ label: s.label, color: s.color, value: valStr });
    }

    // Draw dots on series at snap point
    ctx.save();
    for (var d = 0; d < this._seriesOrder.length; d++) {
      var did = this._seriesOrder[d];
      var ds = this._series[did];
      if (!ds || !ds.visible) continue;
      var dv = ds.data[nearestIdx];
      if (isNaN(dv)) continue;
      var dy = mapY(dv);
      ctx.fillStyle = ds.color;
      ctx.beginPath();
      ctx.arc(snapX, dy, 4, 0, Math.PI * 2);
      ctx.fill();
      // White ring
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();

    // Draw tooltip box
    this._drawTooltip(ctx, mx, my, plotLeft, plotTop, plotWidth, plotHeight, lines);
  };

  TrendChart.prototype._drawTooltip = function (ctx, mx, my, plotLeft, plotTop, plotWidth, plotHeight, lines) {
    ctx.save();
    ctx.font = '12px monospace';

    var lineHeight = 20;
    var padding = 10;
    var colorDotSize = 8;
    var colorDotGap = 6;

    // Measure width
    var maxTextWidth = 0;
    for (var i = 0; i < lines.length; i++) {
      var text;
      if (typeof lines[i] === 'string') {
        text = lines[i];
      } else {
        text = lines[i].label + ': ' + lines[i].value;
      }
      var tw = ctx.measureText(text).width;
      if (typeof lines[i] !== 'string') {
        tw += colorDotSize + colorDotGap;
      }
      if (tw > maxTextWidth) maxTextWidth = tw;
    }

    var boxW = maxTextWidth + padding * 2;
    var boxH = lines.length * lineHeight + padding * 2;

    // Position tooltip - flip if near edge
    var tx = mx + 15;
    var ty = my - boxH / 2;
    if (tx + boxW > plotLeft + plotWidth) {
      tx = mx - 15 - boxW;
    }
    if (ty < plotTop) {
      ty = plotTop;
    }
    if (ty + boxH > plotTop + plotHeight) {
      ty = plotTop + plotHeight - boxH;
    }

    // Background
    ctx.fillStyle = 'rgba(20, 22, 35, 0.92)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    this._roundRect(ctx, tx, ty, boxW, boxH, 6);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (var j = 0; j < lines.length; j++) {
      var ly = ty + padding + j * lineHeight + lineHeight / 2;
      if (typeof lines[j] === 'string') {
        // Time header
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px monospace';
        ctx.fillText(lines[j], tx + padding, ly);
        ctx.font = '12px monospace';
      } else {
        // Color dot
        var dotX = tx + padding + colorDotSize / 2;
        ctx.fillStyle = lines[j].color;
        ctx.beginPath();
        ctx.arc(dotX, ly, colorDotSize / 2, 0, Math.PI * 2);
        ctx.fill();
        // Label + value
        ctx.fillStyle = '#e0e0e0';
        ctx.fillText(lines[j].label + ': ' + lines[j].value, tx + padding + colorDotSize + colorDotGap, ly);
      }
    }

    ctx.restore();
  };

  TrendChart.prototype._roundRect = function (ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
  };

  // -------------------------------------------------------------------------
  // Internal: utility methods
  // -------------------------------------------------------------------------

  /** Binary search: find first index where timestamps[i] >= target */
  TrendChart.prototype._bisectLeft = function (arr, targetMs) {
    var lo = 0;
    var hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >>> 1;
      if (arr[mid].getTime() < targetMs) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  };

  /** Find index of timestamp nearest to targetMs within [lo, hi) */
  TrendChart.prototype._bisectNearest = function (arr, targetMs, lo, hi) {
    if (arr.length === 0) return -1;
    lo = lo || 0;
    hi = hi || arr.length;

    var idx = this._bisectLeft(arr, targetMs);
    if (idx >= hi) return hi - 1;
    if (idx <= lo) return lo;

    var before = arr[idx - 1].getTime();
    var after = arr[idx].getTime();
    return (targetMs - before < after - targetMs) ? idx - 1 : idx;
  };

  /** Generate nice round tick values between min and max */
  TrendChart.prototype._niceScale = function (min, max, targetTicks) {
    var range = max - min;
    if (range === 0) return [min];
    var rawStep = range / targetTicks;
    var magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    var residual = rawStep / magnitude;

    var niceStep;
    if (residual <= 1.5) niceStep = magnitude;
    else if (residual <= 3) niceStep = 2 * magnitude;
    else if (residual <= 7) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    var ticks = [];
    var start = Math.ceil(min / niceStep) * niceStep;
    for (var v = start; v <= max; v += niceStep) {
      ticks.push(v);
    }
    return ticks;
  };

  /** Choose a nice time interval (ms) for X-axis grid lines */
  TrendChart.prototype._niceTimeInterval = function (rangeMs) {
    // Possible intervals in ms
    var intervals = [
      1000, 2000, 5000, 10000, 15000, 30000,
      60000, 120000, 300000, 600000
    ];
    var targetTicks = 6;
    var ideal = rangeMs / targetTicks;
    for (var i = 0; i < intervals.length; i++) {
      if (intervals[i] >= ideal) return intervals[i];
    }
    return intervals[intervals.length - 1];
  };

  TrendChart.prototype._formatTime = function (date) {
    var h = date.getHours();
    var m = date.getMinutes();
    var s = date.getSeconds();
    return (h < 10 ? '0' : '') + h + ':' +
           (m < 10 ? '0' : '') + m + ':' +
           (s < 10 ? '0' : '') + s;
  };

  TrendChart.prototype._formatYLabel = function (value) {
    var absVal = Math.abs(value);
    if (absVal === 0) return '0';
    if (absVal >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (absVal >= 1000) return (value / 1000).toFixed(1) + 'k';
    if (absVal < 0.01) return value.toExponential(1);
    if (absVal < 1) return value.toFixed(3);
    if (absVal < 100) return value.toFixed(1);
    return Math.round(value).toString();
  };

  // -------------------------------------------------------------------------
  // Internal: event handlers
  // -------------------------------------------------------------------------

  TrendChart.prototype._handleMouseMove = function (e) {
    var rect = this._canvas.getBoundingClientRect();
    this._mouseX = e.clientX - rect.left;
    this._mouseY = e.clientY - rect.top;
    this._mouseInCanvas = true;
    this._needsRedraw = true;
  };

  TrendChart.prototype._handleMouseLeave = function () {
    this._mouseInCanvas = false;
    this._needsRedraw = true;
  };

  // -------------------------------------------------------------------------
  // Expose globally
  // -------------------------------------------------------------------------
  window.TrendChart = TrendChart;

})();
