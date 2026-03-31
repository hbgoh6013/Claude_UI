/**
 * WebSocket Connection Manager
 * Manages a persistent WebSocket connection to the PLC backend
 * with automatic reconnection and callback-based event handling.
 */
(function () {
  'use strict';

  var WS_URL = 'ws://127.0.0.1:18080';
  var RECONNECT_INTERVAL = 3000;

  var socket = null;
  var reconnectTimer = null;
  var state = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
  var intentionalClose = false;

  var dataCallbacks = [];
  var statusCallbacks = [];

  /**
   * Safely access the Logger (may not be loaded yet).
   */
  function log(level, message) {
    if (window.Logger && typeof window.Logger[level] === 'function') {
      window.Logger[level](message);
    }
  }

  /**
   * Update internal state and notify all status callbacks.
   */
  function setState(newState) {
    if (state === newState) return;
    state = newState;
    for (var i = 0; i < statusCallbacks.length; i++) {
      try {
        statusCallbacks[i](state);
      } catch (err) {
        console.error('Status callback error:', err);
      }
    }
  }

  /**
   * Schedule an automatic reconnection attempt.
   */
  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      if (!intentionalClose && state === 'disconnected') {
        log('info', 'WebSocket: Attempting reconnect...');
        connect();
      }
    }, RECONNECT_INTERVAL);
  }

  /**
   * Initiate a WebSocket connection.
   */
  function connect() {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    intentionalClose = false;
    setState('connecting');
    log('info', 'WebSocket: Connecting to ' + WS_URL + '...');

    try {
      socket = new WebSocket(WS_URL);
    } catch (err) {
      log('error', 'WebSocket: Failed to create connection - ' + err.message);
      setState('disconnected');
      scheduleReconnect();
      return;
    }

    socket.onopen = function () {
      setState('connected');
      log('success', 'WebSocket: Connected to ' + WS_URL);
    };

    socket.onclose = function (event) {
      setState('disconnected');
      if (intentionalClose) {
        log('info', 'WebSocket: Connection closed');
      } else {
        log('warn', 'WebSocket: Connection lost (code: ' + event.code + '). Reconnecting in ' + (RECONNECT_INTERVAL / 1000) + 's...');
        scheduleReconnect();
      }
      socket = null;
    };

    socket.onerror = function () {
      log('error', 'WebSocket: Connection error');
      // onclose will fire after onerror, so reconnect is handled there
    };

    socket.onmessage = function (event) {
      var data;
      try {
        data = JSON.parse(event.data);
      } catch (err) {
        log('error', 'WebSocket: Failed to parse message - ' + err.message);
        return;
      }

      // Dispatch to all registered data callbacks
      for (var i = 0; i < dataCallbacks.length; i++) {
        try {
          dataCallbacks[i](data);
        } catch (err) {
          console.error('Data callback error:', err);
        }
      }
    };
  }

  /**
   * Intentionally close the WebSocket connection.
   */
  function disconnect() {
    intentionalClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.close();
      socket = null;
    }
    setState('disconnected');
  }

  /**
   * Send a JSON-serializable object through the WebSocket.
   */
  function send(data) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      log('warn', 'WebSocket: Cannot send - not connected');
      return false;
    }
    try {
      socket.send(JSON.stringify(data));
      return true;
    } catch (err) {
      log('error', 'WebSocket: Send failed - ' + err.message);
      return false;
    }
  }

  var PLCWebSocket = {
    /**
     * Initiate WebSocket connection.
     */
    connect: connect,

    /**
     * Close WebSocket connection. Stops auto-reconnect.
     */
    disconnect: disconnect,

    /**
     * Send a JSON object to the backend.
     * Example: PLCWebSocket.send({ type: "settings_update", protocol: "cclink", addresses: [...] })
     * Returns true on success, false on failure.
     */
    send: send,

    /**
     * Register a callback for incoming data messages.
     * Callback receives the parsed JSON object.
     * Message formats:
     *   { "registers": [{ "addr": "D100", "value": -673.0 }, ...] }
     *   { "type": "config_sync", "addresses": [...] }
     */
    onData: function (callback) {
      if (typeof callback === 'function') {
        dataCallbacks.push(callback);
      }
    },

    /**
     * Register a callback for connection status changes.
     * Callback receives the new state string: 'disconnected' | 'connecting' | 'connected'
     */
    onStatusChange: function (callback) {
      if (typeof callback === 'function') {
        statusCallbacks.push(callback);
      }
    },

    /**
     * Returns true if the WebSocket is currently connected.
     */
    isConnected: function () {
      return state === 'connected';
    }
  };

  window.PLCWebSocket = PLCWebSocket;
})();
