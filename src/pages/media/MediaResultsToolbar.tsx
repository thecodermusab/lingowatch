import { LayoutGrid, List } from 'lucide-react';
import { MediaFilters, MediaSortOption, YOUTUBE_SOURCES } from './mediaData';

type ViewMode = 'grid' | 'list';

interface MediaResultsToolbarProps {
  count: number;
  total: number;
  sourceId: string | null;
  filters: MediaFilters;
  onSortChange: (sort: MediaSortOption) => void;
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
}

export type { ViewMode };

export function MediaResultsToolbar({
  count,
  total,
  sourceId,
  filters,
  onSortChange,
  viewMode,
  onViewModeChange,
}: MediaResultsToolbarProps) {
  const sourceName = sourceId
    ? YOUTUBE_SOURCES.find((s) => s.id === sourceId)?.name ?? sourceId
    : 'All channels';

  const hasFilters =
    filters.type !== 'all' ||
    filters.cefr !== 'all' ||
    filters.topics.length > 0 ||
    filters.duration !== 'any' ||
    filters.search;

  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-2.5">
      <div className="flex items-center gap-3">
        <p className="text-[12px] text-white/40">
          <span className="font-semibold text-white/70">{count}</span>{' '}
          {count === 1 ? 'result' : 'results'}
          {count < total && (
            <span className="ml-1 text-white/25">of {total}</span>
          )}
        </p>
        <span className="h-3 w-px bg-white/[0.08]" />
        <p className="text-[12px] text-white/35 truncate max-w-[200px]">
          {sourceName}
          {hasFilters && ' · filtered'}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={filters.sort}
          onChange={(e) => onSortChange(e.target.value as MediaSortOption)}
          className="rounded-md border border-white/[0.07] bg-white/[0.04] px-2 py-1 text-[11px] text-white/55 outline-none hover:text-white/70 focus:border-[#6b49db]/50"
        >
          <option value="recommended" className="bg-[#1a1c22]">Recommended</option>
          <option value="newest" className="bg-[#1a1c22]">Newest</option>
          <option value="easiest" className="bg-[#1a1c22]">Easiest first</option>
          <option value="shortest" className="bg-[#1a1c22]">Shortest first</option>
          <option value="most_useful" className="bg-[#1a1c22]">Most useful</option>
        </select>

        <div className="flex rounded-md border border-white/[0.07] overflow-hidden">
          <button
            type="button"
            onClick={() => onViewModeChange('list')}
            className={[
              'flex items-center justify-center px-2 py-1 transition-colors',
              viewMode === 'list' ? 'bg-white/[0.1] text-white' : 'text-white/30 hover:text-white/60',
            ].join(' ')}
            aria-label="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            className={[
              'flex items-center justify-center px-2 py-1 border-l border-white/[0.07] transition-colors',
              viewMode === 'grid' ? 'bg-white/[0.1] text-white' : 'text-white/30 hover:text-white/60',
            ].join(' ')}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
