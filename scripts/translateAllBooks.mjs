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

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function run() {
  const bookKeys = Object.keys(dictionary);
  console.log(`Found ${bookKeys.length} books. Starting bulk translation...`);

  let booksTranslated = 0;

  for (const bookId of bookKeys) {
    const bookTitle = dictionary[bookId].title;
    const rows = dictionary[bookId].rows;
    
    const needsTranslation = rows.some(r => r.target === "(No translation available)");
    if (!needsTranslation) {
        console.log(`Skipping book ${bookId} (${bookTitle}) - already translated.`);
        continue;
    }

    console.log(`\nTranslating book ${bookId}: ${bookTitle} (${rows.length} rows)`);

    const sources = rows.map(r => r.source);
    
    // Using larger chunks to minimize API requests (Gemini Flash can handle lots of text)
    // 50 sentences is totally fine in 1 chunk.
    const chunkSize = 50; 
    let success = true;

    for (let i = 0; i < sources.length; i += chunkSize) {
      const chunk = sources.slice(i, i + chunkSize);
      
      const prompt = `You are an expert English-to-Somali translator for story books. Translate the following JSON array of English strings to natural, organic Somali. Return EXACTLY the JSON array structure with translated strings. Do not skip any strings.\n${JSON.stringify(chunk)}`;

      let retries = 3;
      let translatedChunk = null;

      while (retries > 0) {
        try {
            console.log(`   Translating chunk ${Math.floor(i/chunkSize)+1}... (Waiting 4 seconds to respect rate limits)`);
            await sleep(4500); // 15 RPM limit = 1 request every 4 seconds. Adding buffer.

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
                if (data.error.code === 429) {
                    console.warn(`   Rate limited! Waiting 15 seconds...`);
                    await sleep(15000);
                    retries--;
                    continue;
                }
                throw new Error(data.error.message);
            }
            
            let resultText = data.candidates[0].content.parts[0].text;
            translatedChunk = JSON.parse(resultText.trim());

            if (translatedChunk.length !== chunk.length) {
                console.warn(`   Length mismatch. Generated ${translatedChunk.length}, expected ${chunk.length}. Retrying...`);
                retries--;
                continue;
            }

            break; // Success
        } catch (e) {
            console.warn(`   Error translating chunk: ${e.message}. Retrying...`);
            retries--;
            await sleep(6000);
        }
      }

      if (!translatedChunk) {
          console.error(`   Failed to translate chunk after retries. Skipping book ${bookId} to avoid corruption.`);
          success = false;
          break;
      }

      for (let j = 0; j < chunk.length; j++) {
          rows[i + j].target = translatedChunk[j];
      }
    }

    if (success) {
        // Save the dictionary file back down incrementally
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
          console.log(`-> Successfully translated and saved book ID ${bookId}!`);
          booksTranslated++;
    }
  }

  console.log(`\nBulk translation complete! Translated ${booksTranslated} new books.`);
}

run();
