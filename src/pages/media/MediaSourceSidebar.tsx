import { YOUTUBE_SOURCES, YouTubeSource } from './mediaData';

interface MediaSourceSidebarProps {
  selected: string | null;
  onSelect: (id: string | null) => void;
  counts: Record<string, number>;
  totalCount: number;
}

function SourceAvatar({ source }: { source: YouTubeSource }) {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
      style={{ backgroundColor: source.color }}
    >
      {source.initials}
    </span>
  );
}

export function MediaSourceSidebar({ selected, onSelect, counts, totalCount }: MediaSourceSidebarProps) {
  return (
    <aside className="flex w-44 shrink-0 flex-col overflow-y-auto border-r border-white/[0.06] bg-[#111318]">
      <div className="px-3 pb-1 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30">Channels</p>
      </div>

      <div className="flex-1 space-y-px px-2 py-2">
        {/* All channels */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={[
            'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors',
            selected === null
              ? 'bg-[#6b49db]/15 text-white'
              : 'text-white/55 hover:bg-white/[0.04] hover:text-white/80',
          ].join(' ')}
        >
          <span
            className={[
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
              selected === null ? 'bg-[#6b49db]/40 text-white' : 'bg-white/[0.06] text-white/40',
            ].join(' ')}
          >
            ALL
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium leading-tight">All channels</p>
            <p className="text-[10px] text-white/35">{totalCount}</p>
          </div>
        </button>

        <div className="my-2 border-t border-white/[0.05]" />

        {YOUTUBE_SOURCES.map((source) => {
          const count = counts[source.id] ?? 0;
          const isActive = selected === source.id;

          return (
            <button
              key={source.id}
              type="button"
              onClick={() => onSelect(isActive ? null : source.id)}
              className={[
                'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors',
                isActive
                  ? 'bg-[#6b49db]/15 text-white'
                  : 'text-white/55 hover:bg-white/[0.04] hover:text-white/80',
              ].join(' ')}
            >
              <SourceAvatar source={source} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium leading-tight">{source.name}</p>
                <p className={['text-[10px]', isActive ? 'text-white/45' : 'text-white/25'].join(' ')}>
                  {source.label} · {count}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ─── Mobile: horizontal chips ────────────────────────────────────────────────

export function MediaSourceChips({ selected, onSelect }: Pick<MediaSourceSidebarProps, 'selected' | 'onSelect'>) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 scrollbar-none border-b border-white/[0.06]">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={[
          'shrink-0 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors',
          selected === null
            ? 'bg-[#6b49db]/20 text-white'
            : 'bg-white/[0.05] text-white/50 hover:text-white/70',
        ].join(' ')}
      >
        All
      </button>
      {YOUTUBE_SOURCES.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(selected === s.id ? null : s.id)}
          className={[
            'shrink-0 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors',
            selected === s.id
              ? 'bg-[#6b49db]/20 text-white'
              : 'bg-white/[0.05] text-white/50 hover:text-white/70',
          ].join(' ')}
        >
          {s.name.split(' ')[0]}
        </button>
      ))}
    </div>
  );
}
