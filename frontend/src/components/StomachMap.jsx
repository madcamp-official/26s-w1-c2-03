import { useMemo, useState } from "react"
import { polygonArea, polygonContains, polygonCentroid } from "d3-polygon"

// "내 위장 지도" — 가장 많이 간 Top 5 매장을, 방문 횟수에 비례하는 둥그스름한 블롭으로 위장 실루엣 안에 채운다.
// (빈 곳은 생겨도 됨 — 직선 경계 대신 원형 테두리로 영역을 구분)

const VIEW_W = 440
const VIEW_H = 490
const TOP_N = 5

// 위장(stomach) 실루엣 — 위저부(좌상단 돔) → 몸통 → 유문(우하단)으로 좁아지는 해부학적 J자 모양
const STOMACH_BODY =
  "M206 92 C176 74 140 70 116 86 C82 108 66 146 70 188 C73 232 78 286 112 328 C146 372 208 388 266 376 C318 365 350 331 353 289 C355 261 339 250 318 257 C303 262 297 250 294 231 C289 197 288 156 273 128 C262 105 244 100 206 92 Z"
// 식도(위 입구) — 위저부 위쪽으로 들어오는 짧은 관
const ESOPHAGUS = "M190 96 C186 70 186 52 190 34 C191 27 209 27 211 34 C216 54 214 76 220 96 Z"
// 십이지장(위 출구) — 유문에서 아래로 굽어 나가는 짧은 관
const DUODENUM = "M347 276 C372 278 386 300 378 324 C372 344 352 350 340 340 C332 333 336 322 344 322 C356 320 360 306 352 296 C347 289 340 288 340 282 C340 278 343 276 347 276 Z"

const ORGAN_FILL = "#fdece4"
const ORGAN_STROKE = "#c98f7d"

const CATEGORY_COLOR = {
  한식: "#f9a8a8", 중식: "#fbbf24", 일식: "#7cb6f7", 양식: "#5cd6a9", 분식: "#f6a5cd",
  치킨: "#fb9a4b", 주점: "#b49bf5", 카페: "#d8ab7d", 디저트: "#efa8ec", 기타: "#a7b3c4",
}
const CATEGORY_EMOJI = {
  한식: "🍚", 중식: "🥢", 일식: "🍣", 양식: "🍝", 분식: "🍢",
  치킨: "🍗", 주점: "🍺", 카페: "☕", 디저트: "🍰", 기타: "🍽️",
}
// 카테고리 색이 있으면 그걸, 없으면 방문순 index로 팔레트를 돌려 블롭이 서로 구분되게 함
const PALETTE = ["#fbbf24", "#7cb6f7", "#f6a5cd", "#5cd6a9", "#fb9a4b", "#b49bf5", "#f9a8a8", "#7dd3fc"]
function cellColor(cell, index) {
  if (cell.category && CATEGORY_COLOR[cell.category]) return CATEGORY_COLOR[cell.category]
  return PALETTE[index % PALETTE.length]
}
function emojiFor(cat) {
  return CATEGORY_EMOJI[cat] || "🍽️"
}
function darken(hex, amount = 0.32) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const mix = (c) => Math.round(c * (1 - amount))
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}
function tint(hex, amount = 0.55) {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const mix = (c) => Math.round(c + (255 - c) * amount)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

// 위장 body path를 폴리곤(점 배열)으로 샘플링 — 패킹 경계 + 그려지는 외곽선을 일치시킴
function samplePolygon(pathD, samples = 160) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
  path.setAttribute("d", pathD)
  const len = path.getTotalLength()
  const pts = []
  for (let i = 0; i < samples; i++) {
    const p = path.getPointAtLength((i / samples) * len)
    pts.push([p.x, p.y])
  }
  return pts
}

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 점 p에서 선분 AB까지의 거리와 그 위의 최근접점
function distAndProj(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  let t = l2 === 0 ? 0 : ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  const proj = [a[0] + t * dx, a[1] + t * dy]
  return { dist: Math.hypot(p[0] - proj[0], p[1] - proj[1]), proj }
}

// 위장 폴리곤 안에 원(반지름 = 방문횟수 비례)들을 겹치지 않게 배치. 빈 곳은 허용.
function packCircles(items, polygon) {
  if (items.length === 0) return []
  const area = Math.abs(polygonArea(polygon))
  const centroid = polygonCentroid(polygon)
  const total = items.reduce((s, it) => s + it.count, 0) || 1

  // 여러 번 시도: 다 안 들어가면 전체 반지름을 조금씩 줄여 재시도
  let result = null
  for (let attempt = 0; attempt < 8; attempt++) {
    const fill = 0.62 * (1 - attempt * 0.07) // 원들이 위장 면적에서 차지하는 비율(나머지는 빈 곳)
    const rng = mulberry32(11)
    const nodes = items.map((it, i) => ({
      ...it,
      r: Math.max(Math.sqrt((area * fill * (it.count / total)) / Math.PI), 15),
      x: centroid[0] + (rng() - 0.5) * 60,
      y: centroid[1] - 20 + (rng() - 0.5) * 90,
    }))

    for (let iter = 0; iter < 300; iter++) {
      // 1) 서로 밀어내기
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = b.x - a.x, dy = b.y - a.y
          const d = Math.hypot(dx, dy) || 0.01
          const min = a.r + b.r + 7
          if (d < min) {
            const push = (min - d) / 2
            const ux = dx / d, uy = dy / d
            a.x -= ux * push; a.y -= uy * push
            b.x += ux * push; b.y += uy * push
          }
        }
      }
      // 2) 위장 경계 안으로 (원이 완전히 안에 들어오도록)
      for (const n of nodes) {
        if (!polygonContains(polygon, [n.x, n.y])) {
          n.x += (centroid[0] - n.x) * 0.18
          n.y += (centroid[1] - n.y) * 0.18
        }
        let minD = Infinity, near = null
        for (let k = 0; k < polygon.length; k++) {
          const { dist, proj } = distAndProj([n.x, n.y], polygon[k], polygon[(k + 1) % polygon.length])
          if (dist < minD) { minD = dist; near = proj }
        }
        if (near && minD < n.r + 3) {
          const ux = (n.x - near[0]) / (minD || 0.01)
          const uy = (n.y - near[1]) / (minD || 0.01)
          const need = n.r + 3 - minD
          n.x += ux * need; n.y += uy * need
        }
      }
    }

    // 겹침 남았는지 평가
    let ok = true
    for (let i = 0; i < nodes.length && ok; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (Math.hypot(nodes[j].x - nodes[i].x, nodes[j].y - nodes[i].y) < nodes[i].r + nodes[j].r - 3) { ok = false; break }
      }
    }
    result = nodes
    if (ok) break
  }
  return result
}

export default function StomachMap({ stores, onSelectStore }) {
  const [active, setActive] = useState(null)

  // 방문 많은 Top 5
  const items = useMemo(() => {
    return [...(stores || [])]
      .filter((s) => (s.count ?? 0) > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_N)
      .map((s, i) => ({
        key: s.id,
        name: s.name,
        count: s.count,
        image_url: s.image_url,
        category: (s.categories || [])[0],
        colorIndex: i,
        store: s,
      }))
  }, [stores])

  const nodes = useMemo(() => {
    if (items.length === 0) return []
    try {
      return packCircles(items, samplePolygon(STOMACH_BODY))
    } catch {
      return []
    }
  }, [items])

  if (!stores || stores.length === 0 || nodes.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-2xl bg-slate-50 px-4 py-10 text-center">
        <span className="text-4xl">🫃</span>
        <p className="mt-3 text-sm text-slate-400">
          아직 방문 기록이 없어요.
          <br />
          맛집을 방문 인증하면 여기 위장이 채워져요!
        </p>
      </div>
    )
  }

  const activeNode = nodes.find((n) => n.key === active)

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="mx-auto block w-full max-w-[380px] select-none"
      onMouseLeave={() => setActive(null)}
    >
      <defs>
        {/* 손그림 느낌의 미세한 흔들림 (위장 외곽·블롭 테두리에만) */}
        <filter id="stomach-wobble">
          <feTurbulence type="fractalNoise" baseFrequency="0.014" numOctaves="2" seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4" />
        </filter>
        {nodes.map((n) => (
          <clipPath key={n.key} id={`thumb-${n.key}`}>
            <circle cx={0} cy={0} r={Math.max(0, n.r * 0.9)} />
          </clipPath>
        ))}
      </defs>

      {/* 위장 실루엣 (식도 + 몸통 + 십이지장) */}
      <g filter="url(#stomach-wobble)">
        <path d={ESOPHAGUS} fill={ORGAN_FILL} stroke={ORGAN_STROKE} strokeWidth="2.5" strokeLinejoin="round" />
        <path d={DUODENUM} fill={ORGAN_FILL} stroke={ORGAN_STROKE} strokeWidth="2.5" strokeLinejoin="round" />
        <path d={STOMACH_BODY} fill={ORGAN_FILL} stroke={ORGAN_STROKE} strokeWidth="3.2" strokeLinejoin="round" />
        {/* 위장 주름 느낌의 얇은 곡선 몇 개 */}
        <path d="M120 150 C160 140 210 150 250 145" fill="none" stroke={ORGAN_STROKE} strokeWidth="1.2" opacity="0.35" />
        <path d="M104 300 C150 322 220 330 280 312" fill="none" stroke={ORGAN_STROKE} strokeWidth="1.2" opacity="0.3" />
      </g>

      {/* 블롭(둥그스름한 원) — 방문횟수↑ = 블롭↑ = 썸네일↑ */}
      {nodes.map((n) => {
        const color = cellColor(n, n.colorIndex)
        const thumbR = Math.max(0, n.r * 0.9)
        const isActive = active === n.key
        return (
          <g
            key={n.key}
            transform={`translate(${n.x}, ${n.y})`}
            style={{ transition: "transform .6s cubic-bezier(.4,0,.2,1)", cursor: "pointer" }}
            onMouseEnter={() => setActive(n.key)}
            onClick={() => {
              setActive(n.key)
              if (onSelectStore) onSelectStore(n.store)
            }}
          >
            {/* 둥그스름한 테두리 블롭 (흔들림 필터로 유기적으로) */}
            <circle
              r={n.r}
              fill={tint(color, 0.5)}
              stroke={darken(color, 0.3)}
              strokeWidth={isActive ? 4 : 2.8}
              filter="url(#stomach-wobble)"
              style={{ transition: "r .6s cubic-bezier(.4,0,.2,1), stroke-width .2s ease" }}
            />
            {/* 썸네일 */}
            {n.image_url ? (
              <image
                href={n.image_url}
                x={-thumbR}
                y={-thumbR}
                width={thumbR * 2}
                height={thumbR * 2}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#thumb-${n.key})`}
                style={{ transition: "all .6s cubic-bezier(.4,0,.2,1)" }}
              />
            ) : (
              <text textAnchor="middle" dominantBaseline="central" fontSize={Math.min(thumbR * 1.05, 34)}>
                {emojiFor(n.category)}
              </text>
            )}

            {/* 하단 캡션 밴드 (원 안에 클립) — 매장 이름. 블롭끼리 라벨이 겹치지 않게 원 안에 넣음 */}
            <g clipPath={`url(#thumb-${n.key})`}>
              <rect
                x={-thumbR}
                y={thumbR * 0.36}
                width={thumbR * 2}
                height={thumbR * 0.64}
                fill="#0f172a"
                opacity={isActive ? 0.6 : 0.46}
                style={{ transition: "all .6s cubic-bezier(.4,0,.2,1)" }}
              />
            </g>
            <text
              y={thumbR * 0.68}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={Math.min(Math.max(thumbR * 0.24, 8.5), 13)}
              fontWeight="700"
              fill="#fff"
              style={{ transition: "font-size .6s ease" }}
            >
              {(() => {
                const max = Math.max(4, Math.floor(thumbR / 5.2))
                return n.name.length > max ? n.name.slice(0, max) + "…" : n.name
              })()}
            </text>

            {/* 방문 횟수 배지 (원 상단) */}
            <g transform={`translate(0, ${-thumbR * 0.62})`} style={{ transition: "transform .6s cubic-bezier(.4,0,.2,1)" }}>
              <rect x={-19} y={-10} width={38} height={20} rx={10} fill="#fff" stroke={darken(color, 0.28)} strokeWidth="1.6" />
              <text y={0.5} textAnchor="middle" dominantBaseline="middle" fontSize="11.5" fontWeight="800" fill={darken(color, 0.22)}>
                {n.count}회
              </text>
            </g>
          </g>
        )
      })}

      {/* 호버/탭 툴팁 */}
      {activeNode && (
        <g transform={`translate(${activeNode.x}, ${activeNode.y - activeNode.r - 10})`} pointerEvents="none">
          {(() => {
            const label = `${activeNode.name} · ${activeNode.count}회`
            const w = Math.max(70, label.length * 8.4 + 18)
            return (
              <>
                <rect x={-w / 2} y={-27} width={w} height={25} rx={8} fill="#0f172a" opacity="0.92" />
                <text x={0} y={-14.5} textAnchor="middle" dominantBaseline="central" fontSize="12.5" fontWeight="600" fill="#fff">
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
