'use client'

import { CheckCircle, AlertCircle } from 'lucide-react'

export interface TrustStripProps {
  verificationStatus: 'verified' | 'pending' | 'unverified'
  sourceCount: number
  lastUpdated: string
  aiGenerated?: boolean
}

export function TrustStrip({
  verificationStatus,
  sourceCount,
  lastUpdated,
  aiGenerated = false,
}: TrustStripProps) {
  const statusConfig = {
    verified: {
      icon: CheckCircle,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-950',
      label: 'Verified',
    },
    pending: {
      icon: AlertCircle,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-950',
      label: 'Pending Review',
    },
    unverified: {
      icon: AlertCircle,
      color: 'text-slate-600 dark:text-slate-400',
      bg: 'bg-slate-50 dark:bg-slate-950',
      label: 'Unverified',
    },
  }

  const config = statusConfig[verificationStatus]
  const Icon = config.icon

  return (
    <div className={`rounded-lg ${config.bg} p-4 border border-border`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${config.color} flex-shrink-0 mt-0.5`} />
        <div className="flex-grow min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-semibold ${config.color}`}>
              {config.label}
            </span>
            {aiGenerated && (
              <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-full">
                AI-Generated
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground space-y-1">
            <p>{sourceCount} sources aggregated</p>
            <p>Last updated: {lastUpdated}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
