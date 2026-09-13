import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    // DISPATCH intentionally uses document navigation so public pages do not
    // ship the Next client router or hydrate otherwise static reporting.
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },
  globalIgnores(['.next/**', 'coverage/**', 'output/**', 'playwright-report/**', 'test-results/**']),
])
