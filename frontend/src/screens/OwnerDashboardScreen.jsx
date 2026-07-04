import { useState } from "react"
import { categories } from "../data/mockData"
import { createStore } from "../lib/api"

const STORE_CATEGORIES = categories.filter((c) => c !== "전체")

// 매장 등록 — ownerId는 로그인한 계정(카카오)의 id를 그대로 씀
export default function OwnerDashboardScreen({ ownerId, onRegistered }) {
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [category, setCategory] = useState(STORE_CATEGORIES[0])
  const [keywordsInput, setKeywordsInput] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const canSubmit = name.trim() && address.trim() && !submitting

  const handleSubmit = async () => {
    setSubmitting(true)
    setError("")
    try {
      const keywords = keywordsInput
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)

      const store = await createStore({ ownerId, name, address, category, keywords })
      onRegistered(store)
    } catch (e) {
      setError(e.message || "매장 등록에 실패했어요")
      setSubmitting(false)
    }
  }

  return (
    <div className="px-5 py-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">매장 등록</h2>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">매장 이름</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 성수동 감성카페"
          className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
        />

        <label className="mb-1 block text-sm font-medium text-slate-600">주소</label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="예: 서울 성동구 성수동 123"
          className="mb-1 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
        />
        <p className="mb-4 text-xs text-slate-400">주소를 입력하면 서버가 자동으로 지도 좌표로 변환해요</p>

        <label className="mb-1 block text-sm font-medium text-slate-600">카테고리</label>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mb-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
        >
          {STORE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-slate-600">키워드</label>
        <input
          value={keywordsInput}
          onChange={(e) => setKeywordsInput(e.target.value)}
          placeholder="쉼표로 구분 (예: 조용한, 디저트맛집)"
          className="mb-6 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
        />

        {error && <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-xl bg-amber-500 py-3.5 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          {submitting ? "등록 중..." : "매장 등록"}
        </button>
      </div>
    </div>
  )
}
