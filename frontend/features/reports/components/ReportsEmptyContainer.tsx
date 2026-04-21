import { EmptyState } from "../../projects/components/EmptyState"

export const ReportsEmptyContainer = () => {
  return (
    <div className="border-2 border-dashed border-border rounded-xl bg-card transition-all duration-300 hover:border-foreground/20">
      <EmptyState
        title="Selecciona un proyecto para comenzar"
        description="Elige un proyecto de la lista superior para configurar y generar reportes PDF profesionales con tus datos de bioseñales."
        icon="folder"
      />
    </div>
  )
}
