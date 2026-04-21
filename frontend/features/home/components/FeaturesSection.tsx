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
    <section className="px-6 py-20">
      <div className="max-w-6xl mx-auto">
        <div className="bg-foreground/5 backdrop-blur-md rounded-3xl border border-foreground/10 px-8 py-14">
          <h2 className="text-3xl font-semibold text-foreground text-center mb-4">
            ¿Qué es NeuroDatics?
          </h2>

          <p className="text-muted-foreground text-center max-w-3xl mx-auto mb-12 leading-relaxed">
            Una herramienta profesional para el análisis científico de bioseñales.
            Diseñado para investigadores, especialistas en neuromarketing,
            profesionales de UX y empresas que buscan entender el comportamiento
            humano a través de datos neurofisiológicos objetivos.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-foreground/[0.04] rounded-2xl p-6 border border-foreground/10 hover:border-foreground/20 hover:bg-foreground/[0.08] transition-all duration-200"
              >
                <div className="w-12 h-12 bg-foreground/10 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-foreground" strokeWidth={2} />
                </div>

                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>

                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
