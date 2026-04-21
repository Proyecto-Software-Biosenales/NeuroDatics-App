import Link from "next/link"
import { Button } from "@/components/ui/button"

export const CTASection = () => {
  return (
    <section className="px-6 py-20">
      <div className="max-w-2xl mx-auto">
        <div className="bg-foreground/5 backdrop-blur-md rounded-3xl border border-foreground/10 px-8 py-14 text-center">
          <h2 className="text-3xl font-semibold text-foreground mb-4">
            Comienza tu análisis ahora
          </h2>

          <p className="text-muted-foreground leading-relaxed mb-8">
            Crea tu primer proyecto y descubre las métricas profesionales sobre el
            comportamiento y las respuestas neurofisiológicas de tus usuarios.
          </p>

          <Button
            asChild
            className="bg-foreground text-background px-8 py-5 rounded-lg hover:bg-foreground/90 transition-colors duration-200 text-sm font-medium"
          >
            <Link href="/proyectos">Ir a proyectos</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
