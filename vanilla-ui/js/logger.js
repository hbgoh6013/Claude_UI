/**
 * Logger Module
 * Provides structured logging with level-based color coding
 * and callback support for UI integration.
 */
(function () {
  'use strict';

  var MAX_ENTRIES = 200;
  var entries = [];
  var newEntryCallbacks = [];

  /**
   * Format current time as HH:MM:SS.mmm
   */
  function formatTimestamp() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    var s = String(now.getSeconds()).padStart(2, '0');
    var ms = String(now.getMilliseconds()).padStart(3, '0');
    return h + ':' + m + ':' + s + '.' + ms;
  }

  /**
   * Internal log function shared by all levels.
   */
  function log(level, message) {
    var entry = {
      timestamp: formatTimestamp(),
      level: level,
      message: message
    };

    entries.push(entry);

    // Enforce FIFO limit
    if (entries.length > MAX_ENTRIES) {
      entries.splice(0, entries.length - MAX_ENTRIES);
    }

    // Console output with color
    var colorMap = {
      info: 'color: #2196F3',
      success: 'color: #4CAF50',
      warn: 'color: #FF9800',
      error: 'color: #F44336'
    };
    console.log(
      '%c[' + entry.timestamp + '] [' + level.toUpperCase() + '] ' + message,
      colorMap[level] || ''
    );

    // Notify registered callbacks
    for (var i = 0; i < newEntryCallbacks.length; i++) {
      try {
        newEntryCallbacks[i](entry);
      } catch (err) {
        console.error('Logger callback error:', err);
      }
    }
  }

  var Logger = {
    /**
     * Log an informational message (blue).
     */
    info: function (message) {
      log('info', message);
    },

    /**
     * Log a success message (green).
     */
    success: function (message) {
      log('success', message);
    },

    /**
     * Log a warning message (orange).
     */
    warn: function (message) {
      log('warn', message);
    },

    /**
     * Log an error message (red).
     */
    error: function (message) {
      log('error', message);
    },

    /**
     * Clear all log entries and notify callbacks with a sentinel.
     */
    clear: function () {
      entries = [];
    },

    /**
     * Return a copy of all current log entries.
     */
    getEntries: function () {
      return entries.slice();
    },

    /**
     * Register a callback invoked whenever a new entry is created.
     * Callback signature: function(entry) where entry = { timestamp, level, message }
     */
    onNewEntry: function (callback) {
      if (typeof callback === 'function') {
        newEntryCallbacks.push(callback);
      }
    }
  };

  window.Logger = Logger;
})();
