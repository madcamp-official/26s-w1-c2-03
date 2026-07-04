import { useEffect, useRef, useState } from "react"

const VIEWPORT = 260 // 크롭 미리보기 정사각형 한 변(px)
const OUTPUT = 512 // 실제로 잘라서 내보낼 이미지 크기(px)

// 정사각형 이미지 크롭 도구 — 드래그로 위치 이동, 슬라이더로 확대
// 사용법: <ImageCropper file={file} onCancel={...} onCropped={(blob) => ...} />
export default function ImageCropper({ file, onCancel, onCropped }) {
  const imgRef = useRef(null)
  const [imgEl, setImgEl] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef(null) // { startX, startY, offsetX, offsetY }

  // 파일 → 이미지 엘리먼트로 로드, 처음엔 정중앙 정렬
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setImgEl(img)
      const baseScale = Math.max(VIEWPORT / img.width, VIEWPORT / img.height)
      const w = img.width * baseScale
      const h = img.height * baseScale
      setOffset({ x: (VIEWPORT - w) / 2, y: (VIEWPORT - h) / 2 })
      setZoom(1)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (!imgEl) return <p className="py-10 text-center text-sm text-slate-400">이미지 불러오는 중...</p>

  const baseScale = Math.max(VIEWPORT / imgEl.width, VIEWPORT / imgEl.height)
  const scale = baseScale * zoom
  const scaledW = imgEl.width * scale
  const scaledH = imgEl.height * scale

  const clamp = (x, y) => ({
    x: Math.min(0, Math.max(VIEWPORT - scaledW, x)),
    y: Math.min(0, Math.max(VIEWPORT - scaledH, y)),
  })

  const onPointerDown = (e) => {
    const point = e.touches ? e.touches[0] : e
    dragRef.current = { startX: point.clientX, startY: point.clientY, offsetX: offset.x, offsetY: offset.y }
  }
  const onPointerMove = (e) => {
    if (!dragRef.current) return
    const point = e.touches ? e.touches[0] : e
    const dx = point.clientX - dragRef.current.startX
    const dy = point.clientY - dragRef.current.startY
    setOffset(clamp(dragRef.current.offsetX + dx, dragRef.current.offsetY + dy))
  }
  const onPointerUp = () => {
    dragRef.current = null
  }

  const handleZoom = (e) => {
    const nextZoom = Number(e.target.value)
    // 확대/축소 시 중심 기준으로 재보정 (이미지가 뷰포트 밖으로 크게 안 튀도록)
    const nextScale = baseScale * nextZoom
    const cx = VIEWPORT / 2
    const cy = VIEWPORT / 2
    const ratio = nextScale / scale
    const nextX = cx - (cx - offset.x) * ratio
    const nextY = cy - (cy - offset.y) * ratio
    setZoom(nextZoom)
    setOffset(clamp(nextX, nextY))
  }

  const handleConfirm = () => {
    const canvas = document.createElement("canvas")
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const ctx = canvas.getContext("2d")

    const srcX = -offset.x / scale
    const srcY = -offset.y / scale
    const srcSize = VIEWPORT / scale

    ctx.drawImage(imgEl, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT, OUTPUT)
    canvas.toBlob((blob) => onCropped(blob), "image/png")
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div
        className="mx-auto touch-none overflow-hidden rounded-xl bg-slate-100"
        style={{ width: VIEWPORT, height: VIEWPORT }}
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      >
        <img
          ref={imgRef}
          src={imgEl.src}
          alt="크롭할 이미지"
          draggable={false}
          className="pointer-events-none max-w-none select-none"
          style={{
            width: imgEl.width * scale,
            height: imgEl.height * scale,
            transform: `translate(${offset.x}px, ${offset.y}px)`,
            transformOrigin: "top left",
          }}
        />
      </div>

      <input
        type="range"
        min="1"
        max="3"
        step="0.05"
        value={zoom}
        onChange={handleZoom}
        className="mt-3 w-full"
      />
      <p className="mb-3 text-center text-xs text-slate-400">드래그로 위치 이동 · 슬라이더로 확대</p>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-medium text-slate-500"
        >
          취소
        </button>
        <button
          onClick={handleConfirm}
          className="flex-1 rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white"
        >
          이 크기로 사용
        </button>
      </div>
    </div>
  )
}
