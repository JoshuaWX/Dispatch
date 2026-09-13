import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://dispatch-1news.vercel.app'),
  title: { default: 'DISPATCH · Evidence-linked AI reporting', template: '%s · DISPATCH' },
  description: 'AI-authored reporting that is published only after strict evidence and independent verification gates.',
  keywords: ['news', 'AI', 'journalism', 'transparency', 'sources'],
  authors: [{ name: 'DISPATCH' }],
  icons: {
    icon: '/dispatch-sign.svg',
    apple: '/apple-icon.svg',
  },
  alternates: { canonical: '/' },
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website', siteName: 'DISPATCH', title: 'DISPATCH · Evidence-linked AI reporting',
    description: 'AI-authored reporting with evidence-linked verification.', url: '/',
    images: [{ url: '/dispatch-social.svg', width: 1200, height: 630, alt: 'DISPATCH' }],
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f3' },
    { media: '(prefers-color-scheme: dark)', color: '#111111' },
  ],
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Opt every document into dynamic rendering so Next can propagate the
  // per-request CSP nonce from the proxy onto framework scripts.
  await headers()
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
        <a href="#main-content" className="sr-only z-[100] bg-background p-3 focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to main content</a>
        <Header />
        <main id="main-content" className="grow" tabIndex={-1}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}
