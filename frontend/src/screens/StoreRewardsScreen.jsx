import { useEffect, useState } from "react"
import { createReward, deleteReward, getStoreRewards } from "../lib/api"

// 리워드 하나를 사람이 읽을 문구로 ("메뉴는 무료", "굿즈는 증정", 할인은 공통으로 "N% 할인")
function rewardLabel(r) {
  if (r.reward_kind === "discount") return `${r.target_name} ${r.discount_percent}% 할인`
  return r.target_type === "menu" ? `${r.target_name} 무료` : `${r.target_name} 증정`
}

// 사장님 — 매장 설정 화면의 리워드 기준 관리 (스탬프 N개 달성 시 메뉴/굿즈 혜택)
export default function StoreRewardsScreen({ storeId }) {
  const [rewards, setRewards] = useState(null)

  const [stampThreshold, setStampThreshold] = useState("10")
  const [targetType, setTargetType] = useState("menu") // menu | goods
  const [targetName, setTargetName] = useState("")
  const [rewardKind, setRewardKind] = useState("free") // free | discount
  const [discountPercent, setDiscountPercent] = useState("10")

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const load = () => {
    getStoreRewards(storeId)
      .then(setRewards)
      .catch(() => setRewards([]))
  }
  useEffect(load, [storeId])

  const canSubmit =
    targetName.trim() &&
    Number(stampThreshold) > 0 &&
    (rewardKind === "free" || Number(discountPercent) > 0) &&
    !submitting

  const handleSubmit = async () => {
    setSubmitting(true)
    setError("")
    try {
      await createReward({
        storeId,
        stampThreshold: Number(stampThreshold),
        targetType,
        targetName: targetName.trim(),
        rewardKind,
        discountPercent: rewardKind === "discount" ? Number(discountPercent) : undefined,
      })
      setTargetName("")
      load()
    } catch (e) {
      setError(e.message || "리워드 등록에 실패했어요")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (reward) => {
    if (!window.confirm(`"${rewardLabel(reward)}" 리워드를 삭제할까요?`)) return
    try {
      await deleteReward(reward.id)
      load()
    } catch (e) {
      setError(e.message || "삭제에 실패했어요")
    }
  }

  return (
    <div className="px-5 py-6">
      <h2 className="mb-1 text-lg font-semibold text-slate-900">리워드 설정</h2>
      <p className="mb-4 text-sm text-slate-500">
        스탬프를 일정 개수 모으면 손님이 받을 수 있는 혜택을 정해요.
      </p>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm lg:max-w-md">
        <label className="mb-1 block text-sm font-medium text-slate-600">스탬프 몇 개 모으면?</label>
        <input
          type="number"
          min="1"
          value={stampThreshold}
          onChange={(e) => setStampThreshold(e.target.value)}
          className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
        />

        <label className="mb-1 block text-sm font-medium text-slate-600">종류</label>
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setTargetType("menu")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium ${targetType === "menu" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"}`}
          >
            메뉴
          </button>
          <button
            onClick={() => setTargetType("goods")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium ${targetType === "goods" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"}`}
          >
            굿즈
          </button>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-600">
          {targetType === "menu" ? "메뉴 이름" : "굿즈 이름"}
        </label>
        <input
          value={targetName}
          onChange={(e) => setTargetName(e.target.value)}
          placeholder={targetType === "menu" ? "예: 아메리카노" : "예: 텀블러"}
          className="mb-4 w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 outline-none focus:border-amber-400"
        />

        <label className="mb-1 block text-sm font-medium text-slate-600">혜택</label>
        <div className="mb-1 flex gap-2">
          <button
            onClick={() => setRewardKind("free")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium ${rewardKind === "free" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"}`}
          >
            {targetType === "menu" ? "무료" : "증정"}
          </button>
          <button
            onClick={() => setRewardKind("discount")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-medium ${rewardKind === "discount" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"}`}
          >
            할인
          </button>
        </div>
        {rewardKind === "discount" && (
          <div className="mb-1 flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="100"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-center text-slate-900 outline-none focus:border-amber-400"
            />
            <span className="text-sm text-slate-500">% 할인</span>
          </div>
        )}

        {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-500">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="mt-4 w-full rounded-xl bg-amber-500 py-3 font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          {submitting ? "등록 중..." : "리워드 추가"}
        </button>
      </div>

      <section className="mt-6">
        <h3 className="mb-3 font-semibold text-slate-900">등록된 리워드 ({rewards?.length ?? 0})</h3>
        {rewards === null ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : rewards.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
            아직 등록된 리워드가 없어요
          </p>
        ) : (
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
            {rewards.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
              >
                <span className="text-sm text-slate-700">
                  <b className="text-amber-600">스탬프 {r.stamp_threshold}개</b> → {rewardLabel(r)}
                </span>
                <button onClick={() => handleDelete(r)} className="text-xs font-medium text-red-400">
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
