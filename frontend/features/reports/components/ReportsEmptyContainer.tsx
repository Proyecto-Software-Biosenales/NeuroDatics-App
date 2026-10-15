import { EmptyState } from "../../projects/components/EmptyState"

export const ReportsEmptyContainer = () => {
  return (
    <div className="border-2 border-dashed border-border rounded-xl bg-card transition-all duration-300 hover:border-foreground/20">
      <EmptyState
        title="Selecciona un proyecto"
        description="Elige un proyecto en la lista de arriba para generar sus informes."
        icon="folder"
      />
    </div>
  )
}
