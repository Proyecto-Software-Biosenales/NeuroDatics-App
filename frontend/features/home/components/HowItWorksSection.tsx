const steps = [
  {
    number: 1,
    title: "Crea un proyecto",
    description:
      "Sube la carpeta del experimento, marca los sensores y registra a los participantes.",
  },
  {
    number: 2,
    title: "Marca áreas de interés",
    description:
      "Dibuja sobre cada imagen las zonas que quieres analizar.",
  },
  {
    number: 3,
    title: "Analiza los resultados",
    description:
      "Revisa las gráficas y estadísticas de EEG, GSR y eye tracker, y compara participantes.",
  },
  {
    number: 4,
    title: "Genera informes en PDF",
    description:
      "Descarga un informe por dispositivo, de un participante o de todo el grupo.",
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
