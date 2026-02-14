"use client"

import * as React from "react"
import { Copy, Check } from "lucide-react"

function CopyBlock({ code, title }: { code: string; title: string }) {
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

export function SelfHosting() {
  return (
    <section id="self-hosting" className="px-6 py-32 scroll-mt-20 min-h-screen flex items-center">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-mono text-green mb-3 tracking-wide uppercase">Self-Hosting</p>
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-balance">
            Run your own instance
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Docker image with Chromium included. One command to deploy.
            No external dependencies, no API keys, no accounts.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-green font-mono text-sm font-medium">01</span>
              <div className="h-px flex-1 bg-border max-w-12" />
            </div>
            <h3 className="text-xl font-semibold mb-3 text-foreground">Docker (recommended)</h3>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Clone the repo and start the container. Chromium is bundled in the image.
              Available at localhost:3100.
            </p>
            <CopyBlock
              title="terminal"
              code={`git clone https://github.com/vinaes/md-succ-ai.git
cd md-succ-ai
docker compose up -d`}
            />
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-green font-mono text-sm font-medium">02</span>
              <div className="h-px flex-1 bg-border max-w-12" />
            </div>
            <h3 className="text-xl font-semibold mb-3 text-foreground">Local (no Docker)</h3>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Install dependencies and start the server.
              Requires Node.js 20+ and Chromium for Playwright.
            </p>
            <CopyBlock
              title="terminal"
              code={`npm install
npx playwright install chromium
npm start`}
            />
          </div>
        </div>

        <div className="mt-12 bg-card border border-border rounded-lg p-6">
          <h3 className="text-sm font-mono text-green mb-4 uppercase tracking-wide">Environment Variables</h3>
          <div className="space-y-3 text-sm font-mono">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <span className="text-foreground">PORT</span>
              <span className="text-muted-foreground">Server port (default: 3000)</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <span className="text-foreground">ENABLE_BROWSER</span>
              <span className="text-muted-foreground">Playwright fallback (default: true)</span>
            </div>
            <div className="h-px bg-border" />
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
              <span className="text-foreground">NODE_ENV</span>
              <span className="text-muted-foreground">Environment (default: production)</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
