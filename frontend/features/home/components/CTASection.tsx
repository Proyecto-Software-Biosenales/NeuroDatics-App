import Link from "next/link"
import { Button } from "@/components/ui/button"

export const CTASection = () => {
  return (
    <section className="px-4 py-16 sm:px-6 lg:py-20">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-foreground/10 bg-foreground/5 px-5 py-10 text-center backdrop-blur-md sm:px-8 2xl:rounded-3xl 2xl:py-14">
          <h2 className="mb-4 text-2xl font-semibold text-foreground sm:text-3xl">
            Comienza tu análisis ahora
          </h2>

          <p className="mb-8 leading-relaxed text-muted-foreground">
            Crea tu primer proyecto y descubre las métricas profesionales sobre el
            comportamiento y las respuestas neurofisiológicas de tus usuarios.
          </p>

          <Button
            asChild
            className="rounded-lg bg-foreground px-8 py-5 text-sm font-medium text-background transition-colors duration-200 hover:bg-foreground/90"
          >
            <Link href="/proyectos">Ir a proyectos</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
