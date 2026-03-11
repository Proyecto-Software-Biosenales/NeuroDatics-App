import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"

export const HeroSection = () => {
  return (
    <section className="text-center px-6 py-16">
      <div className="flex justify-center mb-2">
        <Image
          src="/assets/NeuroDatics-logo.svg"
          alt="NeuroDatics Logo"
          width={96}
          height={96}
          className="h-24 w-auto transition-transform hover:scale-105"
        />
      </div>

      <h1 className="text-5xl font-semibold text-gray-900 mb-6 tracking-tight">
        NeuroDatics
      </h1>

      <p className="text-gray-600 text-base leading-relaxed max-w-2xl mx-auto mb-8">
        Desarrollamos profesional para el análisis de bioseñales en
        neuromarketing,
        <br />
        acción atención, activación emocional y componentes visual mediante
        <br />
        electroencefalografo, sensor galvánico y eye tracking.
      </p>

      <Button className="bg-black text-white px-8 py-5 hover:bg-gray-700 transition-colors duration-200 text-sm font-medium">
        Ver demo
      </Button>

      <div className="max-w-2xl mx-auto mt-12">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <div className="bg-gray-200 rounded-xl aspect-video flex items-center justify-center mb-4 relative overflow-hidden group cursor-pointer">
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-200" />
            <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200 relative z-10">
              <Play className="w-6 h-6 text-black ml-1" fill="black" />
            </div>
          </div>

          <div className="text-left">
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              Tutorial de introducción
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">
              Aprende cómo crear proyectos, cargar datos de sensores, visualizar
              métricas de bioseñales y generar reportes profesionales en pocos
              minutos.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
