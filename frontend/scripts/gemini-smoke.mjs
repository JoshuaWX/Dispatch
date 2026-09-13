import { GoogleGenAI } from '@google/genai'

const model = process.env.GEMINI_MODEL?.trim()
const apiKey = process.env.GEMINI_API_KEY?.trim()

if (model !== 'gemini-3.6-flash') {
  throw new Error('GEMINI_MODEL must be exactly gemini-3.6-flash')
}
if (!apiKey) throw new Error('GEMINI_API_KEY is required')

const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 30_000)

try {
  const client = new GoogleGenAI({ apiKey })
  const prompt = 'Return JSON confirming that this structured-output smoke test succeeded.'
  const counted = await client.models.countTokens({
    model,
    contents: prompt,
    config: { abortSignal: controller.signal },
  })
  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      abortSignal: controller.signal,
      temperature: 0,
      maxOutputTokens: 128,
      responseMimeType: 'application/json',
      responseJsonSchema: {
        type: 'object',
        additionalProperties: false,
        required: ['ok', 'model'],
        properties: {
          ok: { type: 'boolean' },
          model: { type: 'string', enum: ['gemini-3.6-flash'] },
        },
      },
      thinkingConfig: { thinkingBudget: 128 },
    },
  })

  const parsed = JSON.parse(response.text ?? '')
  if (parsed.ok !== true || parsed.model !== model) {
    throw new Error('Gemini returned an invalid structured smoke response')
  }

  const usage = response.usageMetadata
  const inputTokens = usage?.promptTokenCount
  const outputTokens = (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0)
  if (!Number.isInteger(counted.totalTokens) || !Number.isInteger(inputTokens) || !Number.isInteger(outputTokens)) {
    throw new Error('Gemini did not return complete usage metadata')
  }

  process.stdout.write(`${JSON.stringify({
    model,
    structuredOutput: true,
    countedInputTokens: counted.totalTokens,
    inputTokens,
    outputTokens,
  })}\n`)
} catch (error) {
  const status = Number(error?.status ?? error?.code)
  const providerMessage = String(error?.message ?? '')
  const reason = status === 403 && /has not been used|disabled|SERVICE_DISABLED/i.test(providerMessage)
    ? 'service_disabled'
    : status === 403
      ? 'permission_denied'
      : 'request_failed'
  process.stderr.write(`${JSON.stringify({
    ok: false,
    model,
    status: Number.isFinite(status) ? status : null,
    reason,
  })}\n`)
  process.exitCode = 1
} finally {
  clearTimeout(timeout)
}
