import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'plc-monitor-settings'

const PROTOCOLS = [
  { id: 'cclink', name: 'CC-Link IE', devices: ['D', 'M', 'Y', 'X', 'W', 'B'] },
  { id: 'opcua', name: 'OPC UA', devices: ['ns2:Tag'] },
  { id: 'mc', name: 'MC Protocol', devices: ['D', 'M', 'Y', 'X', 'W', 'R'] },
  { id: 's7', name: 'S7 (Siemens)', devices: ['DB', 'I', 'Q', 'M'] },
  { id: 'modbus', name: 'Modbus TCP', devices: ['HR', 'IR', 'CO', 'DI'] },
]

/**
 * PLC 디바이스 주소 설정을 관리하는 훅
 * - 프로토콜별로 주소 관리
 * - localStorage에 자동 저장/불러오기
 * - WebSocket으로 C++ 백엔드에 설정 전송
 */
export default function useSettings(send, connected) {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        // 이전 버전 호환 (배열이면 cclink 프로토콜로 마이그레이션)
        if (Array.isArray(parsed)) {
          return {
            activeProtocol: 'cclink',
            addresses: parsed.map(a => ({ ...a, protocol: 'cclink' })),
          }
        }
        return parsed
      }
    } catch (e) {
      // ignore
    }
    return { activeProtocol: 'cclink', addresses: [] }
  })

  const { activeProtocol, addresses } = state

  // localStorage에 저장
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  // 연결되면 현재 설정을 백엔드에 전송
  useEffect(() => {
    if (connected && addresses.length > 0) {
      syncToBackend(addresses)
    }
  }, [connected])

  const syncToBackend = useCallback((addrs) => {
    send({
      type: 'settings_update',
      protocol: activeProtocol,
      addresses: addrs.map(a => ({
        protocol: a.protocol,
        device: a.device,
        address: a.address,
        count: a.count,
      })),
    })
  }, [send, activeProtocol])

  const setActiveProtocol = useCallback((protocol) => {
    setState(prev => ({ ...prev, activeProtocol: protocol }))
  }, [])

  const addAddress = useCallback((protocol, device, address, count, label) => {
    setState(prev => {
      const exists = prev.addresses.some(
        a => a.protocol === protocol && a.device === device && a.address === address && a.count === count
      )
      if (exists) return prev

      const next = {
        ...prev,
        addresses: [...prev.addresses, {
          id: crypto.randomUUID(),
          protocol,
          device,
          address,
          count,
          label: label || `${device}${address}`,
          graphEnabled: false,
        }],
      }
      syncToBackend(next.addresses)
      return next
    })
  }, [syncToBackend])

  const removeAddress = useCallback((id) => {
    setState(prev => {
      const next = { ...prev, addresses: prev.addresses.filter(a => a.id !== id) }
      syncToBackend(next.addresses)
      return next
    })
  }, [syncToBackend])

  const updateAddress = useCallback((id, changes) => {
    setState(prev => {
      const next = { ...prev, addresses: prev.addresses.map(a => a.id === id ? { ...a, ...changes } : a) }
      syncToBackend(next.addresses)
      return next
    })
  }, [syncToBackend])

  const toggleGraph = useCallback((id) => {
    setState(prev => ({
      ...prev,
      addresses: prev.addresses.map(a => a.id === id ? { ...a, graphEnabled: !a.graphEnabled } : a),
    }))
  }, [])

  return {
    protocols: PROTOCOLS,
    activeProtocol,
    setActiveProtocol,
    addresses,
    addAddress,
    removeAddress,
    updateAddress,
    toggleGraph,
  }
}
