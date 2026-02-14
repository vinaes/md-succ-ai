import { Scissors, Timer, Globe, Gauge, Shield, FileText } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

const features = [
  {
    icon: Scissors,
    title: "8-Pass Extraction",
    description: "Readability, article-extractor, CSS selectors, Schema.org, Open Graph, text density — 8 extraction passes to find content other tools miss.",
    color: "text-green",
  },
  {
    icon: Timer,
    title: "200-500ms Static Pages",
    description: "Plain fetch + DOM parse + multi-pass extraction + Turndown. No browser overhead for well-structured HTML pages.",
    color: "text-blue",
  },
  {
    icon: Globe,
    title: "SPA + Browser Fallback",
    description: "Playwright headless Chromium as automatic Tier 2. LLM-based extraction as Tier 2.5. External API fallbacks as Tier 3. Automatic quality-based escalation.",
    color: "text-green",
  },
  {
    icon: FileText,
    title: "PDF, DOCX, XLSX, CSV",
    description: "Not just HTML — extract text from PDFs, convert Word documents, parse spreadsheets to markdown tables. Auto-detected by Content-Type.",
    color: "text-blue",
  },
  {
    icon: Gauge,
    title: "Quality Scoring",
    description: "Every response includes quality score (0-1) and grade (A-F). Token count, extraction method, conversion tier — full observability.",
    color: "text-green",
  },
  {
    icon: Shield,
    title: "Security Hardened",
    description: "SSRF protection with DNS validation, private IP blocking, redirect validation. Prompt injection hardening. 0 CVE dependencies.",
    color: "text-blue",
  },
]

export function Features() {
  return (
    <section id="features" className="px-4 sm:px-6 py-20 sm:py-32 scroll-mt-20 min-h-screen flex items-center">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-sm font-mono text-green mb-3 tracking-wide uppercase">Why md.succ.ai</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-balance">
            Clean content, not page cruft
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2">
            8 extraction passes to find content. 4 conversion tiers for reliability.
            Quality scoring to verify results. Document format support beyond HTML.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="bg-card border-border hover:border-muted-foreground/40 transition-colors group"
            >
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-4 group-hover:bg-secondary/80 transition-colors">
                  <feature.icon className={`w-5 h-5 ${feature.color}`} />
                </div>
                <CardTitle className="text-foreground text-lg">{feature.title}</CardTitle>
                <CardDescription className="text-muted-foreground leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
