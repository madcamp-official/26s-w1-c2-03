import { useEffect, useState } from "react"
import { categories } from "../data/mockData"
import { createBadge, getBadges, deleteBadge } from "../lib/api"
import ImageCropper from "../components/ImageCropper"

const STORE_CATEGORIES = categories.filter((c) => c !== "전체")
const QUICK_EMOJIS = ["🏆", "☕", "🍰", "🍚", "🍻", "🌅", "✍️", "🧭", "💻", "🏙️", "🍜", "🔥"]

function emptyCondition() {
  return { type: "keyword", value: "", min_count: 1 }
}

// 관리자 페이지 — 뱃지 생성 (이모지 또는 이미지 + 키워드/카테고리 조건 여러 개 AND)
export default function AdminBadgeScreen() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const [iconMode, setIconMode] = useState("emoji") // emoji | image
  const [emoji, setEmoji] = useState("")
  const [pickedFile, setPickedFile] = useState(null) // 크롭 대기 중인 원본 파일
  const [croppedBlob, setCroppedBlob] = useState(null)
  const [croppedPreviewUrl, setCroppedPreviewUrl] = useState(null)

  const [conditions, setConditions] = useState([emptyCondition()])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(null)

  const [badgeList, setBadgeList] = useState(null)

  const loadBadges = () => {
    getBadges()
      .then(setBadgeList)
      .catch(() => setBadgeList([]))
  }
  useEffect(loadBadges, [])

  const handleDelete = async (badge) => {
    if (!window.confirm(`"${badge.name}" 뱃지를 삭제할까요?`)) return
    try {
      await deleteBadge(badge.id)
      loadBadges()
    } catch (e) {
      setError(e.message || "삭제에 실패했어요")
    }
  }

  const updateCondition = (index, patch) => {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  }
  const addCondition = () => setConditions((prev) => [...prev, emptyCondition()])
  const removeCondition = (index) => setConditions((prev) => prev.filter((_, i) => i !== index))

  const handleFilePick = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPickedFile(file)
    setCroppedBlob(null)
    if (croppedPreviewUrl) URL.revokeObjectURL(croppedPreviewUrl)
    setCroppedPreviewUrl(null)
  }

  const handleCropped = (blob) => {
    setCroppedBlob(blob)
    setPickedFile(null)
    setCroppedPreviewUrl(URL.createObjectURL(blob))
  }

  const canSubmit =
    name.trim() &&
    (iconMode === "emoji" ? emoji.trim() : croppedBlob) &&
    conditions.length > 0 &&
    conditions.every((c) => c.value.trim() && Number(c.min_count) > 0) &&
    !submitting

  const handleSubmit = async () => {
    setSubmitting(true)
    setError("")
    setSuccess(null)
    try {
      const badge = await createBadge({
        name: name.trim(),
        description: description.trim() || undefined,
        emoji: iconMode === "emoji" ? emoji.trim() : undefined,
        conditions: conditions.map((c) => ({
          type: c.type,
          value: c.value.trim(),
          min_count: Number(c.min_count),
        })),
        imageBlob: iconMode === "image" ? croppedBlob : undefined,
      })
      setSuccess(badge)
      setName("")
      setDescription("")
      setEmoji("")
      setCroppedBlob(null)
      setCroppedPreviewUrl(null)
      setConditions([emptyCondition()])
      loadBadges()
    } catch (e) {
      setError(e.message || "뱃지 생성에 실패했어요")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[560px] px-5 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">🛠 관리자 — 뱃지 관리</h1>
      <p className="mb-6 text-sm text-slate-500">
        조건(키워드 또는 카테고리 × 방문 횟수)을 여러 개 걸면, 손님은 그 조건을 전부 만족해야 뱃지를 얻어요.
      </p>

      {/* 기본 정보 */}
      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-900">기본 정보</h2>

        <label className="mb-1 block text-sm font-medium text-slate-600">뱃지 이름</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 조용한 디저트 마스터"
          className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-400"
        />

        <label className="mb-1 block text-sm font-medium text-slate-600">설명 (선택)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="예: 조용한 매장 5회 + 디저트맛집 3회 방문"
          className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-amber-400"
        />

        <label className="mb-2 block text-sm font-medium text-slate-600">아이콘</label>
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setIconMode("emoji")}
            className={`flex-1 rounded-xl py-2 text-sm font-medium ${iconMode === "emoji" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"}`}
          >
            이모지
          </button>
          <button
            onClick={() => setIconMode("image")}
            className={`flex-1 rounded-xl py-2 text-sm font-medium ${iconMode === "image" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"}`}
          >
            이미지 업로드
          </button>
        </div>

        {iconMode === "emoji" ? (
          <div>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="이모지를 입력하거나 아래에서 선택"
              className="mb-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-2xl outline-none focus:border-amber-400"
            />
            <div className="flex flex-wrap gap-2">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => setEmoji(e)}
                  className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xl"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            {pickedFile ? (
              <ImageCropper
                file={pickedFile}
                onCancel={() => setPickedFile(null)}
                onCropped={handleCropped}
              />
            ) : croppedPreviewUrl ? (
              <div className="flex items-center gap-3">
                <img src={croppedPreviewUrl} alt="뱃지 미리보기" className="h-16 w-16 rounded-xl object-cover" />
                <label className="cursor-pointer rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600">
                  다른 이미지 선택
                  <input type="file" accept="image/*" onChange={handleFilePick} className="hidden" />
                </label>
              </div>
            ) : (
              <label className="flex h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-400">
                📷 이미지 선택 (자동으로 정사각형 크롭)
                <input type="file" accept="image/*" onChange={handleFilePick} className="hidden" />
              </label>
            )}
          </div>
        )}
      </section>

      {/* 조건 */}
      <section className="mt-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-900">획득 조건 (전부 만족해야 함)</h2>

        <div className="space-y-3">
          {conditions.map((c, i) => (
            <div key={i} className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-2">
                <select
                  value={c.type}
                  onChange={(e) => updateCondition(i, { type: e.target.value, value: "" })}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                >
                  <option value="keyword">키워드</option>
                  <option value="category">카테고리</option>
                </select>

                {c.type === "keyword" ? (
                  <input
                    value={c.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    placeholder="예: 조용한"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
                  />
                ) : (
                  <select
                    value={c.value}
                    onChange={(e) => updateCondition(i, { value: e.target.value })}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">카테고리 선택</option>
                    {STORE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                )}

                <input
                  type="number"
                  min="1"
                  value={c.min_count}
                  onChange={(e) => updateCondition(i, { min_count: e.target.value })}
                  className="w-16 rounded-lg border border-slate-200 px-2 py-2 text-center text-sm"
                />
                <span className="text-sm text-slate-400">회↑</span>

                {conditions.length > 1 && (
                  <button onClick={() => removeCondition(i)} className="text-slate-300">
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addCondition}
          className="mt-3 w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-medium text-slate-500"
        >
          + 조건 추가
        </button>
      </section>

      {error && <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>}
      {success && (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
          ✅ <b>{success.name}</b> 뱃지가 생성됐어요!
        </p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="mt-5 w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
      >
        {submitting ? "생성 중..." : "뱃지 생성"}
      </button>

      {/* 만들어진 뱃지 목록 */}
      <section className="mt-8">
        <h2 className="mb-3 font-semibold text-slate-900">등록된 뱃지 ({badgeList?.length ?? 0})</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {badgeList?.map((b) => (
            <div key={b.id} className="rounded-xl border border-slate-100 bg-white p-3 text-center shadow-sm">
              {b.image_url ? (
                <img src={b.image_url} alt={b.name} className="mx-auto h-12 w-12 rounded-lg object-cover" />
              ) : (
                <span className="text-3xl">{b.emoji}</span>
              )}
              <p className="mt-1 text-sm font-medium text-slate-800">{b.name}</p>
              <p className="mt-1 text-[11px] leading-tight text-slate-400">
                {b.badge_conditions
                  ?.map((c) => `${c.condition_value} ${c.min_count}회`)
                  .join(" + ")}
              </p>
              <button
                onClick={() => handleDelete(b)}
                className="mt-2 text-[11px] font-medium text-red-400"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
