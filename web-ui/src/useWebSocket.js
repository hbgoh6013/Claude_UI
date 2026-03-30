import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * WebSocket 연결을 관리하는 React 커스텀 훅
 *
 * @param {string} url - WebSocket 서버 주소 (기본: Vite 프록시 /ws 경로)
 * @param {object} options
 * @param {function} [options.onConfigSync] - config_sync 메시지 수신 시 호출되는 콜백
 * @returns {{ data: object|null, connected: boolean, logs: array, send: function }}
 */
export default function useWebSocket(url, { onConfigSync } = {}) {
  // Vite 프록시 경로 사용: 브라우저 보안 정책(Private Network Access) 우회
  if (!url) {
    const loc = window.location
    const wsProto = loc.protocol === 'https:' ? 'wss:' : 'ws:'
    url = `${wsProto}//${loc.host}/ws`
  }
  const onConfigSyncRef = useRef(onConfigSync)
  useEffect(() => { onConfigSyncRef.current = onConfigSync }, [onConfigSync])

  const [data, setData] = useState(null)
  const [connected, setConnected] = useState(false)
  const [logs, setLogs] = useState([])

  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const reconnectCountRef = useRef(0)
  const urlRef = useRef(url)
  urlRef.current = url

  const addLog = useCallback((msg, type = 'info') => {
    const now = new Date()
    const time = now.toTimeString().slice(0, 8)
    setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 50))
  }, [])

  // connect를 ref에 저장하여 useEffect deps에서 제외
  const connectRef = useRef(null)
  connectRef.current = function connect() {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return
    }

    // 이전 소켓이 CONNECTING 상태면 정리
    if (wsRef.current && wsRef.current.readyState === WebSocket.CONNECTING) {
      wsRef.current.onopen = null
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.onmessage = null
      wsRef.current.close()
      wsRef.current = null
    }

    try {
      const currentUrl = urlRef.current
      const ws = new WebSocket(currentUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        reconnectCountRef.current = 0
        addLog(`Connected to ${currentUrl}`, 'success')
      }

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          if (parsed.type === 'config_sync') {
            onConfigSyncRef.current?.(parsed.addresses)
          } else {
            setData(parsed)
          }
        } catch (err) {
          addLog(`JSON parse error: ${err.message}`, 'error')
        }
      }

      ws.onclose = (event) => {
        setConnected(false)
        wsRef.current = null

        reconnectCountRef.current += 1
        const attempt = reconnectCountRef.current
        addLog(`Disconnected (code=${event.code}). Reconnecting (#${attempt}) in 3s...`, 'warning')

        reconnectTimerRef.current = setTimeout(() => {
          connectRef.current?.()
        }, 3000)
      }

      ws.onerror = () => {
        addLog('WebSocket connection error', 'error')
      }

    } catch (err) {
      addLog(`Failed to create WebSocket: ${err.message}`, 'error')
    }
  }

  // 마운트 시 1회만 실행, 언마운트 시 정리
  useEffect(() => {
    addLog('Connecting to C++ WebSocket server...', 'info')
    connectRef.current?.()

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  return { data, connected, logs, send }
}
