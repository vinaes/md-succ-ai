"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Github, ArrowRight, Zap, Shield, FileText } from "lucide-react"
import Link from "next/link"

export function Hero() {
  return (
    <section id="try" className="flex flex-col items-center justify-center min-h-[85vh] px-4 sm:px-6 py-24 text-center scroll-mt-20">
      {/* Badges */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card/50">
          <div className="w-2 h-2 rounded-full bg-green animate-pulse" />
          <span className="text-xs font-mono text-muted-foreground tracking-wide uppercase">
            Live
          </span>
          <span className="text-xs text-border">|</span>
          <span className="text-xs font-mono text-muted-foreground">Open Source</span>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-full border border-green/30 bg-green/5">
          <Shield className="w-3 h-3 text-green" />
          <span className="text-xs font-mono text-green/80 tracking-wide uppercase">
            0 CVE
          </span>
        </div>
      </div>

      {/* Logo + Title */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-green" />
        <span className="text-4xl sm:text-6xl md:text-8xl font-bold tracking-tight text-foreground">
          md.succ.ai
        </span>
      </div>

      {/* Subtitle */}
      <h1 className="text-lg sm:text-xl md:text-2xl text-muted-foreground mb-4 max-w-xl text-balance leading-relaxed font-mono">
        url to markdown
      </h1>

      <p className="text-sm sm:text-base text-muted-foreground/80 mb-12 max-w-lg text-balance leading-relaxed px-2">
        Convert any webpage or document to clean Markdown.
        HTML, PDF, DOCX, XLSX, CSV, YouTube transcripts. Citation links, fit mode, schema extraction.
        Built for AI agents and RAG pipelines.
      </p>

      {/* Try it */}
      <div className="mb-8 w-full max-w-xl px-2">
        <UrlInput />
      </div>

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <Button
          asChild
          size="lg"
          className="bg-green hover:bg-green/90 text-background font-medium gap-2 px-6"
        >
          <Link href="#api">
            <ArrowRight className="w-5 h-5" />
            API Docs
          </Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="bg-transparent border-border text-foreground hover:bg-card gap-2 px-6"
        >
          <Link href="https://github.com/vinaes/md-succ-ai" target="_blank" rel="noopener noreferrer">
            <Github className="w-5 h-5" />
            View Source
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mt-10 text-xs sm:text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Zap className="w-4 h-4 text-green" />
          <span className="font-mono">200-500ms</span>
        </div>
        <span className="text-border hidden sm:inline">|</span>
        <div className="flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-blue" />
          <span className="font-mono">9-pass extraction</span>
        </div>
        <span className="text-border hidden sm:inline">|</span>
        <div className="flex items-center gap-1.5">
          <FileText className="w-4 h-4 text-green" />
          <span className="font-mono">PDF / DOCX / YouTube</span>
        </div>
      </div>
    </section>
  )
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="animate-bounce [animation-delay:0ms]">.</span>
      <span className="animate-bounce [animation-delay:150ms]">.</span>
      <span className="animate-bounce [animation-delay:300ms]">.</span>
    </span>
  )
}

function UrlInput() {
  const [url, setUrl] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState<{ markdown: string; tokens: number; tier: string; time: number; quality?: string } | null>(null)
  const [error, setError] = React.useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return

    setLoading(true)
    setResult(null)
    setError("")

    const target = url.startsWith("http") ? url : `https://${url}`

    try {
      const res = await fetch(`https://md.succ.ai/${target}`, {
        headers: { Accept: "application/json" },
      })
      if (!res.ok) {
        const text = await res.text()
        try { const j = JSON.parse(text); setError(j.error || `HTTP ${res.status}`) } catch { setError(`HTTP ${res.status}`) }
        setLoading(false)
        return
      }
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setResult({
          markdown: data.content,
          tokens: data.tokens,
          tier: data.tier,
          time: data.time_ms,
          quality: data.quality?.grade,
        })
      }
    } catch {
      setError("Failed to connect to API")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 sm:px-4 py-3 hover:border-green/50 transition-colors focus-within:border-green/50">
        <span className="text-green font-mono text-xs sm:text-sm shrink-0">md.succ.ai/</span>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="flex-1 min-w-0 bg-transparent text-foreground font-mono text-xs sm:text-sm outline-none placeholder:text-muted-foreground/50"
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="px-3 sm:px-4 py-1.5 bg-green hover:bg-green/90 text-background text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {loading ? <LoadingDots /> : "Convert"}
        </button>
      </form>

      {error && (
        <div className="mt-3 px-4 py-3 bg-destructive/10 border border-destructive/30 rounded-lg text-sm text-destructive font-mono break-all">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 sm:px-4 py-2 border-b border-border bg-secondary/30">
            <span className="text-xs font-mono text-muted-foreground">result</span>
            <div className="flex items-center gap-2 sm:gap-3 text-xs font-mono text-muted-foreground">
              <span className="text-green">{result.tokens} tok</span>
              <span>{result.tier}</span>
              {result.quality && <span className="text-blue">{result.quality}</span>}
              <span>{result.time}ms</span>
            </div>
          </div>
          <pre className="p-4 max-h-64 overflow-y-auto overflow-x-hidden custom-scrollbar">
            <code className="text-xs sm:text-sm font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {result.markdown.slice(0, 2000)}{result.markdown.length > 2000 ? "\n\n... (truncated)" : ""}
            </code>
          </pre>
        </div>
      )}
    </div>
  )
}
