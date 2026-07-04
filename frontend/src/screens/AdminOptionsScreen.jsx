import { useEffect, useState } from "react"
import {
  getCategoryOptions,
  createCategoryOption,
  deleteCategoryOption,
  getKeywordOptions,
  createKeywordOption,
  deleteKeywordOption,
} from "../lib/api"

// 하나의 옵션 목록(카테고리 또는 키워드)을 추가/삭제하는 카드 — 두 종류에 공용으로 사용
function OptionSection({ title, description, load, create, remove }) {
  const [options, setOptions] = useState(null)
  const [input, setInput] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const reload = () => {
    load()
      .then(setOptions)
      .catch(() => setOptions([]))
  }
  useEffect(reload, [])

  const handleAdd = async () => {
    const name = input.trim()
    if (!name) return
    setSubmitting(true)
    setError("")
    try {
      await create(name)
      setInput("")
      reload()
    } catch (e) {
      setError(e.message || "추가에 실패했어요")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (opt) => {
    if (!window.confirm(`"${opt.name}"을(를) 삭제할까요?`)) return
    try {
      await remove(opt.id)
      reload()
    } catch (e) {
      setError(e.message || "삭제에 실패했어요")
    }
  }

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <p className="mb-3 text-sm text-slate-500">{description}</p>

      <div className="mb-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="새 선택지 이름"
          className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
        />
        <button
          onClick={handleAdd}
          disabled={!input.trim() || submitting}
          className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          추가
        </button>
      </div>

      {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-500">{error}</p>}

      {options === null ? (
        <p className="text-sm text-slate-400">불러오는 중...</p>
      ) : options.length === 0 ? (
        <p className="text-sm text-slate-400">등록된 선택지가 없어요.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <span
              key={opt.id}
              className="flex items-center gap-1.5 rounded-full bg-slate-100 py-1.5 pl-3.5 pr-2 text-sm text-slate-600"
            >
              {opt.name}
              <button onClick={() => handleDelete(opt)} className="text-slate-300">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

// 관리자 페이지 — 매장 등록 폼/뱃지 조건 폼에서 쓰는 카테고리·키워드 선택지 관리
export default function AdminOptionsScreen() {
  return (
    <div className="mx-auto max-w-[560px] px-5 py-8">
      <h1 className="mb-1 text-2xl font-bold text-slate-900">🛠 관리자 — 카테고리·키워드 관리</h1>
      <p className="mb-6 text-sm text-slate-500">
        여기서 추가한 선택지가 매장 등록 폼과 뱃지 조건 폼에 그대로 나타나요.
      </p>

      <div className="space-y-4">
        <OptionSection
          title="카테고리"
          description="매장 등록 시 중복 선택 가능한 카테고리 목록"
          load={getCategoryOptions}
          create={createCategoryOption}
          remove={deleteCategoryOption}
        />
        <OptionSection
          title="키워드"
          description="매장 등록 시 최대 3개까지 선택 가능한 키워드 목록"
          load={getKeywordOptions}
          create={createKeywordOption}
          remove={deleteKeywordOption}
        />
      </div>
    </div>
  )
}
