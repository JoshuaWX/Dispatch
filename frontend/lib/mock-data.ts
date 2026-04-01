export interface Article {
  id: string
  title: string
  description: string
  content: string
  image: string
  category: string
  author: string
  date: string
  readTime: number
  sources: Source[]
  trustScore: number
  aiSummary: string
}

export interface Source {
  id: string
  name: string
  url: string
  relevance: number
  verified: boolean
}

export interface PipelineEvent {
  id: string
  timestamp: string
  stage: 'ingestion' | 'processing' | 'verification' | 'publishing'
  status: 'pending' | 'processing' | 'completed' | 'failed'
  articleTitle: string
  details: string
}

// Mock articles data
export const mockArticles: Article[] = [
  {
    id: '1',
    title: 'Revolutionary Breakthrough in Quantum Computing Announced',
    description: 'Scientists unveil a new quantum processor that achieves unprecedented computational speeds, potentially transforming fields from drug discovery to climate modeling.',
    content: 'In a landmark announcement today, researchers revealed a quantum processor that operates at never-before-seen efficiency levels. The breakthrough, which took five years of development, represents a fundamental advancement in quantum computing technology. The processor utilizes a novel error-correction mechanism that dramatically reduces the rate of computational errors, one of the primary challenges in quantum systems.\n\nThe development team believes this achievement will accelerate timelines for practical quantum applications in cryptography, materials science, and artificial intelligence. Industry experts suggest this could reshape the competitive landscape in computing within the next decade.',
    image: 'https://images.unsplash.com/photo-1635070041078-e63b52702d4e?w=1200&h=600&fit=crop',
    category: 'Technology',
    author: 'Dr. Sarah Chen',
    date: '2024-04-01',
    readTime: 8,
    sources: [
      { id: 's1', name: 'Nature', url: 'https://nature.com', relevance: 95, verified: true },
      { id: 's2', name: 'Science Daily', url: 'https://sciencedaily.com', relevance: 88, verified: true },
    ],
    trustScore: 94,
    aiSummary: 'Scientists announce a new quantum processor with improved error correction, promising faster practical applications in computing.'
  },
  {
    id: '2',
    title: 'Global Climate Summit Reaches Historic Agreement',
    description: 'Countries pledge significant emissions reductions in groundbreaking international climate accord.',
    content: 'Delegates from 195 countries have reached a historic agreement on climate action during this week\'s global summit. The accord includes binding commitments from major emitters to reduce greenhouse gas emissions by 45% by 2035, compared to 2020 levels.\n\nThe agreement also establishes a $300 billion annual fund to support climate adaptation in developing nations, addressing long-standing calls for equitable climate finance. Environmental organizations have praised the accord as a turning point in global climate policy.',
    image: 'https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=1200&h=600&fit=crop',
    category: 'Environment',
    author: 'James Mitchell',
    date: '2024-03-31',
    readTime: 6,
    sources: [
      { id: 's3', name: 'Reuters', url: 'https://reuters.com', relevance: 92, verified: true },
      { id: 's4', name: 'BBC News', url: 'https://bbc.com', relevance: 90, verified: true },
    ],
    trustScore: 91,
    aiSummary: 'Countries agree to reduce emissions by 45% by 2035 and establish $300 billion climate adaptation fund.'
  },
  {
    id: '3',
    title: 'Artificial Intelligence Transforms Healthcare Diagnosis',
    description: 'New AI system surpasses human doctors in early disease detection accuracy.',
    content: 'A recently published study demonstrates that an advanced AI system can identify early-stage diseases with greater accuracy than experienced physicians. The AI model, trained on over 10 million medical imaging records, achieved a 96% accuracy rate compared to 87% for the physician control group.\n\nThe breakthrough has significant implications for accessible healthcare, particularly in regions with limited access to specialists. Hospitals worldwide are beginning pilot programs to integrate this technology into their diagnostic workflows.',
    image: 'https://images.unsplash.com/photo-1576091160550-112173f7f7b0?w=1200&h=600&fit=crop',
    category: 'Health',
    author: 'Dr. Emily Rodriguez',
    date: '2024-03-30',
    readTime: 7,
    sources: [
      { id: 's5', name: 'The Lancet', url: 'https://thelancet.com', relevance: 98, verified: true },
      { id: 's6', name: 'Medical News Today', url: 'https://medicalnewstoday.com', relevance: 85, verified: true },
    ],
    trustScore: 93,
    aiSummary: 'AI system achieves 96% accuracy in disease detection, surpassing human physicians in diagnostic capabilities.'
  },
]

// Mock pipeline events
export const mockPipelineEvents: PipelineEvent[] = [
  {
    id: 'e1',
    timestamp: '2024-04-01T14:30:00Z',
    stage: 'ingestion',
    status: 'completed',
    articleTitle: 'Revolutionary Breakthrough in Quantum Computing',
    details: 'Article ingested from 12 sources'
  },
  {
    id: 'e2',
    timestamp: '2024-04-01T14:35:00Z',
    stage: 'processing',
    status: 'completed',
    articleTitle: 'Revolutionary Breakthrough in Quantum Computing',
    details: 'Content processed and normalized'
  },
  {
    id: 'e3',
    timestamp: '2024-04-01T14:40:00Z',
    stage: 'verification',
    status: 'processing',
    articleTitle: 'Revolutionary Breakthrough in Quantum Computing',
    details: 'Verifying claims against 45 sources'
  },
  {
    id: 'e4',
    timestamp: '2024-04-01T14:20:00Z',
    stage: 'ingestion',
    status: 'completed',
    articleTitle: 'Global Climate Summit Reaches Agreement',
    details: 'Article ingested from 8 sources'
  },
  {
    id: 'e5',
    timestamp: '2024-04-01T14:25:00Z',
    stage: 'processing',
    status: 'completed',
    articleTitle: 'Global Climate Summit Reaches Agreement',
    details: 'Content processed and normalized'
  },
]

export const categories = ['All', 'Technology', 'Environment', 'Health', 'Business', 'Politics', 'Science']
export const sources = ['Reuters', 'Associated Press', 'BBC News', 'The Guardian', 'NPR', 'CNN', 'The New York Times']
