import { EmptyState } from "../molecules/EmptyState"

export const ReportsEmptyContainer = () => {
  return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl bg-gradient-to-br from-gray-50 to-white transition-all duration-300 hover:border-gray-400">
      <EmptyState
        title="Selecciona un proyecto para comenzar"
        description="Elige un proyecto de la lista superior para configurar y generar reportes PDF profesionales con tus datos de bioseñales."
        icon="folder"
      />
    </div>
  )
}
