// 매장 검색 — 이름/주소/지역/카테고리/키워드를 통합으로 검색하고,
// 이름에 오타·띄어쓰기 실수가 있어도 편집거리 기반으로 비슷한 결과를 찾아줌.

function normalize(str) {
  return (str || "").toLowerCase().replace(/\s+/g, "")
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i++) dp[i][0] = i
  for (let j = 0; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[a.length][b.length]
}

// 검색어 길이에 비례해서 허용하는 오타 개수. 너무 짧은 검색어(2~3글자)에 관대한 거리를 주면
// "성동구"가 "유성구"처럼 전혀 다른 지역과도 매칭되는 오탐이 생겨서, 길이가 짧을수록 보수적으로 잡음.
function allowedDistance(len) {
  if (len < 2) return 0
  if (len <= 5) return 1
  return Math.floor(len * 0.25)
}

// text 안에 query와 비슷한 부분이 있는지 (오타/띄어쓰기 허용)
export function fuzzyIncludes(text, query) {
  const nQuery = normalize(query)
  if (!nQuery) return true
  const nText = normalize(text)
  if (nText.includes(nQuery)) return true

  const tolerance = allowedDistance(nQuery.length)
  // 검색어보다 짧은 부분 문자열까지 허용하면(예: "성구"가 "성동구"와 1글자 차이) 특히 짧은 단어에서
  // 엉뚱한 지역/단어가 걸리기 쉬워서, 어느 정도 긴 검색어에서만 짧은 쪽도 같이 확인함.
  const minLen = nQuery.length >= 5 ? Math.max(1, nQuery.length - tolerance) : nQuery.length
  const maxLen = nQuery.length + tolerance
  for (let len = minLen; len <= maxLen; len++) {
    for (let start = 0; start + len <= nText.length; start++) {
      if (levenshtein(nText.slice(start, start + len), nQuery) <= tolerance) return true
    }
  }
  return false
}

// 매장 하나가 검색어와 매칭되는지 — 이름/주소/시도/구/카테고리/키워드 중 하나라도 걸리면 매칭
export function storeMatchesQuery(store, query) {
  if (!query.trim()) return true
  const fields = [store.name, store.address, store.sido, store.gu, ...(store.categories || []), ...(store.keywords || [])]
  return fields.some((f) => fuzzyIncludes(f, query))
}
