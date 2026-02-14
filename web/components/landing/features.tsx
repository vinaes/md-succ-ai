import { Scissors, Timer, Globe, Gauge, Server, FileText } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

const features = [
  {
    icon: Scissors,
    title: "Readability Extraction",
    description: "Mozilla Readability strips navigation, sidebars, footers, and ads. You get the article content, not the page chrome.",
    color: "text-green",
  },
  {
    icon: Timer,
    title: "200-500ms Static Pages",
    description: "Plain fetch + DOM parse + Readability + Turndown. No browser overhead for well-structured HTML pages.",
    color: "text-blue",
  },
  {
    icon: Globe,
    title: "SPA / JS-Heavy Sites",
    description: "Playwright headless Chromium as automatic fallback for single-page apps, client-rendered content, and JavaScript-heavy sites.",
    color: "text-green",
  },
  {
    icon: Gauge,
    title: "Token Counting",
    description: "Every response includes cl100k_base token count in the x-markdown-tokens header. Know exactly how much context you're using.",
    color: "text-blue",
  },
  {
    icon: Server,
    title: "Self-Hostable",
    description: "Docker image, docker-compose.yml, nginx config included. Deploy to your own infrastructure in minutes. No vendor lock-in.",
    color: "text-green",
  },
  {
    icon: FileText,
    title: "Content Negotiation",
    description: "Accept: application/json for structured data with metadata. Default text/markdown for raw content. Proper HTTP headers.",
    color: "text-blue",
  },
]

export function Features() {
  return (
    <section id="features" className="px-6 py-32 scroll-mt-20 min-h-screen flex items-center">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-mono text-green mb-3 tracking-wide uppercase">Why md.succ.ai</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-balance">
            Clean content, not page cruft
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Other services dump the entire HTML as markdown, including navigation, sidebars, and footers.
            We extract just the article content using Mozilla Readability.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
