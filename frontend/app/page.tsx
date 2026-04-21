"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import {
  HeroSection,
  FeaturesSection,
  HowItWorksSection,
  CTASection,
  Footer,
} from "@/features/home"
import LineWaves from "@/components/LineWaves"

export default function HomePage() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const isDark = !mounted || resolvedTheme === 'dark'

  return (
    <div className="relative min-h-screen bg-background overflow-x-hidden">
      {/* Global LineWaves background — fixed so it persists while scrolling */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <LineWaves
          speed={0.3}
          innerLineCount={32}
          outerLineCount={36}
          warpIntensity={1}
          rotation={-45}
          edgeFadeWidth={0}
          colorCycleSpeed={0.7}
          brightness={isDark ? 0.2 : 0.15}
          color1={isDark ? "#ffffff" : "#1a1a1a"}
          color2={isDark ? "#ffffff" : "#1a1a1a"}
          color3={isDark ? "#ffffff" : "#1a1a1a"}
          enableMouseInteraction={false}
          mouseInfluence={2}
        />
      </div>

      {/* All page content sits above the fixed background */}
      <div className="relative z-10">
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <CTASection />
        <Footer />
      </div>
    </div>
  )
}
