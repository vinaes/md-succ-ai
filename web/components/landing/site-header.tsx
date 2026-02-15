"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Github, Menu, X } from "lucide-react"

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  const navLinks = [
    { href: "#try", label: "Try It" },
    { href: "#features", label: "Features" },
    { href: "#api", label: "API" },
    { href: "/docs", label: "Docs" },
    { href: "#self-hosting", label: "Self-Hosting" },
  ]

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
      <div className="max-w-6xl mx-auto flex h-14 items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-3 w-3 flex-shrink-0 rounded-full bg-green" aria-hidden="true" />
          <span className="text-lg font-semibold text-foreground">md.succ.ai</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6" aria-label="Main navigation">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Button asChild size="sm" variant="outline" className="bg-transparent border-border gap-2">
            <Link href="https://github.com/vinaes/md-succ-ai" target="_blank" rel="noopener noreferrer">
              <Github className="w-4 h-4" />
              GitHub
            </Link>
          </Button>
        </div>

        <button
          className="md:hidden p-2 text-muted-foreground hover:text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <nav className="md:hidden border-t border-border bg-background px-4 py-4 flex flex-col gap-3">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground py-2"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Button asChild size="sm" variant="outline" className="bg-transparent border-border gap-2 mt-2 w-fit">
            <Link href="https://github.com/vinaes/md-succ-ai" target="_blank" rel="noopener noreferrer">
              <Github className="w-4 h-4" />
              GitHub
            </Link>
          </Button>
        </nav>
      )}
    </header>
  )
}
