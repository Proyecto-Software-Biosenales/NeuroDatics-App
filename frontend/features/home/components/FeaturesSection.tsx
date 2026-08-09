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
    <section className="px-4 py-16 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-2xl border border-foreground/10 bg-foreground/5 px-5 py-10 backdrop-blur-md sm:px-8 2xl:rounded-3xl 2xl:py-14">
          <h2 className="mb-4 text-center text-2xl font-semibold text-foreground sm:text-3xl">
            ¿Qué es NeuroDatics?
          </h2>

          <p className="mx-auto mb-10 max-w-3xl text-center leading-relaxed text-muted-foreground 2xl:mb-12">
            Una herramienta profesional para el análisis científico de bioseñales.
            Diseñado para investigadores, especialistas en neuromarketing,
            profesionales de UX y empresas que buscan entender el comportamiento
            humano a través de datos neurofisiológicos objetivos.
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 2xl:gap-6">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border border-foreground/10 bg-foreground/[0.04] p-5 transition-all duration-200 hover:border-foreground/20 hover:bg-foreground/[0.08] 2xl:rounded-2xl 2xl:p-6"
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/10">
                  <feature.icon className="h-6 w-6 text-foreground" strokeWidth={2} />
                </div>

                <h3 className="mb-2 text-lg font-semibold text-foreground">
                  {feature.title}
                </h3>

                <p className="text-sm leading-relaxed text-muted-foreground">
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
