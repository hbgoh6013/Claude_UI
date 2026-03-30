import { useState, useRef, useEffect } from 'react'

const MAX_POINTS = 60  // 최근 60초 (1초 간격)

/**
 * 모든 설정된 주소의 시계열 데이터를 수집
 * recharts 호환 형식으로 변환
 */
export default function useChartHistory(data, allAddresses) {
  const bufferRef = useRef([])
  const [chartData, setChartData] = useState([])

  useEffect(() => {
    if (!data || !data.registers || allAddresses.length === 0) {
      return
    }

    const now = new Date()
    const time = now.toTimeString().slice(0, 8)

    const point = { time }

    // Build a Map for O(1) register lookups instead of O(n) find()
    const registerMap = new Map()
    for (const r of data.registers) {
      registerMap.set(r.addr, r.value)
    }

    for (const addr of allAddresses) {
      for (let i = 0; i < addr.count; i++) {
        const key = `${addr.device}${addr.address + i}`
        if (registerMap.has(key)) {
          point[key] = registerMap.get(key)
        }
      }
    }

    const buffer = bufferRef.current
    buffer.push(point)
    if (buffer.length > MAX_POINTS) {
      buffer.shift()
    }

    setChartData([...buffer])
  }, [data, allAddresses])

  return chartData
}
