import { DifficultyLevel, PhraseType } from "@/types";

export interface PhraseBankEntry {
  phraseText: string;
  phraseType: PhraseType;
  category: string;
  difficultyLevel: DifficultyLevel;
  isCommon?: boolean;
  sourceMeaning?: string;
  sourceExample?: string;
  source?: string;
}

export const phraseBank: PhraseBankEntry[] = [
  { phraseText: "break the ice", phraseType: "idiom", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "hit the road", phraseType: "idiom", category: "Travel", difficultyLevel: "beginner" },
  { phraseText: "call it a day", phraseType: "idiom", category: "Work", difficultyLevel: "beginner" },
  { phraseText: "piece of cake", phraseType: "idiom", category: "Daily Life", difficultyLevel: "beginner" },
  { phraseText: "under the weather", phraseType: "idiom", category: "Health", difficultyLevel: "beginner" },
  { phraseText: "once in a blue moon", phraseType: "idiom", category: "Daily Life", difficultyLevel: "intermediate" },
  { phraseText: "cost an arm and a leg", phraseType: "idiom", category: "Business", difficultyLevel: "intermediate" },
  { phraseText: "spill the beans", phraseType: "idiom", category: "Social", difficultyLevel: "intermediate" },
  { phraseText: "on the same page", phraseType: "idiom", category: "Work", difficultyLevel: "intermediate" },
  { phraseText: "hit the nail on the head", phraseType: "idiom", category: "Learning", difficultyLevel: "intermediate" },
  { phraseText: "go the extra mile", phraseType: "idiom", category: "Work", difficultyLevel: "intermediate" },
  { phraseText: "bite the bullet", phraseType: "idiom", category: "Emotions", difficultyLevel: "intermediate" },
  { phraseText: "a blessing in disguise", phraseType: "idiom", category: "Emotions", difficultyLevel: "advanced" },
  { phraseText: "burn the midnight oil", phraseType: "idiom", category: "Work", difficultyLevel: "advanced" },
  { phraseText: "the ball is in your court", phraseType: "idiom", category: "Business", difficultyLevel: "advanced" },
  { phraseText: "let the cat out of the bag", phraseType: "idiom", category: "Social", difficultyLevel: "advanced" },
  { phraseText: "get the hang of", phraseType: "phrasal_verb", category: "Learning", difficultyLevel: "beginner" },
  { phraseText: "pick up", phraseType: "phrasal_verb", category: "Learning", difficultyLevel: "beginner" },
  { phraseText: "figure out", phraseType: "phrasal_verb", category: "Learning", difficultyLevel: "beginner" },
  { phraseText: "wake up", phraseType: "phrasal_verb", category: "Daily Life", difficultyLevel: "beginner" },
  { phraseText: "sit down", phraseType: "phrasal_verb", category: "Daily Life", difficultyLevel: "beginner" },
  { phraseText: "look for", phraseType: "phrasal_verb", category: "Daily Life", difficultyLevel: "beginner" },
  { phraseText: "turn on", phraseType: "phrasal_verb", category: "Technology", difficultyLevel: "beginner" },
  { phraseText: "turn off", phraseType: "phrasal_verb", category: "Technology", difficultyLevel: "beginner" },
  { phraseText: "run into", phraseType: "phrasal_verb", category: "Social", difficultyLevel: "intermediate" },
  { phraseText: "come up with", phraseType: "phrasal_verb", category: "Work", difficultyLevel: "intermediate" },
  { phraseText: "carry on", phraseType: "phrasal_verb", category: "Daily Life", difficultyLevel: "intermediate" },
  { phraseText: "back up", phraseType: "phrasal_verb", category: "Technology", difficultyLevel: "intermediate" },
  { phraseText: "work out", phraseType: "phrasal_verb", category: "Health", difficultyLevel: "intermediate" },
  { phraseText: "cut down on", phraseType: "phrasal_verb", category: "Health", difficultyLevel: "intermediate" },
  { phraseText: "throttle down", phraseType: "phrasal_verb", category: "Technology", difficultyLevel: "intermediate" },
  { phraseText: "keep up with", phraseType: "phrasal_verb", category: "Learning", difficultyLevel: "advanced" },
  { phraseText: "brush up on", phraseType: "phrasal_verb", category: "Learning", difficultyLevel: "advanced" },
  { phraseText: "phase out", phraseType: "phrasal_verb", category: "Business", difficultyLevel: "advanced" },
  { phraseText: "zero in on", phraseType: "phrasal_verb", category: "Work", difficultyLevel: "advanced" },
  { phraseText: "iron out", phraseType: "phrasal_verb", category: "Work", difficultyLevel: "advanced" },
  { phraseText: "touch base", phraseType: "expression", category: "Work", difficultyLevel: "intermediate" },
  { phraseText: "for the time being", phraseType: "expression", category: "Daily Life", difficultyLevel: "intermediate" },
  { phraseText: "at the end of the day", phraseType: "expression", category: "Work", difficultyLevel: "intermediate" },
  { phraseText: "in no time", phraseType: "expression", category: "Daily Life", difficultyLevel: "beginner" },
  { phraseText: "to be honest", phraseType: "expression", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "fair enough", phraseType: "expression", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "no worries", phraseType: "expression", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "that makes sense", phraseType: "expression", category: "Learning", difficultyLevel: "beginner" },
  { phraseText: "I am just kidding", phraseType: "expression", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "on purpose", phraseType: "expression", category: "Daily Life", difficultyLevel: "beginner" },
  { phraseText: "in the long run", phraseType: "expression", category: "Business", difficultyLevel: "intermediate" },
  { phraseText: "from scratch", phraseType: "expression", category: "Learning", difficultyLevel: "intermediate" },
  { phraseText: "all of a sudden", phraseType: "expression", category: "Daily Life", difficultyLevel: "intermediate" },
  { phraseText: "by the way", phraseType: "expression", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "keep in mind", phraseType: "expression", category: "Learning", difficultyLevel: "intermediate" },
  { phraseText: "make up your mind", phraseType: "expression", category: "Emotions", difficultyLevel: "intermediate" },
  { phraseText: "take your time", phraseType: "expression", category: "Daily Life", difficultyLevel: "beginner" },
  { phraseText: "state of mind", phraseType: "phrase", category: "Emotions", difficultyLevel: "advanced" },
  { phraseText: "learning curve", phraseType: "phrase", category: "Learning", difficultyLevel: "intermediate" },
  { phraseText: "job satisfaction", phraseType: "phrase", category: "Work", difficultyLevel: "intermediate" },
  { phraseText: "traffic jam", phraseType: "phrase", category: "Travel", difficultyLevel: "beginner" },
  { phraseText: "strong opinion", phraseType: "phrase", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "daily routine", phraseType: "phrase", category: "Daily Life", difficultyLevel: "beginner" },
  { phraseText: "public speaking", phraseType: "phrase", category: "Learning", difficultyLevel: "intermediate" },
  { phraseText: "time management", phraseType: "phrase", category: "Work", difficultyLevel: "intermediate" },
  { phraseText: "critical thinking", phraseType: "phrase", category: "Learning", difficultyLevel: "advanced" },
  { phraseText: "healthy habit", phraseType: "phrase", category: "Health", difficultyLevel: "beginner" },
  { phraseText: "deadline", phraseType: "word", category: "Work", difficultyLevel: "beginner" },
  { phraseText: "mindset", phraseType: "word", category: "Emotions", difficultyLevel: "intermediate" },
  { phraseText: "resilient", phraseType: "word", category: "Emotions", difficultyLevel: "advanced" },
  { phraseText: "efficient", phraseType: "word", category: "Work", difficultyLevel: "intermediate" },
  { phraseText: "awkward", phraseType: "word", category: "Social", difficultyLevel: "intermediate" },
  { phraseText: "reliable", phraseType: "word", category: "Work", difficultyLevel: "beginner" },
  { phraseText: "curious", phraseType: "word", category: "Learning", difficultyLevel: "beginner" },
  { phraseText: "overwhelmed", phraseType: "word", category: "Emotions", difficultyLevel: "intermediate" },
  { phraseText: "hesitate", phraseType: "word", category: "Emotions", difficultyLevel: "intermediate" },
  { phraseText: "thorough", phraseType: "word", category: "Work", difficultyLevel: "advanced" },
  { phraseText: "keep an eye on", phraseType: "idiom", category: "Daily Life", difficultyLevel: "intermediate" },
  { phraseText: "miss the boat", phraseType: "idiom", category: "Business", difficultyLevel: "advanced" },
  { phraseText: "on cloud nine", phraseType: "idiom", category: "Emotions", difficultyLevel: "intermediate" },
  { phraseText: "pull yourself together", phraseType: "idiom", category: "Emotions", difficultyLevel: "advanced" },
  { phraseText: "wrap your head around", phraseType: "idiom", category: "Learning", difficultyLevel: "advanced" },
  { phraseText: "read between the lines", phraseType: "idiom", category: "Learning", difficultyLevel: "advanced" },
  { phraseText: "get out of hand", phraseType: "idiom", category: "Daily Life", difficultyLevel: "intermediate" },
  { phraseText: "keep your cool", phraseType: "idiom", category: "Emotions", difficultyLevel: "intermediate" },
  { phraseText: "see eye to eye", phraseType: "idiom", category: "Social", difficultyLevel: "advanced" },
  { phraseText: "go with the flow", phraseType: "idiom", category: "Daily Life", difficultyLevel: "intermediate" },
  { phraseText: "show up", phraseType: "phrasal_verb", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "find out", phraseType: "phrasal_verb", category: "Learning", difficultyLevel: "beginner" },
  { phraseText: "slow down", phraseType: "phrasal_verb", category: "Health", difficultyLevel: "beginner" },
  { phraseText: "drop off", phraseType: "phrasal_verb", category: "Travel", difficultyLevel: "intermediate" },
  { phraseText: "check in", phraseType: "phrasal_verb", category: "Travel", difficultyLevel: "beginner" },
  { phraseText: "sort out", phraseType: "phrasal_verb", category: "Work", difficultyLevel: "intermediate" },
  { phraseText: "point out", phraseType: "phrasal_verb", category: "Learning", difficultyLevel: "beginner" },
  { phraseText: "hold on", phraseType: "phrasal_verb", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "step down", phraseType: "phrasal_verb", category: "Work", difficultyLevel: "advanced" },
  { phraseText: "follow through", phraseType: "phrasal_verb", category: "Work", difficultyLevel: "advanced" },
  { phraseText: "as soon as possible", phraseType: "expression", category: "Work", difficultyLevel: "beginner" },
  { phraseText: "for good", phraseType: "expression", category: "Daily Life", difficultyLevel: "intermediate" },
  { phraseText: "so far so good", phraseType: "expression", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "to some extent", phraseType: "expression", category: "Learning", difficultyLevel: "advanced" },
  { phraseText: "in charge of", phraseType: "expression", category: "Work", difficultyLevel: "intermediate" },
  { phraseText: "out of nowhere", phraseType: "expression", category: "Daily Life", difficultyLevel: "intermediate" },
  { phraseText: "on average", phraseType: "expression", category: "Business", difficultyLevel: "intermediate" },
  { phraseText: "first impression", phraseType: "phrase", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "body language", phraseType: "phrase", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "side effect", phraseType: "phrase", category: "Health", difficultyLevel: "intermediate" },
  { phraseText: "long story short", phraseType: "phrase", category: "Social", difficultyLevel: "intermediate" },
  { phraseText: "sense of humor", phraseType: "phrase", category: "Social", difficultyLevel: "beginner" },
  { phraseText: "work-life balance", phraseType: "phrase", category: "Health", difficultyLevel: "advanced" },
  { phraseText: "customer feedback", phraseType: "phrase", category: "Business", difficultyLevel: "intermediate" },
  { phraseText: "self-discipline", phraseType: "word", category: "Learning", difficultyLevel: "advanced" },
  { phraseText: "confident", phraseType: "word", category: "Emotions", difficultyLevel: "beginner" },
  { phraseText: "flexible", phraseType: "word", category: "Work", difficultyLevel: "intermediate" },
  { phraseText: "frustrated", phraseType: "word", category: "Emotions", difficultyLevel: "beginner" },
  { phraseText: "punctual", phraseType: "word", category: "Work", difficultyLevel: "intermediate" },
  { phraseText: "thoughtful", phraseType: "word", category: "Social", difficultyLevel: "intermediate" },
];

export interface ImportedPhraseBankPayload {
  sourceName: string;
  sourceLabel: string;
  importedAt: string;
  parsedLines: number;
  totalEntries: number;
  entries: PhraseBankEntry[];
}

export async function loadImportedPhraseBank(): Promise<ImportedPhraseBankPayload> {
  const response = await fetch("/data/imported-phrase-bank.json");

  if (!response.ok) {
    throw new Error("Could not load the imported phrase bank");
  }

  return response.json();
}
