import { Check, X, Minus } from "lucide-react"

const rows = [
  {
    feature: "Content extraction",
    md: "Readability",
    mdNew: "Cloudflare",
    jina: "Custom",
  },
  {
    feature: "SPA support",
    md: true,
    mdNew: false,
    jina: "Limited",
  },
  {
    feature: "Token counting",
    md: "cl100k_base",
    mdNew: false,
    jina: "Custom",
  },
  {
    feature: "Rate limit",
    md: "30 req/s",
    mdNew: "200/month",
    jina: "Generous",
  },
  {
    feature: "Self-hostable",
    md: true,
    mdNew: false,
    jina: false,
  },
  {
    feature: "Latency (static)",
    md: "200-500ms",
    mdNew: "200-800ms",
    jina: "500-2000ms",
  },
  {
    feature: "Latency (SPA)",
    md: "3-15s",
    mdNew: null,
    jina: "5-15s",
  },
  {
    feature: "Clean output",
    md: true,
    mdNew: false,
    jina: false,
  },
]

function CellValue({ value }: { value: boolean | string | null }) {
  if (value === true) return <Check className="w-4 h-4 text-green mx-auto" />
  if (value === false) return <X className="w-4 h-4 text-destructive mx-auto" />
  if (value === null) return <Minus className="w-4 h-4 text-muted-foreground mx-auto" />
  return <span className="text-sm text-muted-foreground">{value}</span>
}

export function Comparison() {
  return (
    <section id="comparison" className="px-6 py-32 bg-card/50 scroll-mt-20 min-h-screen flex items-center">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-mono text-green mb-3 tracking-wide uppercase">Comparison</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-balance">
            How we compare
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            md.succ.ai uses Mozilla Readability to extract clean article content.
            Other services dump the entire HTML including navigation and sidebars.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/30">
                  <th className="px-6 py-3 text-left font-mono text-muted-foreground font-normal">Feature</th>
                  <th className="px-6 py-3 text-center font-mono text-green font-medium">md.succ.ai</th>
                  <th className="px-6 py-3 text-center font-mono text-muted-foreground font-normal">markdown.new</th>
                  <th className="px-6 py-3 text-center font-mono text-muted-foreground font-normal">r.jina.ai</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.feature} className={i < rows.length - 1 ? "border-b border-border" : ""}>
                    <td className="px-6 py-3 text-foreground font-medium">{row.feature}</td>
                    <td className="px-6 py-3 text-center"><CellValue value={row.md} /></td>
                    <td className="px-6 py-3 text-center"><CellValue value={row.mdNew} /></td>
                    <td className="px-6 py-3 text-center"><CellValue value={row.jina} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
