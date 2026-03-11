import Link from "next/link"
import { Button } from "@/components/ui/button"

export const CTASection = () => {
  return (
    <section className="px-6 py-16 bg-white">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl font-semibold text-gray-900 mb-4">
          Comienza tu análisis ahora
        </h2>

        <p className="text-gray-600 leading-relaxed mb-8">
          Crea tu primer proyecto y descubre las métricas profesionales sobre el
          comportamiento y las respuestas neurofisiológicas de tus usuarios.
        </p>

        <Button
          asChild
          className="bg-black text-white px-8 py-5 rounded-lg hover:bg-gray-700 transition-colors duration-200 text-sm font-medium"
        >
          <Link href="/proyectos">Ir a proyectos</Link>
        </Button>
      </div>
    </section>
  )
}
