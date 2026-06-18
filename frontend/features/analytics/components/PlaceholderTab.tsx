"use client"

import { Construction } from "lucide-react"

interface PlaceholderTabProps {
  label: string
}

export function PlaceholderTab({ label }: PlaceholderTabProps) {
  return (
    <div className="flex h-64 items-center justify-center text-gray-400">
      <div className="flex items-center gap-2 text-lg">
        <Construction className="h-5 w-5" />
        <span>{label} - En desarrollo</span>
      </div>
    </div>
  )
}
