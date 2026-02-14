export function Pipeline() {
  return (
    <section className="px-6 py-32 scroll-mt-20 min-h-screen flex items-center">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-mono text-green mb-3 tracking-wide uppercase">Architecture</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-balance">
            Two-tier conversion pipeline
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Fast path for static pages, headless browser fallback for SPAs.
            Automatic detection, zero configuration.
          </p>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-secondary/30">
            <span className="text-xs font-mono text-muted-foreground">conversion pipeline</span>
          </div>
          <pre className="p-6 overflow-hidden">
            <code className="text-sm font-mono text-muted-foreground whitespace-pre-wrap leading-loose break-words">{`URL
 │
 ├─ Tier 1: fetch + Readability + Turndown
 │  ├─ Plain HTTP fetch (200-500ms)
 │  ├─ Mozilla Readability extracts content
 │  ├─ Turndown converts HTML → Markdown
 │  └─ gpt-tokenizer counts tokens
 │
 │  Content is usable?
 │  ├─ `}<span className="text-green">Yes → return clean Markdown</span>{`
 │  └─ No (SPA, JS-required, error page)
 │
 └─ Tier 2: Playwright headless Chromium
    ├─ Launch page, wait for network idle (3-15s)
    ├─ Extract rendered HTML
    ├─ Readability + Turndown again
    └─ `}<span className="text-green">return clean Markdown</span></code>
          </pre>
        </div>

        {/* Response headers */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-sm font-mono text-green mb-4 uppercase tracking-wide">Response Headers</h3>
            <div className="space-y-3 text-sm font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">x-markdown-tokens</span>
                <span className="text-foreground">Token count</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">x-conversion-tier</span>
                <span className="text-foreground">fetch | browser</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">x-conversion-time</span>
                <span className="text-foreground">Time in ms</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">x-readability</span>
                <span className="text-foreground">true | false</span>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-sm font-mono text-green mb-4 uppercase tracking-wide">Endpoints</h3>
            <div className="space-y-3 text-sm font-mono">
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
                <span className="text-blue">GET</span>
                <span className="text-muted-foreground">/health</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between">
                <span className="text-blue">GET</span>
                <span className="text-muted-foreground">/</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
