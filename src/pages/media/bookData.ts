export interface BookItem {
  id: string;
  title: string;
  authors: string;
  description: string;
  vocabScore: number;
  pageCount: number;
  isSimplified: boolean;
  coverColor: string;
  coverUrl?: string;
}

export const BOOK_ITEMS: BookItem[] = [
  {
    id: "335",
    title: "A Good Friend",
    authors: "World Stories",
    description: "Yasin’s family moved from Iraq to England when he was just a young boy. Yasin did not want to leave his home in Samarra but his father said that it was best for the family because it was not safe to live there anymore and he wanted his son to grow up in a country that was accepting of all people.",
    vocabScore: 2450,
    pageCount: 15,
    isSimplified: false,
    coverColor: "#4f46e5", // Indigo
    coverUrl: "http://localhost:8080/world-stories/covers/335.jpg",
  },
  {
    id: "b1",
    title: "Autobiography of Benjamin Franklin",
    authors: "Franklin, Benjamin, Pine, Frank Woodworth, Smith, E. Boyd (Elmer Boyd)",
    description: "Awoogii shakhsi oo caan ah oo Mareykan ah, oo uu qoray Benjamin Franklin laftiisa, oo ka warramaya noloshiisa iyo guulahiisa.",
    vocabScore: 9080,
    pageCount: 288,
    isSimplified: false,
    coverColor: "#6c8c36", // green
  },
  {
    id: "b2",
    title: "Autobiography of Benjamin Franklin",
    authors: "Franklin, Benjamin, Pine, Frank Woodworth, Smith, E. Boyd (Elmer Boyd)",
    description: "Awoogii shakhsi oo caan ah oo Mareykan ah, oo uu qoray Benjamin Franklin laftiisa, oo ka warramaya noloshiisa iyo guulahiisa.",
    vocabScore: 4370,
    pageCount: 288,
    isSimplified: true,
    coverColor: "#6c8c36", // green
  },
  {
    id: "b3",
    title: "The Republic of Plato",
    authors: "Plato, Jowett, Benjamin",
    description: "Qoraal falsafadeed sahaminaya fikradda caddaaladda iyo bulshada ugu habboon, oo uu qoray falsafiyiinta Giriigga hore Plato, waxaana turjumay Benjamin Jowett.",
    vocabScore: 10000,
    pageCount: 924,
    isSimplified: false,
    coverColor: "#e6e0d4", // off-white
  },
  {
    id: "b4",
    title: "The Republic of Plato",
    authors: "Plato, Jowett, Benjamin",
    description: "Qoraal falsafadeed sahaminaya fikradda caddaaladda iyo bulshada ugu habboon, oo uu qoray falsafiyiinta Giriigga hore Plato, waxaana turjumay Benjamin Jowett.",
    vocabScore: 6140,
    pageCount: 924,
    isSimplified: true,
    coverColor: "#e6e0d4", // off-white
  },
];
