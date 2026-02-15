import Link from "next/link"
import { Github } from "lucide-react"

const links = {
  project: [
    { label: "Try It", href: "#try" },
    { label: "Features", href: "#features" },
    { label: "API", href: "#api" },
    { label: "Self-Hosting", href: "#self-hosting" },
  ],
  resources: [
    { label: "API Reference", href: "https://md.succ.ai/docs", external: true },
    { label: "Issues", href: "https://github.com/vinaes/md-succ-ai/issues", external: true },
    { label: "API Health", href: "https://md.succ.ai/health", external: true },
  ],
  ecosystem: [
    { label: "succ", href: "https://succ.ai", external: true },
    { label: "succ GitHub", href: "https://github.com/vinaes/succ", external: true },
    { label: "License (FSL 1.1)", href: "https://github.com/vinaes/md-succ-ai/blob/main/LICENSE", external: true },
  ],
}

export function Footer() {
  return (
    <footer className="px-6 py-16 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-green" />
              <span className="text-xl font-bold text-foreground">md.succ.ai</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              URL to Markdown API. Part of the succ ecosystem.
            </p>
            <Link
              href="https://github.com/vinaes/md-succ-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="w-5 h-5" />
              <span className="sr-only">GitHub</span>
            </Link>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-foreground text-sm">Project</h4>
            <ul className="flex flex-col gap-2">
              {links.project.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-foreground text-sm">Resources</h4>
            <ul className="flex flex-col gap-2">
              {links.resources.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-foreground text-sm">Ecosystem</h4>
            <ul className="flex flex-col gap-2">
              {links.ecosystem.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            &copy; 2026 Vinaes Code Ltd. Released under the FSL 1.1.
          </p>
          <div className="text-xs text-muted-foreground/60 text-right">
            <p>
              Powered by <Link href="https://succ.ai" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">succ.ai</Link>
            </p>
            <p className="mt-1">
              LLM models by <Link href="https://nano-gpt.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">NanoGPT</Link>
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
