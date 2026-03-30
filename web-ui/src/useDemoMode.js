import { useState, useEffect, useRef, useMemo } from 'react'
import { expandKeys, buildLabelMap, hashCode } from './utils/addressUtils'

// 사용자가 등록한 주소를 기반으로 데모 데이터 포인트 생성
function generateDemoPoint(allKeys, prevBuffer) {
  const now = new Date()
  const time = now.toTimeString().slice(0, 8)
  const point = { time }
  const prev = prevBuffer.length > 0 ? prevBuffer[prevBuffer.length - 1] : null

  for (const key of allKeys) {
    const isbit = key.startsWith('M') || key.startsWith('X') || key.startsWith('Y')
      || key.startsWith('CO') || key.startsWith('DI')
      || key.startsWith('I') || key.startsWith('Q')

    if (isbit) {
      // 비트 디바이스: 0 또는 1, 가끔 토글
      point[key] = prev && prev[key] !== undefined
        ? (Math.random() > 0.95 ? (prev[key] === 0 ? 1 : 0) : prev[key])
        : Math.round(Math.random())
    } else {
      // 워드 디바이스: 랜덤 워크
      const base = 5000 + Math.abs(hashCode(key) % 25000)
      const prevVal = prev && prev[key] !== undefined ? prev[key] : base
      point[key] = Math.round(Math.max(0, Math.min(65535, prevVal + (Math.random() - 0.5) * 200)))
    }
  }

  return point
}

const DEMO_DEVICES = [
  { station: 1, name: 'Formation Charger #1', type: 'Remote Device', status: 'RUN', value: 85 },
  { station: 2, name: 'Formation Charger #2', type: 'Remote Device', status: 'RUN', value: 72 },
  { station: 3, name: 'Aging Chamber', type: 'Remote I/O', status: 'RUN', value: 45 },
  { station: 4, name: 'Inspection Unit', type: 'Remote Device', status: 'RUN', value: 98 },
  { station: 5, name: 'Stacking Machine', type: 'Remote I/O', status: 'RUN', value: 63 },
]

/**
 * 데모 모드 시뮬레이션 데이터를 관리하는 훅
 * @param {boolean} demoMode - 데모 모드 활성화 여부
 * @param {Array} allAddresses - 등록된 주소 설정 배열
 * @returns {{ demoBuffer, demoRegisters, demoOverlaidKeys, demoIndividualKeys, allLabelsMap, DEMO_DEVICES }}
 */
export default function useDemoMode(demoMode, allAddresses) {
  const [demoBuffer, setDemoBuffer] = useState([])
  const [demoRegisters, setDemoRegisters] = useState([])
  const demoBufferRef = useRef([])

  // 등록된 모든 키
  const allKeys = useMemo(() => expandKeys(allAddresses), [allAddresses])
  const allKeysKey = useMemo(() => allKeys.join(','), [allKeys])

  // demo용 overlaid/individual 키 계산
  const demoOverlaidKeys = useMemo(
    () => expandKeys(allAddresses.filter(a => a.graphEnabled)),
    [allAddresses]
  )

  const demoIndividualKeys = useMemo(
    () => expandKeys(allAddresses.filter(a => !a.graphEnabled)),
    [allAddresses]
  )

  // 라벨 매핑
  const allLabelsMap = useMemo(() => buildLabelMap(allAddresses), [allAddresses])

  useEffect(() => {
    if (!demoMode || allKeys.length === 0) return undefined
    demoBufferRef.current = []
    const timer = setInterval(() => {
      const point = generateDemoPoint(allKeys, demoBufferRef.current)
      demoBufferRef.current = [...demoBufferRef.current, point].slice(-60)
      setDemoBuffer([...demoBufferRef.current])
      setDemoRegisters(allKeys.map(key => ({ addr: key, value: point[key] })))
    }, 1000)
    return () => {
      clearInterval(timer)
      demoBufferRef.current = []
    }
  }, [demoMode, allKeysKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    demoBuffer,
    demoRegisters,
    demoOverlaidKeys,
    demoIndividualKeys,
    allLabelsMap,
    demoDevices: DEMO_DEVICES,
  }
}
