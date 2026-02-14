export function Pipeline() {
  return (
    <section className="px-4 sm:px-6 py-20 sm:py-32 scroll-mt-20 min-h-screen flex items-center">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12 sm:mb-16">
          <p className="text-sm font-mono text-green mb-3 tracking-wide uppercase">Architecture</p>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-balance">
            Multi-tier conversion pipeline
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed px-2">
            9-pass extraction, quality scoring, automatic fallback through 3 tiers.
            YouTube transcripts, document formats, citation links, and fit_markdown.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-secondary/30">
            <span className="text-xs font-mono text-muted-foreground">conversion pipeline</span>
          </div>
          <pre className="p-4 sm:p-6 overflow-x-auto custom-scrollbar">
            <code className="text-xs sm:text-sm font-mono text-muted-foreground whitespace-pre leading-loose">{`URL
 │
 ├─ YouTube? `}<span className="text-green">→ Transcript extraction</span>{`
 │
 ├─ Document? (PDF, DOCX, XLSX, CSV)
 │  └─ `}<span className="text-green">Document converter → Markdown</span>{`
 │
 ├─ Tier 1: 9-pass extraction (200-500ms)
 │  1. Readability (standard)
 │  2. Defuddle (Obsidian team)
 │  3. Article Extractor (alt heuristics)
 │  4. Readability on cleaned HTML
 │  5. CSS content selectors
 │  6. Schema.org / JSON-LD
 │  7. Open Graph / meta tags
 │  8. Text density analysis
 │  9. Cleaned body fallback
 │  Quality ratio check (< 15% → skip)
 │
 │  Quality ≥ B? `}<span className="text-green">→ return Markdown</span>{`
 │
 ├─ Tier 2: Playwright browser (3-15s)
 │  └─ Same 9-pass on rendered DOM
 │
 └─ Tier 2.5: LLM extraction
    └─ nano-gpt structured extract

Post-processing:
 ├─ `}<span className="text-blue">?links=citations</span>{` → numbered references
 ├─ `}<span className="text-blue">?mode=fit</span>{`         → prune boilerplate
 └─ `}<span className="text-blue">?max_tokens=N</span>{`    → truncate output`}</code>
          </pre>
        </div>

        {/* Response headers + Endpoints */}
        <div className="mt-8 sm:mt-12 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
            <h3 className="text-sm font-mono text-green mb-4 uppercase tracking-wide">Response Headers</h3>
            <div className="space-y-3 text-xs sm:text-sm font-mono">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">x-markdown-tokens</span>
                <span className="text-foreground text-right">Token count</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">x-conversion-tier</span>
                <span className="text-foreground text-right">fetch | browser | llm | youtube | document:*</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">x-extraction-method</span>
                <span className="text-foreground text-right">readability | defuddle | pdf | ...</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">x-quality-score</span>
                <span className="text-foreground text-right">0-1</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">x-quality-grade</span>
                <span className="text-foreground text-right">A-F</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">x-cache</span>
                <span className="text-foreground text-right">hit | miss</span>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-4 sm:p-6">
            <h3 className="text-sm font-mono text-green mb-4 uppercase tracking-wide">Endpoints</h3>
            <div className="space-y-3 text-xs sm:text-sm font-mono">
              <div className="flex justify-between">
                <span className="text-blue">GET</span>
                <span className="text-muted-foreground">/{'{url}'}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-blue">GET</span>
                <span className="text-muted-foreground">/?url={'{url}'}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-green">POST</span>
                <span className="text-muted-foreground">/extract</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-blue">GET</span>
                <span className="text-muted-foreground">/health</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-blue">GET</span>
                <span className="text-muted-foreground">/</span>
              </div>
            </div>

            <h3 className="text-sm font-mono text-green mt-6 mb-4 uppercase tracking-wide">Supported Formats</h3>
            <div className="space-y-3 text-xs sm:text-sm font-mono">
              <div className="flex justify-between">
                <span className="text-foreground">HTML</span>
                <span className="text-muted-foreground">9-pass + Turndown</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-foreground">PDF</span>
                <span className="text-muted-foreground">unpdf text extraction</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-foreground">DOCX</span>
                <span className="text-muted-foreground">mammoth → Turndown</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-foreground">XLSX / CSV</span>
                <span className="text-muted-foreground">SheetJS → tables</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-foreground">YouTube</span>
                <span className="text-muted-foreground">transcript + timestamps</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
