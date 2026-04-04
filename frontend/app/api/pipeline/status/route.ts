import { NextResponse } from 'next/server'
import { getPipelineStatus } from '@/lib/pipeline'

export async function GET() {
  return NextResponse.json(await getPipelineStatus())
}
