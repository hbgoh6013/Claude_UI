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
export default function useSettings(send) {
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
    } catch {
      // ignore
    }
    return { activeProtocol: 'cclink', addresses: [] }
  })

  const { activeProtocol, addresses } = state

  // localStorage에 저장
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      console.warn('[useSettings] Failed to save settings to localStorage')
    }
  }, [state])

  // 연결되면 현재 설정을 백엔드에 전송
  // NOTE: config_sync로 서버에서 주소를 받으므로, 연결 시 자동 전송은 비활성화
  // useEffect(() => {
  //   if (connected && addresses.length > 0) {
  //     syncToBackend(addresses)
  //   }
  // }, [connected])

  const syncToBackend = useCallback((addrs) => {
    send({
      type: 'settings_update',
      protocol: activeProtocol,
      addresses: addrs.map(a => ({
        protocol: a.protocol,
        device: a.device,
        address: a.address,
        count: a.count,
        label: a.label,
        dataType: a.dataType || 'Word',
      })),
    })
  }, [send, activeProtocol])

  const setActiveProtocol = useCallback((protocol) => {
    setState(prev => ({ ...prev, activeProtocol: protocol }))
  }, [])

  const addAddress = useCallback((protocol, device, address, count, label, dataType = 'Word') => {
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
          dataType,
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

  // Called when C++ sends config_sync — replaces address list with server config
  const handleConfigSync = useCallback((serverAddresses) => {
    if (!Array.isArray(serverAddresses) || serverAddresses.length === 0) return
    setState(prev => ({
      ...prev,
      addresses: serverAddresses.map(a => ({
        id: crypto.randomUUID(),
        protocol: 'cclink',
        device: a.device || 'D',
        address: a.address ?? 0,
        count: a.count ?? 1,
        label: a.label || `${a.device}${a.address}`,
        dataType: a.dataType || 'Word',
        graphEnabled: false,
      })),
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
    handleConfigSync,
  }
}
