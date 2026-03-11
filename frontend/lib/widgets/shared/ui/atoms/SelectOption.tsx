import type { ReactNode } from "react"

interface SelectOptionProps {
  value: string
  label: string
  onClick: (value: string) => void
  badges?: ReactNode
}

export const SelectOption = ({
  value,
  label,
  onClick,
  badges,
}: SelectOptionProps) => {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className="w-full px-5 py-3 text-left hover:bg-gray-100 transition-colors duration-150 group"
    >
      <div className="flex flex-col gap-2">
        <span className="font-medium text-gray-900">{label}</span>
        {badges && (
          <div className="flex flex-wrap gap-1.5">{badges}</div>
        )}
      </div>
    </button>
  )
}
