// Review these paid-tier rates before changing the editorial model or its price.
export const GEMINI_MODEL = 'gemini-3.1-flash-lite'
export const GEMINI_PRICE_REVIEW_AFTER = new Date('2027-01-01T00:00:00.000Z')
export const GEMINI_INPUT_USD_PER_MILLION = 0.25
export const GEMINI_OUTPUT_USD_PER_MILLION = 1.5

export const GEMINI_DRAFT_LIMITS = {
  maxInputTokens: 10_000,
  maxOutputTokens: 2_800,
  thinkingLevel: 'MEDIUM',
  temperature: 0.2,
} as const

export const GEMINI_VERIFICATION_LIMITS = {
  maxInputTokens: 6_000,
  maxOutputTokens: 1_200,
  thinkingLevel: 'MEDIUM',
  temperature: 0,
} as const

// Leave room for structured-output schema tokens that countTokens may not include.
const INPUT_OVERHEAD_TOKENS = 1_000

export function maximumModelCostUsd(limits: { maxInputTokens: number; maxOutputTokens: number }) {
  const maximum = (
    (limits.maxInputTokens + INPUT_OVERHEAD_TOKENS) * GEMINI_INPUT_USD_PER_MILLION +
    limits.maxOutputTokens * GEMINI_OUTPUT_USD_PER_MILLION
  ) / 1_000_000
  return Math.ceil(maximum * 100) / 100
}
