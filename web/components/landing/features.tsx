import { Scissors, Youtube, LinkIcon, Minimize2, Database, Shield, Layers, Webhook, Rss } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

const features = [
  {
    icon: Scissors,
    title: "9-Pass Extraction",
    description: "Readability, Defuddle, article-extractor, CSS selectors, Schema.org, Open Graph, text density — 9 extraction passes with quality ratio checks.",
    color: "text-green",
  },
  {
    icon: Youtube,
    title: "YouTube Transcripts",
    description: "YouTube URLs are automatically detected and transcripts extracted with timestamps. No browser needed — direct innertube API.",
    color: "text-blue",
  },
  {
    icon: LinkIcon,
    title: "Citation Links",
    description: "?links=citations converts inline links to numbered references with a footer. Saves tokens on repeated URLs. Academic-style output for LLMs.",
    color: "text-green",
  },
  {
    icon: Minimize2,
    title: "fit_markdown Mode",
    description: "?mode=fit prunes boilerplate sections — navigation, footers, low-value content. Smaller context for LLMs without losing signal.",
    color: "text-blue",
  },
  {
    icon: Database,
    title: "Schema Extraction",
    description: "POST /extract with a JSON schema. Returns structured data extracted by LLM. Any page, any schema — validated with Ajv.",
    color: "text-green",
  },
  {
    icon: Shield,
    title: "Security Hardened",
    description: "SSRF protection with DNS validation, private IP blocking, redirect validation. Prompt injection hardening. Schema field whitelist.",
    color: "text-blue",
  },
  {
    icon: Layers,
    title: "Batch Conversion",
    description: "POST /batch with up to 50 URLs. Parallel processing with 10-worker concurrency. Per-URL errors and timeout protection.",
    color: "text-green",
  },
  {
    icon: Webhook,
    title: "Async + Webhooks",
    description: "POST /async for background jobs. Poll /job/:id or receive results via HTTPS webhook callback. SSRF-protected callbacks.",
    color: "text-blue",
  },
  {
    icon: Rss,
    title: "RSS/Atom Feeds",
    description: "Feed URLs auto-detected by content-type. Parsed into structured JSON with titles, links, dates, and descriptions.",
    color: "text-green",
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
            9 extraction passes to find content. 3 conversion tiers for reliability.
            YouTube transcripts, citation links, LLM-optimized output, and structured extraction.
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
