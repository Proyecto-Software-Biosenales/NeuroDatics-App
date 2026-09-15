import { Button } from "@/components/ui/button"

export function AnalyticsModeSelector<T extends string>({ value, options, onValueChange }: {
  value: T
  options: ReadonlyArray<{ key: T; label: string }>
  onValueChange: (value: T) => void
}) {
  return (
    <div role="group" aria-label="Modo de visualización" className="inline-flex flex-wrap gap-1 rounded-lg border border-border p-1">
      {options.map((option) => (
        <Button key={option.key} variant="selection" size="sm" aria-pressed={value === option.key}
          onClick={() => onValueChange(option.key)} className="border-transparent">
          {option.label}
        </Button>
      ))}
    </div>
  )
}
