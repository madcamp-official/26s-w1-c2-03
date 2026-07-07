import { useMemo, useState } from "react"
import { hierarchy } from "d3-hierarchy"
import { voronoiTreemap } from "d3-voronoi-treemap"
import { polygonCentroid } from "d3-polygon"

// "내 위장 지도" — 여태 방문한 매장 전체를, 방문 횟수에 비례하는 크기의 유기적인 칸으로 위장 실루엣 안에 채운다.
// 자주 간 매장일수록 칸(과 썸네일)이 커져서 어디를 자주 가는지 한눈에 보인다.

const VIEW_W = 420
const VIEW_H = 470

// 위장(stomach) 실루엣 — 위쪽에 식도가 붙는 큰 주머니(위저부) → 아래로 굽어 유문으로 좁아지는 J자 모양
const STOMACH_PATH =
  "M208 46 C150 26 84 44 72 118 C62 178 58 250 92 306 C122 356 190 388 256 378 C312 369 352 336 356 289 C359 260 340 247 319 256 C303 263 296 248 291 227 C284 192 281 150 264 120 C251 96 242 70 208 46 Z"

// 카테고리별 부드러운 색 (앱의 따뜻한 톤에 맞춰 구분되는 파스텔)
const CATEGORY_COLOR = {
  한식: "#f9a8a8",
  중식: "#fbbf24",
  일식: "#7cb6f7",
  양식: "#5cd6a9",
  분식: "#f6a5cd",
  치킨: "#fb9a4b",
  주점: "#b49bf5",
  카페: "#d8ab7d",
  디저트: "#efa8ec",
  기타: "#a7b3c4",
}
const CATEGORY_EMOJI = {
  한식: "🍚", 중식: "🥢", 일식: "🍣", 양식: "🍝", 분식: "🍢",
  치킨: "🍗", 주점: "🍺", 카페: "☕", 디저트: "🍰", 기타: "🍽️",
}
// 카카오로 자동 등록된 매장은 DB에 categories가 없는 경우가 많음 → 그럴 땐 매장별로 고정된 팔레트 색을 배정해
// 칸이 전부 회색이 되지 않고 다채롭게 보이도록 함. 카테고리가 있으면 카테고리 색을 우선.
const PALETTE = ["#fbbf24", "#7cb6f7", "#f6a5cd", "#5cd6a9", "#fb9a4b", "#b49bf5", "#f9a8a8", "#7dd3fc", "#efa8ec", "#d8ab7d"]
// 카테고리 색이 있으면 그걸, 없으면 방문순 index로 팔레트를 돌려 인접 칸이 확실히 구분되게 함
function cellColor(cell, index) {
  if (cell.category && CATEGORY_COLOR[cell.category]) return CATEGORY_COLOR[cell.category]
  if (cell.isOther) return CATEGORY_COLOR["기타"]
  return PALETTE[index % PALETTE.length]
}
function emojiFor(cat) {
  return CATEGORY_EMOJI[cat] || "🍽️"
}
// 배경 채도를 살짝 낮춘(연하게) 버전 — 칸 배경용
function tint(hex, amount = 0.4) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const mix = (c) => Math.round(c + (255 - c) * amount)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}
function darken(hex, amount = 0.35) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const mix = (c) => Math.round(c * (1 - amount))
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

const MAX_CELLS = 18 // 이보다 많으면 하위권은 "기타"로 묶어 가독성 유지 (그래도 전체를 커버)

// 위장 path를 클리핑용 폴리곤(점 배열)으로 샘플링 — 그려지는 외곽선과 정확히 일치시키기 위함
function sampleStomachPolygon(samples = 140) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
  path.setAttribute("d", STOMACH_PATH)
  const len = path.getTotalLength()
  const pts = []
  for (let i = 0; i < samples; i++) {
    const p = path.getPointAtLength((i / samples) * len)
    pts.push([p.x, p.y])
  }
  return pts
}

// 결정론적 난수(mulberry32) — 렌더마다 배치가 튀지 않도록 시드 고정
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function polygonToPath(poly) {
  return "M" + poly.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L") + "Z"
}

// 점에서 선분까지의 거리 (칸 안에 들어가는 원=썸네일 반지름 근사용)
function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  let t = l2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  const cx = a[0] + t * dx, cy = a[1] + t * dy
  return Math.hypot(p[0] - cx, p[1] - cy)
}
function inscribedRadius(poly, center) {
  let min = Infinity
  for (let i = 0; i < poly.length; i++) {
    const d = distToSegment(center, poly[i], poly[(i + 1) % poly.length])
    if (d < min) min = d
  }
  return min
}

export default function StomachMap({ stores, onSelectStore }) {
  const [active, setActive] = useState(null) // 지금 호버/탭한 칸의 key

  // 방문 횟수 내림차순 정렬 후, 너무 많으면 하위권을 "기타"로 묶음
  const cells = useMemo(() => {
    const sorted = [...(stores || [])].filter((s) => (s.count ?? 0) > 0).sort((a, b) => b.count - a.count)
    const toCell = (s, i) => ({
      key: s.id,
      name: s.name,
      count: s.count,
      image_url: s.image_url,
      category: (s.categories || [])[0],
      colorIndex: i,
      stores: [s],
    })
    if (sorted.length <= MAX_CELLS) {
      return sorted.map(toCell)
    }
    const head = sorted.slice(0, MAX_CELLS - 1)
    const tail = sorted.slice(MAX_CELLS - 1)
    const cellsHead = head.map(toCell)
    cellsHead.push({
      key: "__etc__",
      name: `기타 ${tail.length}곳`,
      count: tail.reduce((sum, s) => sum + s.count, 0),
      image_url: null,
      category: "기타",
      isOther: true,
      colorIndex: head.length,
      stores: tail,
    })
    return cellsHead
  }, [stores])

  // 위장 폴리곤에 맞춰 weighted Voronoi treemap 계산
  const leaves = useMemo(() => {
    if (cells.length === 0) return []
    let polygon
    try {
      polygon = sampleStomachPolygon()
    } catch {
      return []
    }
    const root = hierarchy({ children: cells }).sum((d) => Math.max(d.count, 0.001))
    try {
      voronoiTreemap()
        .clip(polygon)
        .prng(mulberry32(42))
        .minWeightRatio(0.008)
        .convergenceRatio(0.01)
        .maxIterationCount(120)(root)
    } catch {
      return []
    }
    return root.leaves().map((leaf) => {
      const poly = leaf.polygon
      const center = polygonCentroid(poly)
      const r = inscribedRadius(poly, center)
      return { data: leaf.data, poly, center, r }
    })
  }, [cells])

  if (!stores || stores.length === 0 || leaves.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl bg-slate-50 px-4 py-10 text-center">
        <span className="text-4xl">🍽️</span>
        <p className="mt-3 text-sm text-slate-400">
          아직 방문 기록이 없어요.
          <br />
          맛집을 방문 인증하면 여기 위장이 채워져요!
        </p>
      </div>
    )
  }

  const activeLeaf = leaves.find((l) => l.data.key === active)

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="mx-auto block w-full max-w-[380px] select-none"
      onMouseLeave={() => setActive(null)}
    >
      <defs>
        {/* 손그림 느낌의 미세한 흔들림 (칸 테두리에만 적용) */}
        <filter id="stomach-wobble">
          <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" />
        </filter>
        <clipPath id="stomach-clip">
          <path d={STOMACH_PATH} />
        </clipPath>
        {/* 썸네일 원형 클립 — 이미지가 translate된 그룹 안에 있으므로 (0,0) 기준으로 정의 */}
        {leaves.map((l) => (
          <clipPath key={l.data.key} id={`thumb-${l.data.key}`}>
            <circle cx={0} cy={0} r={Math.max(0, l.r * 0.78)} />
          </clipPath>
        ))}
      </defs>

      {/* 위장 바깥 은은한 그림자/배경 */}
      <path d={STOMACH_PATH} fill="#fff" stroke="none" />

      {/* 칸 배경 + 테두리 (흔들림 필터) */}
      <g filter="url(#stomach-wobble)" clipPath="url(#stomach-clip)">
        {leaves.map((l) => {
          const color = cellColor(l.data, l.data.colorIndex)
          return (
            <path
              key={l.data.key}
              d={polygonToPath(l.poly)}
              fill={tint(color, 0.45)}
              stroke={darken(color, 0.35)}
              strokeWidth={active === l.data.key ? 3.4 : 2.2}
              strokeLinejoin="round"
              style={{ transition: "fill .5s ease, stroke-width .2s ease" }}
            />
          )
        })}
      </g>

      {/* 썸네일 + 텍스트 (필터 없이 또렷하게, 부드럽게 재배치) */}
      {leaves.map((l) => {
        const { center, r, data } = l
        const cx = center[0], cy = center[1]
        const thumbR = Math.max(0, r * 0.78)
        const showLabel = r >= 24 // 칸이 충분히 클 때만 이름/횟수 상시 노출
        const color = cellColor(data, data.colorIndex)
        return (
          <g
            key={data.key}
            style={{ transition: "transform .6s cubic-bezier(.4,0,.2,1)", cursor: "pointer" }}
            transform={`translate(${cx}, ${cy})`}
            onMouseEnter={() => setActive(data.key)}
            onClick={() => {
              setActive(data.key)
              if (!data.isOther && onSelectStore) onSelectStore(data.stores[0])
            }}
          >
            {/* 썸네일 원 (방문 횟수↑ = 칸↑ = 썸네일↑) */}
            <circle
              r={thumbR}
              fill={data.image_url ? "#fff" : tint(color, 0.15)}
              stroke={darken(color, 0.3)}
              strokeWidth="2"
              style={{ transition: "r .6s cubic-bezier(.4,0,.2,1)" }}
            />
            {data.image_url ? (
              <image
                href={data.image_url}
                x={-thumbR}
                y={-thumbR}
                width={thumbR * 2}
                height={thumbR * 2}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#thumb-${data.key})`}
                style={{ transition: "all .6s cubic-bezier(.4,0,.2,1)" }}
              />
            ) : (
              <text textAnchor="middle" dominantBaseline="central" fontSize={Math.min(thumbR * 1.1, 30)}>
                {data.isOther ? "➕" : emojiFor(data.category)}
              </text>
            )}

            {/* 이름 · 방문 횟수 — 칸이 크면 썸네일 아래에 상시 표시 */}
            {showLabel && (
              <g style={{ transition: "opacity .4s ease" }}>
                <text
                  y={thumbR + 13}
                  textAnchor="middle"
                  fontSize={Math.min(Math.max(r * 0.28, 9), 13)}
                  fontWeight="700"
                  fill="#1e293b"
                  style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3, strokeLinejoin: "round" }}
                >
                  {data.name.length > 7 ? data.name.slice(0, 7) + "…" : data.name}
                </text>
                <text
                  y={thumbR + 27}
                  textAnchor="middle"
                  fontSize={Math.min(Math.max(r * 0.24, 8), 11)}
                  fontWeight="700"
                  fill={darken(color, 0.25)}
                  style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3, strokeLinejoin: "round" }}
                >
                  {data.count}회
                </text>
              </g>
            )}
          </g>
        )
      })}

      {/* 위장 외곽선 (손그림 느낌) */}
      <path
        d={STOMACH_PATH}
        fill="none"
        stroke="#475569"
        strokeWidth="3"
        strokeLinejoin="round"
        filter="url(#stomach-wobble)"
      />

      {/* 호버/탭한 칸의 툴팁 (작은 칸이라 라벨이 없던 것도 여기서 정확히 보여줌) */}
      {activeLeaf && (
        <g transform={`translate(${activeLeaf.center[0]}, ${activeLeaf.center[1] - activeLeaf.r - 8})`} pointerEvents="none">
          {(() => {
            const label = `${activeLeaf.data.name} · ${activeLeaf.data.count}회`
            const w = Math.max(64, label.length * 8.2 + 16)
            return (
              <>
                <rect x={-w / 2} y={-26} width={w} height={24} rx={7} fill="#0f172a" opacity="0.92" />
                <text x={0} y={-14} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="600" fill="#fff">
                  {label}
                </text>
              </>
            )
          })()}
        </g>
      )}
    </svg>
  )
}
