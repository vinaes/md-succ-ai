import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-foreground mb-4">404</h1>
        <p className="text-muted-foreground mb-8">Page not found</p>
        <Link
          href="/"
          className="text-green hover:text-green/80 font-mono text-sm transition-colors"
        >
          Back to md.succ.ai
        </Link>
      </div>
    </div>
  )
}
