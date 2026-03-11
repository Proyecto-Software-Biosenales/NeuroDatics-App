import { Brain, Zap, Eye } from "lucide-react"

const features = [
  {
    icon: Brain,
    title: "Electroencefalógrafo",
    description:
      "Monitoreo avanzado de la actividad cerebral mediante señales eléctricas. Identifica estados de atención, concentración y activación emocional.",
  },
  {
    icon: Zap,
    title: "Sensor galvánico",
    description:
      "Medición precisa de la respuesta galvánica de la piel. Detecta cambios en la conductividad asociados a estados emocionales.",
  },
  {
    icon: Eye,
    title: "Eye tracker",
    description:
      "Seguimiento ocular de alta precisión para analizar patrones de atención visual. Mapea áreas de interés y rutas de mirada.",
  },
]

export const FeaturesSection = () => {
  return (
    <section className="px-6 py-16 bg-white">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-semibold text-gray-900 text-center mb-4">
          ¿Qué es NeuroDatics?
        </h2>

        <p className="text-gray-600 text-center max-w-3xl mx-auto mb-12 leading-relaxed">
          Una herramienta profesional para el análisis científico de bioseñales.
          Diseñado para investigadores, especialistas en neuromarketing,
          profesionales de UX y empresas que buscan entender el comportamiento
          humano a través de datos neurofisiológicos objetivos.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-gray-50 rounded-2xl p-6 border border-gray-200 hover:border-gray-300 transition-colors duration-200"
            >
              <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center mb-4">
                <feature.icon
                  className="w-6 h-6 text-white"
                  strokeWidth={2}
                />
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {feature.title}
              </h3>

              <p className="text-sm text-gray-600 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
