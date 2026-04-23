import { AIGenerationResult } from "@/types";

const mockResults: Record<string, AIGenerationResult> = {
  "throttle down": {
    phraseType: "phrasal_verb",
    standardMeaning: "To reduce speed, power, or intensity of something",
    easyMeaning: "To go slower or use less power",
    aiExplanation: "When you 'throttle down,' you are making something work less hard. Think of a car — when you throttle down, the car goes slower. People also use this phrase when they want to say 'relax' or 'slow down' in life or work.",
    usageContext: "People use this phrase when talking about engines, machines, or when someone is working too hard and needs to slow down. It is common in both technical and everyday speech.",
    examples: [
      { type: "simple", text: "The pilot throttled down before landing the plane." },
      { type: "simple", text: "You should throttle down and take a break." },
      { type: "simple", text: "The engine throttled down as we approached the station." },
      { type: "daily", text: "After a busy week, I need to throttle down this weekend." },
      { type: "work", text: "The manager asked the team to throttle down the project pace to avoid mistakes." },
    ],
    somaliMeaning: "Xawaaraha hoos u dhig",
    somaliExplanation: "Marka la yiraahdo 'throttle down,' waxay ka dhigan tahay inaad wax ka tartiibiso. Tusaale ahaan, baabuur marka la hoos u dhigo xawaaradiisa.",
    somaliSentence: "Darawalku wuxuu hoos u dhigay xawaaraha gaariga markuu gaadhay isgoyska.",
    commonMistake: "Learners sometimes confuse 'throttle down' with 'shut down.' Throttle down means to reduce, not to stop completely.",
    pronunciationText: "/ˈθrɒt.əl daʊn/",
    relatedPhrases: ["slow down", "ease up", "wind down"],
  },
};

const defaultResult: AIGenerationResult = {
  phraseType: "phrase",
  standardMeaning: "The meaning of this phrase in standard English.",
  easyMeaning: "A very simple explanation of what this means.",
  aiExplanation: "This phrase is used in everyday English. It helps you express an idea clearly and naturally.",
  usageContext: "People use this phrase in casual conversations and sometimes at work.",
  examples: [
    { type: "simple", text: "Here is a simple example sentence." },
    { type: "simple", text: "Another easy example for you." },
    { type: "simple", text: "One more example to help you understand." },
    { type: "daily", text: "I used this phrase when talking to my friend today." },
    { type: "work", text: "My manager used this phrase in a meeting." },
  ],
  somaliMeaning: "Macnaha Soomaaliga",
  somaliExplanation: "Sharaxaad fudud oo Soomaali ah.",
  somaliSentence: "Tusaale jumlad Soomaali ah.",
  commonMistake: "Learners sometimes use this phrase in the wrong context.",
  pronunciationText: "/phrase/",
  relatedPhrases: ["similar phrase 1", "similar phrase 2", "similar phrase 3"],
};

export function generateMockAI(phraseText: string): Promise<AIGenerationResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const key = phraseText.toLowerCase().trim();
      const result = mockResults[key] || {
        ...defaultResult,
        standardMeaning: `The standard meaning of "${phraseText}".`,
        easyMeaning: `"${phraseText}" means something simple and easy to understand.`,
        aiExplanation: `"${phraseText}" is a common English expression. It is used when you want to express a specific idea. Most people understand it easily.`,
        pronunciationText: `/${phraseText}/`,
      };
      resolve(result);
    }, 1500);
  });
}

export const samplePhrases = [
  {
    phraseText: "throttle down",
    phraseType: "phrasal_verb" as const,
    category: "Daily Life",
    difficultyLevel: "intermediate" as const,
  },
  {
    phraseText: "break the ice",
    phraseType: "idiom" as const,
    category: "Social",
    difficultyLevel: "beginner" as const,
  },
  {
    phraseText: "get the hang of",
    phraseType: "phrasal_verb" as const,
    category: "Learning",
    difficultyLevel: "beginner" as const,
  },
];

export const categories = [
  "Daily Life",
  "Work",
  "Social",
  "Learning",
  "Travel",
  "Technology",
  "Health",
  "Business",
  "Emotions",
  "Other",
];
