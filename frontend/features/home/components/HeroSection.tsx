"use client"

import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import Image from "next/image"

export const HeroSection = () => {
  return (
    <section className="relative px-4 py-16 text-center sm:px-6 lg:py-20 2xl:py-24">
      <div className="mb-4 flex justify-center">
        <Image
          src="/assets/NeuroDatics-logo.png"
          alt="NeuroDatics Logo"
          width={96}
          height={96}
          className="h-20 w-auto transition-transform hover:scale-105 2xl:h-24"
        />
      </div>

      <h1 className="mb-5 text-5xl font-semibold tracking-tight text-foreground sm:text-6xl 2xl:mb-6 2xl:text-7xl">
        NeuroDatics
      </h1>

      <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-foreground/70">
        Desarrollamos profesional para el análisis de bioseñales en
        neuromarketing,
        <br />
        acción atención, activación emocional y componentes visual mediante
        <br />
        electroencefalografo, sensor galvánico y eye tracking.
      </p>

      <Button className="bg-foreground px-8 py-5 text-sm font-medium text-background transition-colors duration-200 hover:bg-foreground/90">
        Ver demo
      </Button>

      <div className="mx-auto mt-10 max-w-2xl 2xl:mt-12">
          <div className="rounded-2xl border border-foreground/15 bg-foreground/5 p-5 backdrop-blur-md 2xl:p-6">
            <div className="group relative mb-4 flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-foreground/10">
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-200" />
              <div className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full bg-foreground shadow-lg transition-transform duration-200 group-hover:scale-110">
              <Play className="ml-1 h-6 w-6 text-background" fill="currentColor" />
            </div>
          </div>

          <div className="text-left">
            <h3 className="mb-2 text-base font-semibold text-foreground">
              Tutorial de introducción
            </h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
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
