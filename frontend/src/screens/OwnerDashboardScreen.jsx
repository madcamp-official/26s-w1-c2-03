import { useEffect, useState } from "react"
import { createStore, getCategoryOptions, getKeywordOptions } from "../lib/api"
import OptionChips from "../components/OptionChips"

const MAX_KEYWORDS = 3

// 매장 등록 — ownerId는 로그인한 계정(카카오)의 id를 그대로 씀
export default function OwnerDashboardScreen({ ownerId, onRegistered }) {
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [categoryOptions, setCategoryOptions] = useState([])
  const [keywordOptions, setKeywordOptions] = useState([])
  const [categories, setCategories] = useState([])
  const [keywords, setKeywords] = useState([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    getCategoryOptions()
      .then((options) => setCategoryOptions(options.map((o) => o.name)))
      .catch(() => setCategoryOptions([]))
    getKeywordOptions()
      .then((options) => setKeywordOptions(options.map((o) => o.name)))
      .catch(() => setKeywordOptions([]))
  }, [])

  const toggleCategory = (c) => {
    setCategories((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }
  const toggleKeyword = (k) => {
    setKeywords((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  }

  const canSubmit = name.trim() && address.trim() && categories.length > 0 && !submitting

  const handleSubmit = async () => {
    setSubmitting(true)
    setError("")
    try {
      const store = await createStore({ ownerId, name, address, categories, keywords })
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

        <label className="mb-2 block text-sm font-medium text-slate-600">카테고리 (중복 선택 가능)</label>
        {categoryOptions.length === 0 ? (
          <p className="mb-4 text-xs text-slate-400">등록된 카테고리가 없어요. 관리자 페이지에서 추가해주세요.</p>
        ) : (
          <div className="mb-4">
            <OptionChips options={categoryOptions} selected={categories} onToggle={toggleCategory} />
          </div>
        )}

        <label className="mb-2 block text-sm font-medium text-slate-600">
          키워드 (최대 {MAX_KEYWORDS}개, {keywords.length}/{MAX_KEYWORDS})
        </label>
        {keywordOptions.length === 0 ? (
          <p className="mb-6 text-xs text-slate-400">등록된 키워드가 없어요. 관리자 페이지에서 추가해주세요.</p>
        ) : (
          <div className="mb-6">
            <OptionChips
              options={keywordOptions}
              selected={keywords}
              onToggle={toggleKeyword}
              isDisabled={() => keywords.length >= MAX_KEYWORDS}
            />
          </div>
        )}

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
