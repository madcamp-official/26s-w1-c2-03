// 카테고리/키워드처럼 "여러 선택지 중 중복 선택" UI에서 공용으로 쓰는 칩 버튼 목록
export default function OptionChips({ options, selected, onToggle, isDisabled }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt)
        const disabled = !active && isDisabled?.(opt)
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            disabled={disabled}
            className={`rounded-full px-3.5 py-1.5 text-sm ${
              active
                ? "bg-amber-500 text-white"
                : disabled
                  ? "bg-slate-50 text-slate-300"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            {opt}
          </button>
        )
      })}
    </div>
  )
}
