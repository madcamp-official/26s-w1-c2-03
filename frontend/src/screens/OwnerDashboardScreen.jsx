import { useState } from "react"
import { categories } from "../data/mockData"
import { createStore } from "../lib/api"

// ⚠️ 사장님 로그인/회원가입이 아직 백엔드에 없어서, 지금은 owner_id를 직접 입력받는 임시 방식.
//    나중에 사장님 로그인이 생기면 이 입력칸은 없애고 로그인한 owner_id를 자동으로 씀.
const STORE_CATEGORIES = categories.filter((c) => c !== "전체")

export default function OwnerDashboardScreen() {
  const [ownerId, setOwnerId] = useState("")
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [category, setCategory] = useState(STORE_CATEGORIES[0])
  const [keywordsInput, setKeywordsInput] = useState("")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [registered, setRegistered] = useState(null) // 방금 등록된 매장

  const canSubmit = ownerId.trim() && name.trim() && address.trim() && !submitting

  const handleSubmit = async () => {
    setSubmitting(true)
    setError("")
    try {
      const keywords = keywordsInput
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)

      const store = await createStore({ ownerId: ownerId.trim(), name, address, category, keywords })
      setRegistered(store)
      setName("")
      setAddress("")
      setKeywordsInput("")
    } catch (e) {
      setError(e.message || "매장 등록에 실패했어요")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="px-5 py-6">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">매장 등록</h2>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-600">사장님 ID</label>
        <input
          value={ownerId}
          onChange={(e) => setOwnerId(e.target.value)}
          placeholder="owners 테이블의 id (임시)"
          className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
        />

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

        {registered && (
          <div className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
            ✅ <b>{registered.name}</b> 등록 완료! (위도 {registered.lat}, 경도 {registered.lng})
          </div>
        )}

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
