import { randomUUID } from 'crypto'
import type { PipelineEvent, PipelineSnapshot, PublishedArticle } from '@/lib/dispatch-types'

type DispatchStore = {
  articles: PublishedArticle[]
  events: PipelineEvent[]
  pipeline: PipelineSnapshot
}

const createSeedArticles = (): PublishedArticle[] => [
  {
    id: 'dispatch-quantum-1',
    topic: 'Quantum computing breakthrough',
    headline: 'Quantum Error Correction Advances Put Practical Computing Closer to Reality',
    subheadline:
      'Researchers say a new approach could dramatically reduce the fragility that has long limited quantum systems.',
    lede:
      'Researchers at a leading lab say they have cut a major source of quantum computing error, a development that could shorten the path toward usable machines.',
    imageUrl:
      'https://images.unsplash.com/photo-1635070041078-e72b99c00b61?w=1600&h=900&fit=crop',
    imageCredit: 'Unsplash',
    body:
      'A new research milestone is drawing attention across the quantum computing field as scientists report progress on the long-running challenge of error correction. The work, described by researchers as an important step rather than a finished solution, focuses on stabilizing qubits long enough for practical computation.\n\nThe key advance is not a product launch or a sudden commercial breakthrough. It is a technical improvement that strengthens the case for continued investment in the field, where companies and universities have spent years trying to overcome instability and noise. The researchers say their method improves coherence and makes it easier to preserve quantum states long enough to complete meaningful calculations.\n\nIndependent experts are treating the result as notable because quantum computing progress is usually incremental and difficult to verify outside specialist circles. Several source reports emphasize that the result should be understood as a research step, not proof that large-scale quantum advantage is already here.\n\nStill, the implications are significant. If further replication confirms the findings, the work could influence roadmaps for cryptography, materials discovery, and scientific simulation. For now, the core story is one of technical progress, measured optimism, and a field that remains under intense scrutiny.',
    category: 'Science',
    tags: ['quantum computing', 'research', 'technology'],
    sources: [
      {
        id: 's1',
        name: 'Nature',
        url: 'https://www.nature.com/',
        reliability: 'high',
        excerpt:
          'Scientists describe a technical advance in error correction that improves quantum coherence under controlled conditions.',
        publishedAt: 'Today',
      },
      {
        id: 's2',
        name: 'MIT News',
        url: 'https://news.mit.edu/',
        reliability: 'high',
        excerpt:
          'The lab says the result should be viewed as a research milestone, not a commercial product announcement.',
        publishedAt: 'Today',
      },
      {
        id: 's3',
        name: 'Reuters',
        url: 'https://www.reuters.com/',
        reliability: 'high',
        excerpt:
          'Industry analysts say the advance may influence future investment timelines if it holds up under review.',
        publishedAt: 'Today',
      },
    ],
    readingTime: 6,
    publishedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    qualityScore: {
      sourceDiversity: 9,
      sensationalism: 10,
      factualConfidence: 9,
      ledeStrength: 9,
      overallScore: 9.3,
      flaggedClaims: [],
      publishRecommendation: true,
    },
    verificationStatus: 'verified',
  },
  {
    id: 'dispatch-world-2',
    topic: 'Ceasefire negotiations',
    headline: 'Diplomatic Talks Continue as Negotiators Search for a Narrower Path to Agreement',
    subheadline:
      'Officials describe the latest talks as fragile but active, with pressure rising on all sides to show movement.',
    lede:
      'Negotiators returned to the table on Monday as diplomats sought to narrow the remaining gaps in ceasefire talks that have drawn global attention.',
    imageUrl:
      'https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=1600&h=900&fit=crop',
    imageCredit: 'Unsplash',
    body:
      'The latest round of diplomatic engagement underscores how difficult it remains to secure a durable agreement. Officials familiar with the talks say the discussions are moving, but slowly, and that several key issues are still unresolved.\n\nThe most immediate questions concern implementation, sequencing, and verification. Those details matter because any agreement will depend not only on political will but also on whether the parties can accept mechanisms that reduce the chance of breakdown.\n\nSources close to the negotiations describe the atmosphere as cautious. Each side is under pressure from domestic audiences, humanitarian organizations, and international partners to make concessions without appearing to give away leverage. That tension has repeatedly complicated previous attempts to reach a durable deal.\n\nFor observers, the significance lies less in a headline breakthrough than in the fact that talks continue at all. The diplomatic process remains fragile, but the persistence of negotiations suggests that the parties still see a path, however narrow, toward an eventual agreement.',
    category: 'World',
    tags: ['diplomacy', 'ceasefire', 'world news'],
    sources: [
      {
        id: 's4',
        name: 'Associated Press',
        url: 'https://apnews.com/',
        reliability: 'high',
        excerpt:
          'Officials say the talks remain active despite unresolved questions around implementation and guarantees.',
        publishedAt: 'Today',
      },
      {
        id: 's5',
        name: 'BBC News',
        url: 'https://www.bbc.com/news',
        reliability: 'high',
        excerpt:
          'Diplomats describe the negotiations as fragile, with pressure increasing from humanitarian and political actors.',
        publishedAt: 'Today',
      },
    ],
    readingTime: 5,
    publishedAt: new Date(Date.now() - 1000 * 60 * 220).toISOString(),
    qualityScore: {
      sourceDiversity: 8,
      sensationalism: 10,
      factualConfidence: 8,
      ledeStrength: 8,
      overallScore: 8.5,
      flaggedClaims: [],
      publishRecommendation: true,
    },
    verificationStatus: 'verified',
  },
  {
    id: 'dispatch-business-3',
    topic: 'Central bank policy',
    headline: 'Markets Watch Central Bank Signals as Traders Reprice the Year Ahead',
    subheadline:
      'Investors are recalibrating expectations after new commentary hinted at a more cautious policy path.',
    lede:
      'Global markets moved lower in early trading after officials signaled that policy may remain restrictive longer than investors had hoped.',
    imageUrl:
      'https://images.unsplash.com/photo-1611974789855-9c2a0a7fbda3?w=1600&h=900&fit=crop',
    imageCredit: 'Unsplash',
    body:
      'Market participants spent much of the session parsing every phrase from central bank officials, with rate expectations shifting in response to the latest guidance. The move was not dramatic, but it was broad enough to affect equities, bonds, and currency markets at the same time.\n\nAnalysts said the reaction reflected a familiar pattern: traders often price in faster easing than policymakers are willing to endorse. When the gap widens, markets tend to pull back, particularly in sectors that are sensitive to borrowing costs.\n\nThe core question is whether inflation progress remains durable enough to allow a more flexible stance later in the year. Until then, investors appear to be adjusting to a more disciplined interpretation of the policy outlook.\n\nThe story is less about panic than recalibration. Markets are learning, again, that official language matters because it can alter expectations long before any rate decision is made.',
    category: 'Business',
    tags: ['markets', 'rates', 'economy'],
    sources: [
      {
        id: 's6',
        name: 'Reuters',
        url: 'https://www.reuters.com/',
        reliability: 'high',
        excerpt:
          'Traders reprice rate expectations after central bank remarks suggested a slower policy pivot.',
        publishedAt: 'Today',
      },
      {
        id: 's7',
        name: 'Bloomberg',
        url: 'https://www.bloomberg.com/',
        reliability: 'high',
        excerpt:
          'Broad market moves reflected a reassessment of the year-ahead policy path.',
        publishedAt: 'Today',
      },
    ],
    readingTime: 5,
    publishedAt: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
    qualityScore: {
      sourceDiversity: 8,
      sensationalism: 9,
      factualConfidence: 9,
      ledeStrength: 8,
      overallScore: 8.6,
      flaggedClaims: [],
      publishRecommendation: true,
    },
    verificationStatus: 'verified',
  },
]

const createInitialState = (): DispatchStore => ({
  articles: createSeedArticles(),
  events: [],
  pipeline: {
    status: 'idle',
    stage: 'idle',
    activeTopic: null,
    progress: 0,
    lastRunAt: null,
    lastSuccessAt: null,
    message: 'Ready to process the next trending story.',
    recentEvents: [],
  },
})

const globalForDispatch = globalThis as typeof globalThis & {
  __dispatchStore?: DispatchStore
}

const store = globalForDispatch.__dispatchStore ?? createInitialState()

if (!globalForDispatch.__dispatchStore) {
  globalForDispatch.__dispatchStore = store
}

const trimEvents = (events: PipelineEvent[]) => events.slice(-25)

export function listArticles() {
  return [...store.articles].sort(
    (left, right) =>
      new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()
  )
}

export function getArticleById(id: string) {
  return store.articles.find((article) => article.id === id) ?? null
}

export function upsertArticle(article: PublishedArticle) {
  const index = store.articles.findIndex((existing) => existing.id === article.id)
  if (index >= 0) {
    store.articles[index] = article
    return article
  }

  store.articles.unshift(article)
  return article
}

export function listRecentEvents() {
  return [...store.events].sort(
    (left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime()
  )
}

export function recordPipelineEvent(event: Omit<PipelineEvent, 'id' | 'timestamp'>) {
  const nextEvent: PipelineEvent = {
    ...event,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
  }

  store.events = trimEvents([...store.events, nextEvent])
  store.pipeline.recentEvents = store.events
  return nextEvent
}

export function setPipelineState(update: Partial<PipelineSnapshot>) {
  store.pipeline = {
    ...store.pipeline,
    ...update,
    recentEvents: store.events,
  }
  return store.pipeline
}

export function getPipelineSnapshot() {
  return {
    ...store.pipeline,
    recentEvents: listRecentEvents(),
  }
}

export function markPipelineRunning(topic: string) {
  const now = new Date().toISOString()
  store.pipeline = {
    ...store.pipeline,
    status: 'running',
    stage: 'trend-intake',
    activeTopic: topic,
    progress: 5,
    lastRunAt: now,
    message: `Processing ${topic}`,
    recentEvents: store.events,
  }
}

export function markPipelineIdle(message = 'Ready to process the next trending story.') {
  store.pipeline = {
    ...store.pipeline,
    status: 'idle',
    stage: 'idle',
    activeTopic: null,
    progress: 0,
    message,
    recentEvents: store.events,
  }
}

export function markPipelineDegraded(message: string) {
  store.pipeline = {
    ...store.pipeline,
    status: 'degraded',
    message,
    recentEvents: store.events,
  }
}

export function markPipelineSuccess(topic: string) {
  store.pipeline = {
    ...store.pipeline,
    status: 'idle',
    stage: 'idle',
    activeTopic: null,
    progress: 100,
    lastSuccessAt: new Date().toISOString(),
    message: `Published ${topic}`,
    recentEvents: store.events,
  }
}
