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

    for (const addr of allAddresses) {
      for (let i = 0; i < addr.count; i++) {
        const key = `${addr.device}${addr.address + i}`
        const reg = data.registers.find(r => r.addr === key)
        if (reg !== undefined) {
          point[key] = reg.value
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
