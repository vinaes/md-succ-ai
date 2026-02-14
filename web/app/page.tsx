import { SiteHeader } from "@/components/landing/site-header"
import { Hero } from "@/components/landing/hero"
import { Features } from "@/components/landing/features"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Pipeline } from "@/components/landing/pipeline"
import { Comparison } from "@/components/landing/comparison"
import { SelfHosting } from "@/components/landing/self-hosting"
import { Footer } from "@/components/landing/footer"

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <Pipeline />
        <HowItWorks />
        <Comparison />
        <SelfHosting />
      </main>
      <Footer />
    </div>
  )
}
