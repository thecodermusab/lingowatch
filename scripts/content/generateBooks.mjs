import fs from "fs";

async function run() {
  try {
    console.log("Fetching stories from API...");
    const response = await fetch("http://localhost:8080/api/world-stories");
    const stories = await response.json();
    
    console.log("Found " + stories.length + " stories. Generating bookData.ts...");
    
    const colors = ["#4f46e5", "#6c8c36", "#e6e0d4", "#dc2626", "#d97706", "#2563eb", "#9333ea"];
    
    // 1. Generate bookData.ts
    const bookItems = stories.map((story, index) => {
      let description = (story.content || "").replace(/\n/g, " ").substring(0, 150).trim();
      if ((story.content || "").length > 150) description += "...";

      return {
        id: String(story.id),
        title: story.title,
        authors: "World Stories",
        description: description,
        vocabScore: 1000 + (story.content || "").length, 
        pageCount: Math.max(1, Math.floor((story.content || "").length / 1000)),
        isSimplified: false,
        coverColor: colors[index % colors.length],
        coverUrl: "http://localhost:8080" + story.coverUrl
      };
    });

    const bookDataSrc = [
      "export interface BookItem {",
      "  id: string;",
      "  title: string;",
      "  authors: string;",
      "  description: string;",
      "  vocabScore: number;",
      "  pageCount: number;",
      "  isSimplified: boolean;",
      "  coverColor: string;",
      "  coverUrl?: string;",
      "}",
      "",
      "export const BOOK_ITEMS: BookItem[] = " + JSON.stringify(bookItems, null, 2) + ";"
    ].join("\n");
    
    fs.writeFileSync("src/pages/media/bookData.ts", bookDataSrc);
    console.log("Written to src/pages/media/bookData.ts!");

    // 2. Generate mockReaderData.ts
    console.log("Generating mockReaderData.ts...");
    const dictionary = {};

    for (const story of stories) {
      if (!story.content) continue;
      
      const paragraphs = story.content.split("\n\n").map(p => p.trim()).filter(p => p.length > 0 && p !== '*');
      const rows = [];
      let rowId = 1;
      
      for (const p of paragraphs) {
        const sentences = p.split(/([\.!\?])\s+/).filter(Boolean);
        let currentSentence = "";
        
        for (let i = 0; i < sentences.length; i++) {
            const part = sentences[i];
            if (part.length === 1 && /[\.!\?]/.test(part)) {
                currentSentence += part;
                if (currentSentence.trim()) {
                    rows.push({
                        id: "rf" + (rowId++),
                        source: currentSentence.trim(),
                        target: "(No translation available)"
                    });
                }
                currentSentence = "";
            } else {
                if (currentSentence) {
                     rows.push({
                        id: "rf" + (rowId++),
                        source: currentSentence.trim(),
                        target: "(No translation available)"
                    });
                    currentSentence = "";
                }
                currentSentence = part;
            }
        }
        if (currentSentence.trim()) {
            rows.push({
                id: "rf" + (rowId++),
                source: currentSentence.trim(),
                target: "(No translation available)"
            });
        }
      }
      
      dictionary[String(story.id)] = {
        title: story.title,
        rows: rows
      };
    }

    const mockReaderSrc = [
      "export interface ReaderRow {",
      "  id: string;",
      "  source: string;",
      "  target: string;",
      "}",
      "",
      "export const MOCK_READER_DICTIONARY: Record<string, { title: string; rows: ReaderRow[] }> = " + JSON.stringify(dictionary, null, 2) + ";"
    ].join("\n");

    fs.writeFileSync("src/pages/reader/mockReaderData.ts", mockReaderSrc);
    console.log("Written to src/pages/reader/mockReaderData.ts!");
    
  } catch (error) {
    console.error("Error generating books:", error);
  }
}

run();
