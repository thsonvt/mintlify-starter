import { useState, useEffect } from 'react';
import { getApiClient } from '../api';
import type { ContentGap, GapsResponse, DiátaxisType } from '../types';

interface GapDashboardProps {
  apiUrl?: string;
}

const DIATAXIS_TYPES: DiátaxisType[] = ['tutorial', 'how-to', 'reference', 'explanation'];

const DIATAXIS_DESCRIPTIONS: Record<DiátaxisType, string> = {
  tutorial: 'Learning-oriented, hands-on lessons',
  'how-to': 'Task-oriented, problem-solving guides',
  reference: 'Information-oriented, technical specs',
  explanation: 'Understanding-oriented, conceptual content',
};

export function GapDashboard({ apiUrl }: GapDashboardProps) {
  const [data, setData] = useState<GapsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'total' | 'gaps'>('total');

  const api = getApiClient(apiUrl);

  useEffect(() => {
    api.getGaps()
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load gaps'))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="tl-widget flex items-center justify-center py-12">
        <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tl-widget p-4 bg-red-50 text-red-700 rounded-lg">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const sortedGaps = [...data.gaps].sort((a, b) => {
    if (sortBy === 'gaps') {
      const aGaps = DIATAXIS_TYPES.filter(t => a[t] === 0).length;
      const bGaps = DIATAXIS_TYPES.filter(t => b[t] === 0).length;
      return bGaps - aGaps;
    }
    return b.total - a.total;
  });

  return (
    <div className="tl-widget space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Articles"
          value={data.summary.total_articles}
          color="blue"
        />
        <StatCard
          label="Topics Covered"
          value={data.summary.total_topics}
          color="green"
        />
        <StatCard
          label="Gaps Identified"
          value={data.summary.gaps_identified}
          color="amber"
          subtitle="Topics missing content types"
        />
        <StatCard
          label="Reference Docs"
          value={data.summary.by_type.reference}
          color={data.summary.by_type.reference === 0 ? 'red' : 'purple'}
          subtitle={data.summary.by_type.reference === 0 ? 'Opportunity!' : ''}
        />
      </div>

      {/* Diátaxis Type Legend */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 mb-3">
          Diátaxis Content Types
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {DIATAXIS_TYPES.map(type => (
            <div key={type} className="text-sm">
              <span className={`tl-diataxis-badge tl-diataxis-${type}`}>
                {type}
              </span>
              <p className="text-gray-500 text-xs mt-1">
                {DIATAXIS_DESCRIPTIONS[type]}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Sort Controls */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900">
          Content Coverage Matrix
        </h3>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Sort by:</span>
          <button
            onClick={() => setSortBy('total')}
            className={`px-2 py-1 rounded ${
              sortBy === 'total' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Coverage
          </button>
          <button
            onClick={() => setSortBy('gaps')}
            className={`px-2 py-1 rounded ${
              sortBy === 'gaps' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Gaps
          </button>
        </div>
      </div>

      {/* Gap Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 font-medium text-gray-700">
                Topic
              </th>
              {DIATAXIS_TYPES.map(type => (
                <th key={type} className="px-2 py-2 text-center font-medium text-gray-700">
                  <span className={`tl-diataxis-badge tl-diataxis-${type}`}>
                    {type}
                  </span>
                </th>
              ))}
              <th className="pl-4 py-2 text-right font-medium text-gray-700">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedGaps.map((gap) => (
              <GapRow key={gap.topic} gap={gap} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Suggestions */}
      <div className="p-4 bg-blue-50 rounded-lg">
        <h3 className="text-sm font-medium text-blue-900 mb-2">
          Suggested Next Content
        </h3>
        <ul className="space-y-2 text-sm text-blue-800">
          {getContentSuggestions(data.gaps).map((suggestion, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-blue-500">→</span>
              {suggestion}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  subtitle,
}: {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'amber' | 'red' | 'purple';
  subtitle?: string;
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
  };

  return (
    <div className={`p-4 rounded-lg ${colorClasses[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm opacity-80">{label}</p>
      {subtitle && <p className="text-xs opacity-60 mt-1">{subtitle}</p>}
    </div>
  );
}

function GapRow({ gap }: { gap: ContentGap }) {
  const hasGaps = DIATAXIS_TYPES.some(t => gap[t] === 0);

  return (
    <tr className={`border-b ${hasGaps ? 'bg-amber-50/50' : ''}`}>
      <td className="py-3 pr-4 font-medium text-gray-900">
        {gap.topic}
        {hasGaps && (
          <span className="ml-2 text-xs text-amber-600">⚠ gaps</span>
        )}
      </td>
      {DIATAXIS_TYPES.map(type => (
        <td key={type} className="px-2 py-3 text-center">
          <GapCell count={gap[type]} />
        </td>
      ))}
      <td className="pl-4 py-3 text-right text-gray-600">
        {gap.total}
      </td>
    </tr>
  );
}

function GapCell({ count }: { count: number }) {
  let className = 'tl-gap-cell ';
  if (count === 0) className += 'tl-gap-zero';
  else if (count <= 2) className += 'tl-gap-low';
  else if (count <= 5) className += 'tl-gap-medium';
  else className += 'tl-gap-high';

  return (
    <span className={className}>
      {count}
    </span>
  );
}

function getContentSuggestions(gaps: ContentGap[]): string[] {
  const suggestions: string[] = [];

  // Find topics with highest coverage but missing types
  for (const gap of gaps.slice(0, 5)) {
    if (gap.reference === 0 && gap.total >= 3) {
      suggestions.push(`Write a reference doc for "${gap.topic}" — you have ${gap.total} articles as source material`);
    }
    if (gap['how-to'] === 0 && gap.explanation >= 2) {
      suggestions.push(`Create a how-to guide for "${gap.topic}" — convert explanations into actionable steps`);
    }
    if (gap.tutorial === 0 && gap.total >= 4) {
      suggestions.push(`Build a tutorial for "${gap.topic}" — strong coverage suggests reader interest`);
    }
  }

  // Check for completely missing reference docs
  const hasAnyReference = gaps.some(g => g.reference > 0);
  if (!hasAnyReference) {
    suggestions.unshift('Consider adding reference documentation — none exist yet across all topics');
  }

  return suggestions.slice(0, 4);
}

export default GapDashboard;
