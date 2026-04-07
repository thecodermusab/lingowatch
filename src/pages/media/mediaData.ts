// ─── Types ───────────────────────────────────────────────────────────────────

export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type ContentType = 'all' | 'lesson' | 'interview' | 'story' | 'vocabulary' | 'pronunciation' | 'listening';
export type DurationRange = 'any' | 'under5' | '5to10' | '10to20' | 'over20';
export type MediaSortOption = 'recommended' | 'newest' | 'easiest' | 'shortest' | 'most_useful';
export type TopicId = 'daily_life' | 'work' | 'travel' | 'study' | 'culture' | 'motivation' | 'grammar';
export type MediaTabId = 'youtube' | 'netflix' | 'books' | 'podcasts' | 'my_texts';

export interface YouTubeItem {
  id: string;
  title: string;
  sourceId: string;
  sourceLabel: string;
  description: string;
  thumbnailColor: string;
  type: Exclude<ContentType, 'all'>;
  cefr: CEFRLevel;
  topics: TopicId[];
  durationMinutes: number;
  usefulWordsCount: number;
  learningValue: number; // 1–5
  difficultyScore: number; // 1–10
  isSaved: boolean;
  publishedAt: string;
}

export interface YouTubeSource {
  id: string;
  name: string;
  label: string;
  initials: string;
  color: string;
}

export interface MediaFilters {
  search: string;
  type: ContentType;
  cefr: CEFRLevel | 'all';
  topics: TopicId[];
  duration: DurationRange;
  sort: MediaSortOption;
}

// ─── Tab config ──────────────────────────────────────────────────────────────

export const MEDIA_TABS: Array<{ id: MediaTabId; label: string; available: boolean }> = [
  { id: 'youtube',   label: 'YouTube',   available: true  },
  { id: 'netflix',   label: 'Netflix',   available: false },
  { id: 'books',     label: 'Books',     available: true  },
  { id: 'podcasts',  label: 'Podcasts',  available: false },
  { id: 'my_texts',  label: 'My texts',  available: false },
];

// ─── Sources ─────────────────────────────────────────────────────────────────

export const YOUTUBE_SOURCES: YouTubeSource[] = [
  { id: 'ted_ed',        name: 'TED-Ed',                         label: 'Education',        initials: 'TE', color: '#c0392b' },
  { id: 'bbc',           name: 'BBC Learning English',           label: 'British English',  initials: 'BB', color: '#c0392b' },
  { id: 'rachels',       name: "Rachel's English",               label: 'Pronunciation',    initials: 'RE', color: '#2c6fad' },
  { id: 'lucy',          name: 'English With Lucy',              label: 'General English',  initials: 'EL', color: '#7b5ea7' },
  { id: 'vanessa',       name: 'Speak English With Vanessa',     label: 'Daily English',    initials: 'SV', color: '#c96a28' },
  { id: 'easy_english',  name: 'Easy English',                   label: 'Street Interviews',initials: 'EE', color: '#1f8c5a' },
  { id: 'addict',        name: 'English Addict',                 label: 'Listening',        initials: 'EA', color: '#b7860c' },
  { id: 'tv_series',     name: 'Learn English with TV Series',   label: 'Pop Culture',      initials: 'TS', color: '#2057a7' },
  { id: 'voa',           name: 'VOA Learning English',           label: 'News English',     initials: 'VA', color: '#1a6b96' },
  { id: 'reallife',      name: 'RealLife English',               label: 'Conversational',   initials: 'RL', color: '#4d7a34' },
];

// ─── Mock items ───────────────────────────────────────────────────────────────

export const YOUTUBE_ITEMS: YouTubeItem[] = [
  {
    id: 'yt1',
    title: 'How to Sound More Natural When Speaking English',
    sourceId: 'rachels',
    sourceLabel: "Rachel's English",
    description: 'Learn the natural rhythm and intonation patterns native speakers use. Covers linking sounds, reductions, and stress with clear examples you can practise immediately.',
    thumbnailColor: '#2c6fad',
    type: 'pronunciation',
    cefr: 'B1',
    topics: ['daily_life', 'study'],
    durationMinutes: 12,
    usefulWordsCount: 24,
    learningValue: 5,
    difficultyScore: 5,
    isSaved: false,
    publishedAt: '2024-03-15',
  },
  {
    id: 'yt2',
    title: '10 English Phrases You Need for Work Emails',
    sourceId: 'lucy',
    sourceLabel: 'English With Lucy',
    description: 'Professional phrases for writing clear, polite, and effective emails. Covers openers, requests, follow-ups, and closings used in real office environments.',
    thumbnailColor: '#7b5ea7',
    type: 'vocabulary',
    cefr: 'B2',
    topics: ['work', 'study'],
    durationMinutes: 9,
    usefulWordsCount: 31,
    learningValue: 5,
    difficultyScore: 6,
    isSaved: true,
    publishedAt: '2024-04-02',
  },
  {
    id: 'yt3',
    title: 'How Language Changes the Way We Think',
    sourceId: 'ted_ed',
    sourceLabel: 'TED-Ed',
    description: 'A fascinating look at how the language you speak shapes the way you perceive time, colour, and direction. Great for building sophisticated vocabulary.',
    thumbnailColor: '#c0392b',
    type: 'lesson',
    cefr: 'C1',
    topics: ['culture', 'study'],
    durationMinutes: 5,
    usefulWordsCount: 42,
    learningValue: 4,
    difficultyScore: 8,
    isSaved: false,
    publishedAt: '2024-01-20',
  },
  {
    id: 'yt4',
    title: 'Real Street Conversations in London',
    sourceId: 'easy_english',
    sourceLabel: 'Easy English',
    description: 'Unscripted interviews with people on the streets of London. Real accents, natural pacing, and everyday topics — perfect for training your ear.',
    thumbnailColor: '#1f8c5a',
    type: 'interview',
    cefr: 'B1',
    topics: ['daily_life', 'culture'],
    durationMinutes: 7,
    usefulWordsCount: 18,
    learningValue: 4,
    difficultyScore: 5,
    isSaved: false,
    publishedAt: '2024-05-10',
  },
  {
    id: 'yt5',
    title: 'The T Sound: American English Pronunciation Guide',
    sourceId: 'rachels',
    sourceLabel: "Rachel's English",
    description: 'A deep dive into the flap T, stop T, and nasal T sounds that define American English. Includes mouth-position diagrams and minimal pair drills.',
    thumbnailColor: '#2c6fad',
    type: 'pronunciation',
    cefr: 'A2',
    topics: ['study'],
    durationMinutes: 14,
    usefulWordsCount: 12,
    learningValue: 4,
    difficultyScore: 3,
    isSaved: false,
    publishedAt: '2024-02-28',
  },
  {
    id: 'yt6',
    title: 'BBC News English: How to Understand the Presenter',
    sourceId: 'bbc',
    sourceLabel: 'BBC Learning English',
    description: 'Transcribed BBC news clips broken down sentence by sentence. Focuses on journalistic vocabulary and formal grammar in context.',
    thumbnailColor: '#c0392b',
    type: 'listening',
    cefr: 'B2',
    topics: ['culture', 'grammar'],
    durationMinutes: 11,
    usefulWordsCount: 37,
    learningValue: 5,
    difficultyScore: 7,
    isSaved: true,
    publishedAt: '2024-04-18',
  },
  {
    id: 'yt7',
    title: 'Friends Scene Analysis: How Americans Really Talk',
    sourceId: 'tv_series',
    sourceLabel: 'Learn English with TV Series',
    description: 'Freeze-frame breakdowns of iconic Friends scenes. Covers slang, contractions, humour, and casual speech patterns that textbooks never teach.',
    thumbnailColor: '#2057a7',
    type: 'story',
    cefr: 'B1',
    topics: ['daily_life', 'culture', 'grammar'],
    durationMinutes: 18,
    usefulWordsCount: 29,
    learningValue: 5,
    difficultyScore: 5,
    isSaved: false,
    publishedAt: '2024-03-05',
  },
  {
    id: 'yt8',
    title: 'VOA Special English: Technology News for Learners',
    sourceId: 'voa',
    sourceLabel: 'VOA Learning English',
    description: 'Slow-paced news broadcast about the latest in tech, read with simplified vocabulary. Excellent for intermediate learners building news comprehension.',
    thumbnailColor: '#1a6b96',
    type: 'listening',
    cefr: 'A2',
    topics: ['study', 'work'],
    durationMinutes: 6,
    usefulWordsCount: 22,
    learningValue: 3,
    difficultyScore: 3,
    isSaved: false,
    publishedAt: '2024-05-22',
  },
  {
    id: 'yt9',
    title: 'English Phrasal Verbs for Everyday Life',
    sourceId: 'vanessa',
    sourceLabel: 'Speak English With Vanessa',
    description: 'Twenty essential phrasal verbs used constantly in conversation. Each one is shown in multiple sentences so the meaning becomes intuitive, not memorised.',
    thumbnailColor: '#c96a28',
    type: 'vocabulary',
    cefr: 'B1',
    topics: ['daily_life', 'grammar'],
    durationMinutes: 16,
    usefulWordsCount: 40,
    learningValue: 5,
    difficultyScore: 5,
    isSaved: false,
    publishedAt: '2024-01-30',
  },
  {
    id: 'yt10',
    title: 'How to Argue Politely in English',
    sourceId: 'lucy',
    sourceLabel: 'English With Lucy',
    description: 'Phrases and strategies for disagreeing, pushing back, and expressing strong opinions without sounding rude. Includes role-play examples.',
    thumbnailColor: '#7b5ea7',
    type: 'lesson',
    cefr: 'B2',
    topics: ['work', 'daily_life'],
    durationMinutes: 13,
    usefulWordsCount: 28,
    learningValue: 4,
    difficultyScore: 6,
    isSaved: false,
    publishedAt: '2024-03-28',
  },
  {
    id: 'yt11',
    title: 'English Idioms You Will Actually Hear in 2024',
    sourceId: 'addict',
    sourceLabel: 'English Addict',
    description: 'A live-style lesson covering idioms that pop up in podcasts, YouTube, and daily conversation right now. Updated annually to stay current.',
    thumbnailColor: '#b7860c',
    type: 'vocabulary',
    cefr: 'B1',
    topics: ['daily_life', 'culture'],
    durationMinutes: 22,
    usefulWordsCount: 35,
    learningValue: 4,
    difficultyScore: 5,
    isSaved: false,
    publishedAt: '2024-06-01',
  },
  {
    id: 'yt12',
    title: 'English at the Airport: Full Listening Practice',
    sourceId: 'voa',
    sourceLabel: 'VOA Learning English',
    description: 'Simulated airport announcements, check-in dialogues, and immigration interviews with subtitles. Great for travel preparation and listening confidence.',
    thumbnailColor: '#1a6b96',
    type: 'listening',
    cefr: 'A1',
    topics: ['travel', 'daily_life'],
    durationMinutes: 8,
    usefulWordsCount: 16,
    learningValue: 3,
    difficultyScore: 2,
    isSaved: false,
    publishedAt: '2023-12-11',
  },
  {
    id: 'yt13',
    title: 'Advanced Grammar: Inversion for Emphasis',
    sourceId: 'bbc',
    sourceLabel: 'BBC Learning English',
    description: 'How native speakers use inverted sentence structures to add drama and emphasis. Includes formal and informal examples from real British speech.',
    thumbnailColor: '#c0392b',
    type: 'lesson',
    cefr: 'C1',
    topics: ['grammar', 'study'],
    durationMinutes: 10,
    usefulWordsCount: 19,
    learningValue: 4,
    difficultyScore: 9,
    isSaved: true,
    publishedAt: '2024-02-14',
  },
  {
    id: 'yt14',
    title: 'The Science of Motivation: English for Learners',
    sourceId: 'ted_ed',
    sourceLabel: 'TED-Ed',
    description: 'A TED-Ed animation about what keeps humans motivated. Dense but rewarding vocabulary drawn from psychology and self-help discourse.',
    thumbnailColor: '#c0392b',
    type: 'story',
    cefr: 'B2',
    topics: ['motivation', 'study'],
    durationMinutes: 5,
    usefulWordsCount: 33,
    learningValue: 4,
    difficultyScore: 7,
    isSaved: false,
    publishedAt: '2024-04-10',
  },
  {
    id: 'yt15',
    title: 'Real English Conversations: Coffee Shop Edition',
    sourceId: 'reallife',
    sourceLabel: 'RealLife English',
    description: 'Two native speakers have a completely unscripted conversation at a coffee shop. Includes a full transcript and vocabulary breakdown in the description.',
    thumbnailColor: '#4d7a34',
    type: 'interview',
    cefr: 'B1',
    topics: ['daily_life', 'culture'],
    durationMinutes: 20,
    usefulWordsCount: 26,
    learningValue: 5,
    difficultyScore: 5,
    isSaved: false,
    publishedAt: '2024-05-05',
  },
  {
    id: 'yt16',
    title: 'Talking About Your Job in English: Key Vocabulary',
    sourceId: 'vanessa',
    sourceLabel: 'Speak English With Vanessa',
    description: 'Essential vocabulary and phrases for describing your job, responsibilities, and workplace in English. Useful for interviews, networking, and small talk.',
    thumbnailColor: '#c96a28',
    type: 'vocabulary',
    cefr: 'A2',
    topics: ['work', 'daily_life'],
    durationMinutes: 11,
    usefulWordsCount: 30,
    learningValue: 4,
    difficultyScore: 3,
    isSaved: false,
    publishedAt: '2024-03-20',
  },
];

// ─── Filter defaults ──────────────────────────────────────────────────────────

export const DEFAULT_FILTERS: MediaFilters = {
  search: '',
  type: 'all',
  cefr: 'all',
  topics: [],
  duration: 'any',
  sort: 'recommended',
};

// ─── Filter helpers ───────────────────────────────────────────────────────────

export function applyFilters(
  items: YouTubeItem[],
  filters: MediaFilters,
  sourceId: string | null,
): YouTubeItem[] {
  let result = [...items];

  if (sourceId) result = result.filter((i) => i.sourceId === sourceId);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (i) =>
        i.title.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.sourceLabel.toLowerCase().includes(q),
    );
  }
  if (filters.type !== 'all') result = result.filter((i) => i.type === filters.type);
  if (filters.cefr !== 'all') result = result.filter((i) => i.cefr === filters.cefr);
  if (filters.topics.length > 0)
    result = result.filter((i) => filters.topics.every((t) => i.topics.includes(t)));
  if (filters.duration !== 'any') {
    result = result.filter((i) => {
      if (filters.duration === 'under5') return i.durationMinutes < 5;
      if (filters.duration === '5to10') return i.durationMinutes >= 5 && i.durationMinutes <= 10;
      if (filters.duration === '10to20') return i.durationMinutes > 10 && i.durationMinutes <= 20;
      if (filters.duration === 'over20') return i.durationMinutes > 20;
      return true;
    });
  }

  result.sort((a, b) => {
    if (filters.sort === 'newest')
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    if (filters.sort === 'easiest') return a.difficultyScore - b.difficultyScore;
    if (filters.sort === 'shortest') return a.durationMinutes - b.durationMinutes;
    if (filters.sort === 'most_useful') return b.usefulWordsCount - a.usefulWordsCount;
    // recommended: learningValue desc, then difficultyScore ascending
    if (b.learningValue !== a.learningValue) return b.learningValue - a.learningValue;
    return a.difficultyScore - b.difficultyScore;
  });

  return result;
}

// ─── Label maps ──────────────────────────────────────────────────────────────

export const CEFR_LABEL: Record<CEFRLevel, string> = {
  A1: 'A1', A2: 'A2', B1: 'B1', B2: 'B2', C1: 'C1', C2: 'C2',
};

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  all: 'All types', lesson: 'Lesson', interview: 'Interview',
  story: 'Story', vocabulary: 'Vocabulary', pronunciation: 'Pronunciation', listening: 'Listening',
};

export const TOPIC_LABEL: Record<TopicId, string> = {
  daily_life: 'Daily life', work: 'Work', travel: 'Travel',
  study: 'Study', culture: 'Culture', motivation: 'Motivation', grammar: 'Grammar',
};

export const DURATION_LABEL: Record<DurationRange, string> = {
  any: 'Any length', under5: 'Under 5 min', '5to10': '5–10 min',
  '10to20': '10–20 min', over20: '20+ min',
};

export const SORT_LABEL: Record<MediaSortOption, string> = {
  recommended: 'Recommended', newest: 'Newest', easiest: 'Easiest first',
  shortest: 'Shortest first', most_useful: 'Most useful',
};
