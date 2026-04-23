import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env');
let apiKey = '';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/VITE_GEMINI_KEY=(.*)/);
  if (match) apiKey = match[1].trim();
}

if (!apiKey) {
  console.error("VITE_GEMINI_KEY not found in .env");
  process.exit(1);
}

const bookId = process.argv[2];
if (!bookId) {
  console.error("Please provide a Book ID. Example: node scripts/translateBook.mjs 281");
  process.exit(1);
}

// Read mockReaderData.ts
const dataPath = path.join(process.cwd(), 'src/pages/reader/mockReaderData.ts');
const rawData = fs.readFileSync(dataPath, 'utf8');

const startMarker = 'export const MOCK_READER_DICTIONARY: Record<string, { title: string; rows: ReaderRow[] }> = ';
const startIndex = rawData.indexOf(startMarker) + startMarker.length;
const endIndex = rawData.lastIndexOf(';');
const jsonString = rawData.substring(startIndex, endIndex);

let dictionary;
try {
  dictionary = JSON.parse(jsonString);
} catch(e) {
  console.error("Failed to parse existing MOCK_READER_DICTIONARY json.");
  process.exit(1);
}

if (!dictionary[bookId]) {
  console.error(`Book ID ${bookId} not found in mockReaderData.ts`);
  process.exit(1);
}

const bookTitle = dictionary[bookId].title;
const rows = dictionary[bookId].rows;
console.log(`Translating book: ${bookTitle} (${rows.length} rows)`);

async function run() {
  const sources = rows.map(r => r.source);
  
  // To avoid hitting payload limits or output token limits, process in chunks of 20
  const chunkSize = 20;
  for (let i = 0; i < sources.length; i += chunkSize) {
    const chunk = sources.slice(i, i + chunkSize);
    console.log(`Translating chunk ${Math.floor(i/chunkSize)+1}...`);

    const prompt = `You are an expert English-to-Somali translator for story books. Translate the following JSON array of English strings to natural, organic Somali. Return EXACTLY the JSON array structure with translated strings.\n${JSON.stringify(chunk)}`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            generationConfig: { responseMimeType: "application/json" },
            contents: [{ parts: [{ text: prompt }] }]
        })
    });

    const data = await response.json();
    if (data.error) {
        console.error("API Error:", data.error);
        process.exit(1);
    }
    
    let resultText = data.candidates[0].content.parts[0].text;
    let translatedChunk = [];
    try {
        translatedChunk = JSON.parse(resultText.trim());
    } catch(e) {
        console.error("Failed to parse Gemini output as JSON:", resultText);
        process.exit(1);
    }

    if (translatedChunk.length !== chunk.length) {
        console.error("Output length mismatch!", translatedChunk.length, "vs", chunk.length);
        process.exit(1);
    }

    for (let j = 0; j < chunk.length; j++) {
        rows[i + j].target = translatedChunk[j];
    }
  }

  // Save back to file
  const mockReaderSrc = [
    "export interface ReaderRow {",
    "  id: string;",
    "  source: string;",
    "  target: string;",
    "}",
    "",
    "export const MOCK_READER_DICTIONARY: Record<string, { title: string; rows: ReaderRow[] }> = " + JSON.stringify(dictionary, null, 2) + ";"
  ].join("\n");

  fs.writeFileSync(dataPath, mockReaderSrc);
  console.log(`Successfully translated and saved book ID ${bookId}!`);
}

run();
