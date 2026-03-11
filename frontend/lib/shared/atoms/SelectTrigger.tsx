import type { ReactNode } from "react"
import { Icon } from "./Icon"

interface SelectTriggerProps {
  children: ReactNode
  onClick: () => void
  isOpen: boolean
  placeholder?: string
}

export const SelectTrigger = ({
  children,
  onClick,
  isOpen,
  placeholder,
}: SelectTriggerProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-5 py-3.5 bg-white border border-gray-300 rounded-xl text-left text-gray-700 hover:border-gray-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-700 focus:border-transparent transition-all duration-200"
    >
      <span className={children ? "text-gray-900 font-medium" : "text-gray-500"}>
        {children || placeholder}
      </span>
      <Icon
        name="chevron-down"
        size={20}
        className={`text-gray-500 transition-transform duration-200 ${
          isOpen ? "rotate-180" : ""
        }`}
      />
    </button>
  )
}
