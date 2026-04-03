'use client'

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

interface AnalyticsStatsProps {
  stats: {
    label: string
    value: number | string
    change?: number
    icon?: React.ReactNode
  }[]
}

export function AnalyticsStats({ stats }: AnalyticsStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, idx) => (
        <div key={idx} className="bg-card rounded-lg border border-border p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {stat.value}
              </p>
              {stat.change !== undefined && (
                <p
                  className={`text-xs mt-2 ${
                    stat.change > 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {stat.change > 0 ? '+' : ''}{stat.change}% this week
                </p>
              )}
            </div>
            {stat.icon && <div className="text-muted-foreground">{stat.icon}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

interface ChartData {
  name: string
  value?: number
  verification?: number
  published?: number
  pending?: number
}

interface PerformanceChartsProps {
  verificationData: ChartData[]
  storyMetricsData: ChartData[]
  categoryData: ChartData[]
  qualityMetrics: Array<{
    label: string
    value: string
    status: 'good' | 'excellent'
  }>
}

export function PerformanceCharts({
  verificationData,
  storyMetricsData,
  categoryData,
  qualityMetrics,
}: PerformanceChartsProps) {
  const COLORS = [
    'hsl(var(--color-chart-1))',
    'hsl(var(--color-chart-2))',
    'hsl(var(--color-chart-3))',
    'hsl(var(--color-chart-4))',
    'hsl(var(--color-chart-5))',
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Verification Timeline */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Verification Timeline
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={verificationData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis stroke="var(--color-muted-foreground)" />
            <YAxis stroke="var(--color-muted-foreground)" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: '0.5rem',
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={{ fill: 'var(--color-primary)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Story Metrics */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Story Status Distribution
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={storyMetricsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis stroke="var(--color-muted-foreground)" />
            <YAxis stroke="var(--color-muted-foreground)" />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: '0.5rem',
              }}
            />
            <Legend />
            <Bar dataKey="published" fill="var(--color-primary)" />
            <Bar dataKey="pending" fill="var(--color-accent)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category Breakdown */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Stories by Category
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={categoryData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, value }) => `${name}: ${value}`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {categoryData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: '0.5rem',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Quality Metrics */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">
          Quality Metrics
        </h3>
        {qualityMetrics.length > 0 ? (
          <div className="space-y-4">
            {qualityMetrics.map((metric, idx) => (
              <div key={idx} className="pb-3 border-b border-border last:border-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-muted-foreground">
                    {metric.label}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      metric.status === 'excellent'
                        ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400'
                    }`}
                  >
                    {metric.status}
                  </span>
                </div>
                <p className="text-xl font-bold text-foreground">{metric.value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Quality metrics will appear after the first completed pipeline runs.
          </p>
        )}
      </div>
    </div>
  )
}
