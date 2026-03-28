import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'plc-monitor-settings'

/**
 * PLC 디바이스 주소 설정을 관리하는 훅
 * - localStorage에 자동 저장/불러오기
 * - WebSocket으로 C++ 백엔드에 설정 전송
 *
 * 주소 형식: { id, device: "D"|"M"|"Y"|"X", address: 0, count: 10, label: "...", graphEnabled: false }
 * → device="D", address=0, count=10 이면 D0~D9 까지 10개를 읽겠다는 뜻
 */
export default function useSettings(send, connected) {
  const [addresses, setAddresses] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      // ignore
    }
    return []
  })

  // localStorage에 저장
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses))
  }, [addresses])

  // 연결되면 현재 설정을 백엔드에 전송
  useEffect(() => {
    if (connected && addresses.length > 0) {
      send({
        type: 'settings_update',
        addresses: addresses.map(a => ({
          device: a.device,
          address: a.address,
          count: a.count,
        })),
      })
    }
  }, [connected])  // connected 변경 시에만

  // 백엔드에 설정 전송
  const syncToBackend = useCallback((addrs) => {
    send({
      type: 'settings_update',
      addresses: addrs.map(a => ({
        device: a.device,
        address: a.address,
        count: a.count,
      })),
    })
  }, [send])

  const addAddress = useCallback((device, address, count, label) => {
    setAddresses(prev => {
      // 중복 체크 (같은 디바이스+주소+count)
      const exists = prev.some(a => a.device === device && a.address === address && a.count === count)
      if (exists) return prev

      const next = [...prev, {
        id: crypto.randomUUID(),
        device,
        address,
        count,
        label: label || `${device}${address}`,
        graphEnabled: false,
      }]
      syncToBackend(next)
      return next
    })
  }, [syncToBackend])

  const removeAddress = useCallback((id) => {
    setAddresses(prev => {
      const next = prev.filter(a => a.id !== id)
      syncToBackend(next)
      return next
    })
  }, [syncToBackend])

  const updateAddress = useCallback((id, changes) => {
    setAddresses(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...changes } : a)
      syncToBackend(next)
      return next
    })
  }, [syncToBackend])

  const toggleGraph = useCallback((id) => {
    setAddresses(prev =>
      prev.map(a => a.id === id ? { ...a, graphEnabled: !a.graphEnabled } : a)
    )
  }, [])

  return { addresses, addAddress, removeAddress, updateAddress, toggleGraph }
}
