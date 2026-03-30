$client = New-Object System.Net.Sockets.TcpClient("127.0.0.1", 18080)
$stream = $client.GetStream()

$testKey = "dGhlIHNhbXBsZSBub25jZQ=="
$request = "GET / HTTP/1.1`r`nHost: 127.0.0.1:18080`r`nUpgrade: websocket`r`nConnection: Upgrade`r`nSec-WebSocket-Key: $testKey`r`nSec-WebSocket-Version: 13`r`n`r`n"

$bytes = [System.Text.Encoding]::ASCII.GetBytes($request)
$stream.Write($bytes, 0, $bytes.Length)
$stream.Flush()

Start-Sleep -Milliseconds 1000

$buffer = New-Object byte[] 4096
$read = $stream.Read($buffer, 0, $buffer.Length)

$responseText = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $read)
Write-Host "=== Server Response ($read bytes) ==="
Write-Host $responseText

# Compute correct Accept key locally using .NET SHA1
$guid = "258EAFA5-E914-47DA-95CA-5AB5DC11D65A"
$input = $testKey + $guid
$sha1 = [System.Security.Cryptography.SHA1]::Create()
$hashBytes = $sha1.ComputeHash([System.Text.Encoding]::ASCII.GetBytes($input))
$expectedAccept = [System.Convert]::ToBase64String($hashBytes)

Write-Host ""
Write-Host "=== Verification ==="
Write-Host "Test Key:        $testKey"
Write-Host "Expected Accept: $expectedAccept"

# Extract actual Accept key from response
$lines = $responseText -split "`r`n"
$actualAccept = ""
foreach ($line in $lines) {
    if ($line -match "Sec-WebSocket-Accept:\s*(.+)") {
        $actualAccept = $Matches[1].Trim()
    }
}
Write-Host "Actual Accept:   $actualAccept"

if ($actualAccept -eq $expectedAccept) {
    Write-Host ""
    Write-Host "[PASS] Accept key is CORRECT! Handshake should work."
    Write-Host "If browser still gets code 1006, the issue is NOT the Accept key."
} else {
    Write-Host ""
    Write-Host "[FAIL] Accept key MISMATCH!"
    Write-Host "C++ SHA1 computation has a bug."
}

$client.Close()
