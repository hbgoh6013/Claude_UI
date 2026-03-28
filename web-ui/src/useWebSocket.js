import { useState, useEffect, useRef, useCallback } from 'react'

/**
 * WebSocket 연결을 관리하는 React 커스텀 훅
 *
 * @param {string} url - WebSocket 서버 주소 (기본: ws://localhost:8080)
 * @returns {{ data: object|null, connected: boolean, logs: array, send: function }}
 */
export default function useWebSocket(url = 'ws://localhost:8080') {
  const [data, setData] = useState(null)
  const [connected, setConnected] = useState(false)
  const [logs, setLogs] = useState([])

  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const reconnectCountRef = useRef(0)

  const addLog = useCallback((msg, type = 'info') => {
    const now = new Date()
    const time = now.toTimeString().slice(0, 8)
    setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 50))
  }, [])

  const connect = useCallback(() => {
    // 이미 연결 중이면 무시
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return
    }

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        reconnectCountRef.current = 0
        addLog(`Connected to ${url}`, 'success')
      }

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data)
          setData(parsed)
        } catch (err) {
          addLog(`JSON parse error: ${err.message}`, 'error')
        }
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null

        // 자동 재접속 (3초 후)
        reconnectCountRef.current += 1
        const attempt = reconnectCountRef.current
        addLog(`Disconnected. Reconnecting (#${attempt}) in 3s...`, 'warning')

        reconnectTimerRef.current = setTimeout(() => {
          connect()
        }, 3000)
      }

      ws.onerror = () => {
        addLog('WebSocket connection error', 'error')
        // onclose가 자동으로 호출되므로 여기서 재접속 불필요
      }

    } catch (err) {
      addLog(`Failed to create WebSocket: ${err.message}`, 'error')
    }
  }, [url, addLog])

  useEffect(() => {
    addLog('Connecting to C++ WebSocket server...', 'info')
    connect()

    // 컴포넌트 언마운트 시 정리
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.onclose = null  // 언마운트 시 재접속 방지
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect, addLog])

  // C++ 백엔드로 메시지 전송
  const send = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  return { data, connected, logs, send }
}
