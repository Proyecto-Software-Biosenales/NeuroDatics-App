import {
  HeroSection,
  FeaturesSection,
  HowItWorksSection,
  CTASection,
  Footer,
} from "@/lib/shared/home"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CTASection />
      <Footer />
    </div>
  )
}
