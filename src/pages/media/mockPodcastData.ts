export interface PodcastChannel {
  id: string;
  title: string;
  color: string;
  initials: string;
  pinned?: boolean;
}

export interface PodcastEpisode {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  description: React.ReactNode | string;
  duration: string;
  publishedAgo: string;
  thumbnailColor: string;
  thumbnailText: string;
}

export const MOCK_PODCAST_CHANNELS: PodcastChannel[] = [
  { id: "c1", title: "All Ears English Podcast", color: "#eab308", initials: "AE", pinned: true },
  { id: "c2", title: "Speak English with...", color: "#22c55e", initials: "SE", pinned: true },
  { id: "c3", title: "Luke's ENGLISH Podcast", color: "#ffffff", initials: "LE", pinned: true },
  { id: "c4", title: "This American Life", color: "#ef4444", initials: "TA", pinned: true },
  { id: "c5", title: "The Joe Rogan Experience", color: "#450a0a", initials: "JR", pinned: true },
  { id: "c6", title: "In Our Time", color: "#ca8a04", initials: "IT", pinned: true },
  { id: "c7", title: "99% Invisible", color: "#171717", initials: "99", pinned: true },
  { id: "c8", title: "Stuff You Should Know", color: "#dc2626", initials: "SY", pinned: true },
  { id: "c9", title: "Radiolab", color: "#ea580c", initials: "RL", pinned: true },
  { id: "c10", title: "Freakonomics Radio", color: "#f97316", initials: "FR", pinned: true },
  { id: "c11", title: "TED Talks Daily", color: "#b91c1c", initials: "TD", pinned: true },
];

export const MOCK_PODCAST_EPISODES: PodcastEpisode[] = [
  {
    id: "e1",
    channelId: "npr_now",
    channelName: "NPR News Now",
    title: "NPR News: 04-07-2026 5PM EDT",
    description: "Wararka NPR: 04-07-2026 5pm EDT Si aad u maareyso dookha xayaysiisyada podcast-ka, dib u eeg xiriiriyeyaasha hoose: fiiri pcm.adswizz.com macluumaad ku saabsan ururintayada iyo isticmaalka xogta shakhsi ahaaneed ee kafaala-qaadka iyo si aad u maareyso dookha kafaala-qaadka podcast-kaaga. Siyaasadda asturnaanta ee NPR",
    duration: "4m 40s",
    publishedAgo: "about 2 hours ago",
    thumbnailColor: "#ffffff",
    thumbnailText: "npr"
  },
  {
    id: "e2",
    channelId: "npr_now",
    channelName: "NPR News Now",
    title: "NPR News: 04-07-2026 4PM EDT",
    description: "NPR wararka: 04-07-2026 4pm EDT Si aad u maamusho doorbidka xayeysiiska podcast-ka, fiiri xiriiriyeyaasha hoose: eeg pcm.adswizz.com macluumaad ku saabsan ururintayada iyo isticmaalka xogta shakhsiyeed ee kafaala-qaadka iyo si aad u maamusho doorbidkaaga kafaala-qaadka podcast-ka. Siyaasadda asturnaanta NPR",
    duration: "4m 40s",
    publishedAgo: "about 3 hours ago",
    thumbnailColor: "#ffffff",
    thumbnailText: "npr"
  },
  {
    id: "e3",
    channelId: "npr_politics",
    channelName: "The NPR Politics Podcast",
    title: "Voters decide whether Virginia enters redistricting fight",
    description: "This episode of the NPR Politics Podcast discusses Virginia's special election on April 21st, which will determine if the state redraws its congressional districts to benefit Democrats. It explores how this fits into the national trend of mid-decade redistricting and gathers the perspectives of Virginians on the issue.",
    duration: "18m 8s",
    publishedAgo: "about 3 hours ago",
    thumbnailColor: "#e2e8f0",
    thumbnailText: "VOTE"
  }
];
