import { useState, useRef, useEffect } from 'react'

const MAX_POINTS = 60  // 최근 60초 (1초 간격)

/**
 * 그래프용 시계열 데이터 버퍼
 *
 * graphEnabled된 주소의 값을 최근 60개로 유지하고
 * recharts 호환 형식으로 변환
 */
export default function useChartHistory(data, graphAddresses) {
  const bufferRef = useRef([])
  const [chartData, setChartData] = useState([])

  useEffect(() => {
    if (!data || !data.registers || graphAddresses.length === 0) {
      return
    }

    const now = new Date()
    const time = now.toTimeString().slice(0, 8)

    // 현재 시점의 데이터 포인트 구성
    const point = { time }

    for (const addr of graphAddresses) {
      // Settings에서 설정한 주소를 기반으로 키 생성
      // count가 있으면 개별 주소별로 매칭 (예: D0, D1, D2, ...)
      for (let i = 0; i < addr.count; i++) {
        const key = `${addr.device}${addr.address + i}`

        // data.registers에서 매칭되는 값 찾기
        const reg = data.registers.find(r => r.addr === key)
        if (reg !== undefined) {
          point[key] = reg.value
        }
      }
    }

    // 버퍼에 추가 (최대 60개 유지)
    const buffer = bufferRef.current
    buffer.push(point)
    if (buffer.length > MAX_POINTS) {
      buffer.shift()
    }

    setChartData([...buffer])
  }, [data, graphAddresses])

  return chartData
}
