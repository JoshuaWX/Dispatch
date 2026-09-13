import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DISPATCH', short_name: 'DISPATCH',
    description: 'Evidence-linked AI reporting.', start_url: '/', display: 'standalone',
    background_color: '#fafafa', theme_color: '#a62626',
    icons: [{ src: '/dispatch-sign.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
