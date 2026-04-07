import { RotateCcw } from 'lucide-react';
import {
  MediaFilters,
  DEFAULT_FILTERS,
  ContentType,
  CEFRLevel,
  TopicId,
  DurationRange,
  MediaSortOption,
  TOPIC_LABEL,
} from './mediaData';

interface MediaFiltersPanelProps {
  filters: MediaFilters;
  onChange: (f: MediaFilters) => void;
  onReset: () => void;
}

function FilterLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
      {children}
    </p>
  );
}

function FilterSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white/80 outline-none transition-colors focus:border-[#6b49db]/60 focus:bg-white/[0.06]"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value} className="bg-[#1a1c22] text-white">
          {opt.label}
        </option>
      ))}
    </select>
  );
}

const ALL_TOPICS: TopicId[] = ['daily_life', 'work', 'travel', 'study', 'culture', 'motivation', 'grammar'];

export function MediaFiltersPanel({ filters, onChange, onReset }: MediaFiltersPanelProps) {
  const set = <K extends keyof MediaFilters>(key: K, value: MediaFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const toggleTopic = (topic: TopicId) => {
    const current = filters.topics;
    set(
      'topics',
      current.includes(topic) ? current.filter((t) => t !== topic) : [...current, topic],
    );
  };

  const isDirty =
    filters.search !== DEFAULT_FILTERS.search ||
    filters.type !== DEFAULT_FILTERS.type ||
    filters.cefr !== DEFAULT_FILTERS.cefr ||
    filters.topics.length > 0 ||
    filters.duration !== DEFAULT_FILTERS.duration ||
    filters.sort !== DEFAULT_FILTERS.sort;

  return (
    <aside className="flex w-52 shrink-0 flex-col gap-5 overflow-y-auto border-r border-white/[0.06] bg-[#111318] px-3 py-4">
      {/* Search */}
      <div>
        <FilterLabel>Search</FilterLabel>
        <input
          type="text"
          placeholder="Title, channel…"
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          className="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[12px] text-white placeholder-white/25 outline-none transition-colors focus:border-[#6b49db]/60 focus:bg-white/[0.06]"
        />
      </div>

      {/* Type */}
      <div>
        <FilterLabel>Content type</FilterLabel>
        <FilterSelect<ContentType>
          value={filters.type}
          onChange={(v) => set('type', v)}
          options={[
            { value: 'all', label: 'All types' },
            { value: 'lesson', label: 'Lesson' },
            { value: 'interview', label: 'Interview' },
            { value: 'story', label: 'Story' },
            { value: 'vocabulary', label: 'Vocabulary' },
            { value: 'pronunciation', label: 'Pronunciation' },
            { value: 'listening', label: 'Listening' },
          ]}
        />
      </div>

      {/* CEFR */}
      <div>
        <FilterLabel>CEFR level</FilterLabel>
        <FilterSelect<CEFRLevel | 'all'>
          value={filters.cefr}
          onChange={(v) => set('cefr', v)}
          options={[
            { value: 'all', label: 'All levels' },
            { value: 'A1', label: 'A1 — Beginner' },
            { value: 'A2', label: 'A2 — Elementary' },
            { value: 'B1', label: 'B1 — Intermediate' },
            { value: 'B2', label: 'B2 — Upper-inter.' },
            { value: 'C1', label: 'C1 — Advanced' },
            { value: 'C2', label: 'C2 — Proficiency' },
          ]}
        />
      </div>

      {/* Topics */}
      <div>
        <FilterLabel>Topics</FilterLabel>
        <div className="flex flex-wrap gap-1.5">
          {ALL_TOPICS.map((topic) => {
            const active = filters.topics.includes(topic);
            return (
              <button
                key={topic}
                type="button"
                onClick={() => toggleTopic(topic)}
                className={[
                  'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  active
                    ? 'bg-[#6b49db]/25 text-[#a78ef0]'
                    : 'bg-white/[0.05] text-white/45 hover:bg-white/[0.08] hover:text-white/70',
                ].join(' ')}
              >
                {TOPIC_LABEL[topic]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Duration */}
      <div>
        <FilterLabel>Duration</FilterLabel>
        <FilterSelect<DurationRange>
          value={filters.duration}
          onChange={(v) => set('duration', v)}
          options={[
            { value: 'any', label: 'Any length' },
            { value: 'under5', label: 'Under 5 min' },
            { value: '5to10', label: '5–10 min' },
            { value: '10to20', label: '10–20 min' },
            { value: 'over20', label: '20+ min' },
          ]}
        />
      </div>

      {/* Sort */}
      <div>
        <FilterLabel>Sort by</FilterLabel>
        <FilterSelect<MediaSortOption>
          value={filters.sort}
          onChange={(v) => set('sort', v)}
          options={[
            { value: 'recommended', label: 'Recommended' },
            { value: 'newest', label: 'Newest' },
            { value: 'easiest', label: 'Easiest first' },
            { value: 'shortest', label: 'Shortest first' },
            { value: 'most_useful', label: 'Most useful' },
          ]}
        />
      </div>

      {/* Reset */}
      {isDirty && (
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 text-[11px] font-medium text-white/35 hover:text-white/60 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Reset filters
        </button>
      )}
    </aside>
  );
}
