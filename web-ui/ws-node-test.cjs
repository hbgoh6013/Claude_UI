// Node.js WebSocket + HTTP server for comparison testing
// Usage: node ws-node-test.cjs
// Then open http://127.0.0.1:19080 in the browser
const http = require('http');
const crypto = require('crypto');

const PORT = 19080;
const WS_GUID = '258EAFA5-E914-47DA-95CA-5AB5DC11D65A';

// HTML test page served over HTTP (not file://)
const TEST_HTML = `<!DOCTYPE html>
<html>
<head><title>WebSocket Comparison Test</title></head>
<body>
<h2>WebSocket Comparison Test (served via HTTP)</h2>
<p>Origin: <span id="origin"></span></p>
<div id="log" style="font-family:monospace; white-space:pre-wrap; background:#111; color:#0f0; padding:10px;"></div>
<script>
document.getElementById('origin').textContent = location.origin;

function log(msg) {
  var el = document.getElementById('log');
  el.textContent += new Date().toTimeString().slice(0,8) + ' ' + msg + '\\n';
  console.log(msg);
}

function testWebSocket(label, url) {
  log('[' + label + '] Connecting to ' + url + '...');
  try {
    var ws = new WebSocket(url);
    ws.onopen = function() { log('[' + label + '] OPEN - connected!'); };
    ws.onmessage = function(e) { log('[' + label + '] MESSAGE: ' + e.data.substring(0, 200)); };
    ws.onerror = function() { log('[' + label + '] ERROR'); };
    ws.onclose = function(e) { log('[' + label + '] CLOSE code=' + e.code + ' reason="' + e.reason + '" clean=' + e.wasClean); };
  } catch(err) {
    log('[' + label + '] EXCEPTION: ' + err.message);
  }
}

log('Protocol: ' + location.protocol);
log('');

// Test C++ server (port 18080)
testWebSocket('C++  ', 'ws://127.0.0.1:18080');

// Test Node.js server (port 19080)
testWebSocket('Node ', 'ws://127.0.0.1:19080');
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  // Serve the test HTML page
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(TEST_HTML);
});

server.on('upgrade', (req, socket, head) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto.createHash('sha1')
    .update(key + WS_GUID)
    .digest('base64');

  console.log('[Node-WS] Key:', key);
  console.log('[Node-WS] Accept:', acceptKey);

  const response = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Accept: ' + acceptKey,
    '',
    ''
  ].join('\r\n');

  console.log('[Node-WS] Sending 101 (' + response.length + ' bytes)');
  socket.write(response);

  // Send a test message after 1 second
  setTimeout(() => {
    const msg = JSON.stringify({ type: 'test', message: 'Hello from Node.js WebSocket!' });
    const buf = Buffer.from(msg);
    const frame = Buffer.alloc(2 + buf.length);
    frame[0] = 0x81; // FIN + text
    frame[1] = buf.length; // payload length (< 126)
    buf.copy(frame, 2);
    socket.write(frame);
    console.log('[Node-WS] Sent test message');
  }, 1000);

  socket.on('data', (data) => {
    console.log('[Node-WS] Received', data.length, 'bytes from client');
  });

  socket.on('close', () => {
    console.log('[Node-WS] Client disconnected');
  });

  socket.on('error', (err) => {
    console.log('[Node-WS] Socket error:', err.message);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('=== Test server ready ===');
  console.log('Open in browser: http://127.0.0.1:' + PORT);
  console.log('This tests both C++ (18080) and Node.js (19080) WebSocket servers');
  console.log('');
});
