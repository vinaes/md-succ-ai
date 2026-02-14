import React from "react"
import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
})

export const metadata: Metadata = {
  title: 'md.succ.ai — HTML to clean Markdown API',
  description: 'Convert any webpage to clean, readable Markdown. Built for AI agents, MCP tools, and RAG pipelines. Mozilla Readability extraction strips ads, navigation, and sidebars. Playwright fallback for SPAs. cl100k_base token counting. No API key required.',
  keywords: ['markdown', 'html to markdown', 'readability', 'web scraping', 'ai agents', 'mcp', 'rag', 'succ', 'content extraction', 'web to markdown', 'url to markdown', 'playwright', 'turndown', 'llm tools', 'ai tools'],
  metadataBase: new URL('https://md.succ.ai'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'md.succ.ai — HTML to clean Markdown API',
    description: 'Convert any URL to clean Markdown. Mozilla Readability extraction, Playwright SPA fallback, token counting. Built for AI agents and RAG pipelines. No API key required.',
    type: 'website',
    url: 'https://md.succ.ai',
    siteName: 'md.succ.ai',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary',
    title: 'md.succ.ai — HTML to clean Markdown API',
    description: 'Convert any URL to clean Markdown. Built for AI agents, MCP tools, and RAG pipelines. No API key required.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
}

export const viewport: Viewport = {
  themeColor: '#0d1117',
}

// JSON-LD structured data — static content, safe for inline injection
const jsonLdString = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      name: 'md.succ.ai',
      url: 'https://md.succ.ai',
      description: 'HTML to clean Markdown API. Convert any webpage to readable Markdown using Mozilla Readability extraction. Built for AI agents, MCP tools, and RAG pipelines.',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
      creator: {
        '@type': 'Organization',
        name: 'Vinaes Code Ltd',
        url: 'https://succ.ai',
      },
      featureList: [
        'Mozilla Readability content extraction',
        'Playwright headless Chromium for SPAs',
        'cl100k_base token counting',
        'Two-tier conversion pipeline (200-500ms static, 3-15s SPA)',
        'JSON and Markdown response formats',
        'Self-hostable with Docker',
        'No API key required',
      ],
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'How do I convert a URL to Markdown?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Prepend md.succ.ai/ to any URL. For example: curl https://md.succ.ai/https://example.com. No API key, no authentication needed.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does md.succ.ai work with single-page applications (SPAs)?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. md.succ.ai uses a two-tier pipeline: fast HTTP fetch for static pages (200-500ms), with automatic Playwright headless Chromium fallback for JavaScript-heavy and SPA sites (3-15s).',
          },
        },
        {
          '@type': 'Question',
          name: 'How is md.succ.ai different from other HTML to Markdown converters?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'md.succ.ai uses Mozilla Readability to extract only the article content, stripping navigation, ads, sidebars, and footers. Other services dump the entire HTML page as Markdown.',
          },
        },
        {
          '@type': 'Question',
          name: 'Can I self-host md.succ.ai?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Clone the GitHub repo and run docker compose up -d. The Docker image includes Chromium. No external dependencies, no API keys, no accounts needed.',
          },
        },
        {
          '@type': 'Question',
          name: 'Does md.succ.ai count tokens?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. Every response includes a cl100k_base token count in the x-markdown-tokens response header. JSON responses include a tokens field.',
          },
        },
      ],
    },
    {
      '@type': 'Organization',
      name: 'Vinaes Code Ltd',
      url: 'https://succ.ai',
      sameAs: [
        'https://github.com/vinaes',
      ],
    },
  ],
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString }}
        />
      </head>
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
      </body>
    </html>
  )
}
