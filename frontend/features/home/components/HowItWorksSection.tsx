const steps = [
  {
    number: 1,
    title: "Crea un proyecto",
    description:
      "Inicia tu investigación creando un proyecto. Define nombre, descripción y configura los parámetros de medición según tus objetivos.",
  },
  {
    number: 2,
    title: "Cargar datos y sensores",
    description:
      "Importa datos de EEG, GSR y Eye Tracking. Define zonas de interés (AOI), establece ventanas temporales.",
  },
  {
    number: 3,
    title: "Analizar gráficas y métricas",
    description:
      "Visualiza métricas en tiempo real con gráficas interactivas y métricas estadísticas: atención, activación y emoción agregada.",
  },
  {
    number: 4,
    title: "Generar reportes en PDF",
    description:
      "Exporta reportes profesionales en PDF con gráficas, y métricas. Elige entre reporte por sensor o publicación completa.",
  },
]

export const HowItWorksSection = () => {
  return (
    <section className="px-6 py-20">
      <div className="max-w-3xl mx-auto">
        <div className="bg-foreground/5 backdrop-blur-md rounded-3xl border border-foreground/10 px-8 py-14">
          <h2 className="text-3xl font-semibold text-foreground text-center mb-12">
            ¿Cómo funciona?
          </h2>

          <div className="space-y-8">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-foreground/10 rounded-full flex items-center justify-center">
                  <span className="text-foreground font-semibold text-lg">
                    {step.number}
                  </span>
                </div>

                <div className="flex-1 pt-1">
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
