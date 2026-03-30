/**
 * PLC 주소 관련 유틸리티 함수
 * MonitorTab과 App에서 공통으로 사용되는 주소 확장, 라벨 매핑, 그래프 분류 로직
 */

/**
 * 등록된 주소 목록에서 모든 개별 키를 추출
 * @param {Array} addresses - 주소 설정 배열
 * @returns {string[]} 확장된 키 배열 (e.g., ['D0', 'D1', 'D2'])
 */
export function expandKeys(addresses) {
  const keys = []
  for (const addr of addresses) {
    for (let i = 0; i < addr.count; i++) {
      keys.push(`${addr.device}${addr.address + i}`)
    }
  }
  return keys
}

/**
 * 주소 목록에서 키-라벨 매핑 생성
 * @param {Array} addresses - 주소 설정 배열
 * @returns {Object} { key: label } 매핑
 */
export function buildLabelMap(addresses) {
  const labels = {}
  for (const addr of addresses) {
    for (let i = 0; i < addr.count; i++) {
      const key = `${addr.device}${addr.address + i}`
      labels[key] = addr.label && addr.count === 1
        ? addr.label
        : addr.label
          ? `${addr.label} [${key}]`
          : key
    }
  }
  return labels
}

/**
 * 주소 목록을 graphEnabled 기준으로 overlaid/individual로 분류
 * @param {Array} addresses - 주소 설정 배열
 * @returns {{ overlaidKeys, overlaidLabels, individualKeys, individualLabels }}
 */
export function splitByGraphEnabled(addresses) {
  const overlaidKeys = []
  const overlaidLabels = {}
  const individualKeys = []
  const individualLabels = {}

  for (const addr of addresses) {
    for (let i = 0; i < addr.count; i++) {
      const key = `${addr.device}${addr.address + i}`
      const label = addr.label && addr.count === 1
        ? addr.label
        : addr.label
          ? `${addr.label} [${key}]`
          : key

      if (addr.graphEnabled) {
        overlaidKeys.push(key)
        overlaidLabels[key] = label
      } else {
        individualKeys.push(key)
        individualLabels[key] = label
      }
    }
  }

  return { overlaidKeys, overlaidLabels, individualKeys, individualLabels }
}

/**
 * 문자열의 간단한 해시코드 (데모 데이터 기준값 생성용)
 * @param {string} str
 * @returns {number}
 */
export function hashCode(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return hash
}
