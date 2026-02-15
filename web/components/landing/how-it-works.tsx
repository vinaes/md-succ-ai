"use client"

import * as React from "react"
import { Copy, Check } from "lucide-react"

function CodeBlock({ code, title }: { code: string; title: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative group w-full">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-secondary/30">
          <span className="text-xs font-mono text-muted-foreground">{title}</span>
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-secondary transition-colors"
            aria-label="Copy code"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </button>
        </div>
        <pre className="p-4 overflow-hidden">
          <code className="text-sm font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed break-all">
            {code}
          </code>
        </pre>
      </div>
    </div>
  )
}

const steps = [
  {
    number: "01",
    title: "Fetch any URL",
    description: "Prepend md.succ.ai/ to any URL. YouTube links return transcripts automatically. Add query params for citation links or fit mode.",
    code: `# Basic conversion
curl https://md.succ.ai/https://example.com

# YouTube transcript
curl https://md.succ.ai/https://youtube.com/watch?v=dQw4w9WgXcQ

# Citation-style links
curl "https://md.succ.ai/?url=https://en.wikipedia.org/wiki/Markdown&links=citations"

# LLM-optimized (pruned boilerplate)
curl "https://md.succ.ai/?url=https://htmx.org/docs/&mode=fit"`,
    codeTitle: "terminal",
  },
  {
    number: "02",
    title: "Get clean Markdown",
    description: "9-pass extraction finds the content. Turndown converts to Markdown. Navigation, ads, and sidebars are stripped. Quality scored A-F.",
    code: `Title: Example Domain
URL Source: https://example.com
Description: This domain is for use in...

Markdown Content:
# Example Domain

This domain is for use in documentation
examples without needing permission.

[Learn more](https://iana.org/domains/example)`,
    codeTitle: "response (text/markdown)",
  },
  {
    number: "03",
    title: "Extract structured data",
    description: "POST a JSON schema to /extract. The LLM extracts matching fields from any page. Validated with Ajv.",
    code: `curl -X POST https://md.succ.ai/extract \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com",
    "schema": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "heading": { "type": "string" }
      }
    }
  }'

# → { "title": "Example Domain", "heading": "Example Domain" }`,
    codeTitle: "terminal",
  },
  {
    number: "04",
    title: "Batch & async",
    description: "Convert up to 50 URLs in one request with POST /batch. Or use POST /async for background processing with optional webhook delivery.",
    code: `# Batch: convert multiple URLs at once
curl -X POST https://md.succ.ai/batch \\
  -H "Content-Type: application/json" \\
  -d '{"urls": ["https://example.com", "https://htmx.org"]}'

# Async with webhook callback
curl -X POST https://md.succ.ai/async \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://example.com",
    "callback_url": "https://your-api.com/hook"
  }'`,
    codeTitle: "terminal",
  },
]

export function HowItWorks() {
  return (
    <section id="api" className="px-4 sm:px-6 py-20 sm:py-32 bg-card/50 scroll-mt-20 min-h-screen flex items-center">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-mono text-green mb-3 tracking-wide uppercase">API</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-balance">
            One URL, clean Markdown
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            No API key. No SDK. Just a URL. Works from curl, fetch, or any HTTP client.
          </p>
        </div>

        <div className="flex flex-col gap-20">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className={`flex flex-col lg:flex-row gap-8 items-start ${
                index % 2 === 1 ? 'lg:flex-row-reverse' : ''
              }`}
            >
              <div className="flex-1 lg:pt-4">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-green font-mono text-sm font-medium">{step.number}</span>
                  <div className="h-px flex-1 bg-border max-w-12" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-foreground">{step.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
              </div>

              <div className="flex-1 w-full">
                <CodeBlock code={step.code} title={step.codeTitle} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
