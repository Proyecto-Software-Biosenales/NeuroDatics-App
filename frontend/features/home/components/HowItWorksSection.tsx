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
    <section className="px-4 py-16 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-foreground/10 bg-foreground/5 px-5 py-10 backdrop-blur-md sm:px-8 2xl:rounded-3xl 2xl:py-14">
          <h2 className="mb-10 text-center text-2xl font-semibold text-foreground sm:text-3xl 2xl:mb-12">
            ¿Cómo funciona?
          </h2>

          <div className="space-y-6 2xl:space-y-8">
            {steps.map((step) => (
              <div key={step.number} className="flex gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-foreground/10">
                  <span className="text-lg font-semibold text-foreground">
                    {step.number}
                  </span>
                </div>

                <div className="min-w-0 flex-1 pt-1">
                  <h3 className="mb-2 text-lg font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
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
