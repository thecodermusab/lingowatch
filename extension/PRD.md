You are building LingoWatch — a Chrome extension that turns any video website into a language learning tool, similar to Language Reactor. The target user is a Somali student learning English.
═══════════════════════════════════════
WHAT YOU ARE BUILDING
═══════════════════════════════════════
A Chrome Extension (Manifest V3) that:

Injects a sidebar panel on the RIGHT side of the screen on YouTube and any website with a <video> element. The sidebar has 3 tabs: Subtitles, Words, Saved.
Fetches subtitles for the current video and shows them in the sidebar in sync with the video playback. The current subtitle line is highlighted with a purple left border and a dot indicator.
Shows DUAL subtitles directly on the video player — English on top, Somali translation underneath.
When any word is clicked (anywhere in the sidebar or on the subtitles overlay), shows a popup with:

The word in large text
Somali translation (from MyMemory API: https://api.mymemory.translated.net/get?q=WORD&langpair=en|so)
A speaker button that calls window.speechSynthesis to pronounce the word in English
2-3 example sentences (from https://api.dictionaryapi.dev/api/v2/entries/en/WORD)
A "+ Save" button

Highlights rare words in the subtitle lines:

Rank 6001+ → orange color (#F97316)
Rank 3001–6000 → purple color (#A855F7)
Common words → no highlight

Words tab shows all unique words from the current video grouped by frequency rank sections: "Rank 1–1000", "Rank 1001–3000", "Rank 3001–5000", "Rank 5001–8000", "Rank 8001+". Each word is a clickable chip. Rare words get orange/purple color.
Saved tab shows all words the user has saved using chrome.storage.local, with their Somali translation and a delete button. Words persist across browser sessions.
Keyboard shortcuts: A = replay current subtitle, D = next subtitle line, S = toggle auto-pause after each subtitle.

═══════════════════════════════════════
FILE STRUCTURE TO CREATE
═══════════════════════════════════════
lingowatch/
├── manifest.json
├── background.js
├── content.js
├── content.css
├── popup.html
├── popup.js
├── data/
│ └── frequency.json
├── icons/
│ └── icon128.png
└── backend/
├── main.py
└── requirements.txt
═══════════════════════════════════════
MANIFEST.JSON
═══════════════════════════════════════
{
"manifest_version": 3,
"name": "LingoWatch",
"version": "1.0",
"description": "Learn English from any video with Somali translations",
"permissions": ["storage", "activeTab", "scripting", "webRequest"],
"host_permissions": ["<all_urls>"],
"background": { "service_worker": "background.js" },
"content_scripts": [{
"matches": ["<all_urls>"],
"js": ["content.js"],
"css": ["content.css"],
"run_at": "document_idle"
}],
"action": {
"default_popup": "popup.html",
"default_icon": "icons/icon128.png"
}
}
═══════════════════════════════════════
SIDEBAR UI DESIGN
═══════════════════════════════════════
The sidebar must look exactly like this:

Fixed position on the RIGHT side of screen
Width: 380px, Height: 100vh
Background: #0f0f0f (dark)
3 tabs at top: Subtitles | Words | Saved
Active tab has a purple underline border (#7C3AED)
Each subtitle line is a div with padding 12px 16px, font-size 14px
Current line: left border 3px solid #7C3AED, background #1a1a2e, with a purple dot (●) before it
Rare word chips inside lines are <span> tags — orange or purple depending on rank
Top-right of sidebar: ⚙ settings icon and ✕ close button

When sidebar is open, shift the page content left so the video is not hidden:
document.body.style.marginRight = '380px'
When sidebar is closed, remove the margin.
═══════════════════════════════════════
SUBTITLE SYNC LOGIC
═══════════════════════════════════════
let subtitles = []; // array of { text, start, duration, index }
let currentIndex = -1;
const video = document.querySelector('video');
video.addEventListener('timeupdate', () => {
const time = video.currentTime;
const current = subtitles.find(s =>
time >= s.start && time < s.start + s.duration
);
if (current && current.index !== currentIndex) {
currentIndex = current.index;
updateOverlay(current.text);
highlightSidebarLine(current.index);
scrollSidebarToLine(current.index);
if (autoPause) video.pause();
}
});
═══════════════════════════════════════
BACKEND — Python FastAPI
═══════════════════════════════════════
Create backend/main.py:
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from youtube_transcript_api import YouTubeTranscriptApi
app = FastAPI()
app.add_middleware(
CORSMiddleware,
allow_origins=[""],
allow_methods=[""],
allow_headers=["*"]
)
@app.get("/transcript/{video_id}")
def get_transcript(video_id: str, lang: str = "en"):
try:
ytt = YouTubeTranscriptApi()
transcript = ytt.fetch(video_id, languages=[lang, "en"])
return {
"transcript": [
{"text": t.text, "start": t.start, "duration": t.duration}
for t in transcript
]
}
except Exception as e:
return {"error": str(e)}
@app.get("/health")
def health():
return {"status": "ok"}
backend/requirements.txt:
fastapi
uvicorn
youtube-transcript-api
Run with: uvicorn main:app --host 0.0.0.0 --port 8000
The Chrome extension calls: http://localhost:8000/transcript/{videoId}
Extract videoId from YouTube URL: new URLSearchParams(window.location.search).get('v')
═══════════════════════════════════════
TRANSLATION — MyMemory (Free, No Key)
═══════════════════════════════════════
const translationCache = {};
async function translateToSomali(word) {
if (translationCache[word]) return translationCache[word];
const res = await fetch(
'https://api.mymemory.translated.net/get?q=' +
encodeURIComponent(word) + '&langpair=en|so'
);
const data = await res.json();
const translation = data.responseData.translatedText;
translationCache[word] = translation;
return translation;
}
For translating entire subtitle lines (dual subtitle):
Use langpair=en|so and pass the full subtitle line as q=
═══════════════════════════════════════
PRONUNCIATION — Free, Built into Browser
═══════════════════════════════════════
function pronounce(word) {
window.speechSynthesis.cancel();
const utterance = new SpeechSynthesisUtterance(word);
utterance.lang = 'en-US';
utterance.rate = 0.85;
window.speechSynthesis.speak(utterance);
}
═══════════════════════════════════════
WORD POPUP — On Click
═══════════════════════════════════════
When any word is clicked, show a floating popup:
async function showWordPopup(word, x, y) {
const popup = document.getElementById('lw-word-popup');
// Fetch simultaneously
const [translation, dictData] = await Promise.all([
translateToSomali(word),
fetch('https://api.dictionaryapi.dev/api/v2/entries/en/' + word)
.then(r => r.json()).catch(() => [])
]);
const examples = dictData[0]?.meanings?.[0]?.definitions
?.slice(0, 3)
.map(d => d.example || d.definition)
.filter(Boolean) || [];
const rank = getRank(word);
popup.innerHTML = <div class="lw-popup-word">${word}</div>     <div class="lw-popup-rank">Rank: ${rank > 9000 ? '8001+' : rank}</div>     <div class="lw-popup-translation">🇸🇴 ${translation}</div>     <button class="lw-popup-speak" onclick="pronounce('${word}')">🔊 Hear pronunciation</button> <div class="lw-popup-examples"> ${examples.map(e =><p class="lw-example">"${e}"</p>).join('')} </div> <button class="lw-popup-save" onclick="saveWord('${word}', '${translation}')">+ Save word</button> <button class="lw-popup-close" onclick="closePopup()">✕</button> ;
popup.style.display = 'block';
popup.style.left = Math.min(x, window.innerWidth - 320) + 'px';
popup.style.top = Math.max(y - 20, 10) + 'px';
}
document.addEventListener('click', (e) => {
if (e.target.classList.contains('lw-word')) {
showWordPopup(e.target.textContent.trim(), e.clientX, e.clientY);
}
});
═══════════════════════════════════════
WORD FREQUENCY RANK
═══════════════════════════════════════
Download this file and convert to JSON:
https://github.com/first20hours/google-10000-english/blob/master/google-10000-english-no-swears.txt
The JSON format should be: { "the": 1, "of": 2, "and": 3, ... "lunatic": 7200 }
Save as data/frequency.json and load it when the extension starts.
let frequencyData = {};
fetch(chrome.runtime.getURL('data/frequency.json'))
.then(r => r.json())
.then(data => { frequencyData = data; });
function getRank(word) {
return frequencyData[word.toLowerCase()] || 9999;
}
function getWordClass(word) {
const rank = getRank(word);
if (rank > 6000) return 'lw-rare-high'; // orange
if (rank > 3000) return 'lw-rare-mid'; // purple
return 'lw-word'; // plain, still clickable
}
function wrapWordsInLine(text) {
return text.split(/\s+/).map(word => {
const clean = word.replace(/[^a-zA-Z]/g, '');
const cls = getWordClass(clean);
return <span class="${cls} lw-word" data-word="${clean}">${word}</span>;
}).join(' ');
}
═══════════════════════════════════════
WORDS TAB — Frequency Groups
═══════════════════════════════════════
function renderWordsTab(allSubtitles) {
const allWords = new Set();
allSubtitles.forEach(s => {
s.text.split(/\s+/).forEach(w => {
const clean = w.replace(/[^a-zA-Z]/g, '').toLowerCase();
if (clean.length > 2) allWords.add(clean);
});
});
const groups = {
'Rank 1 – 1000': [],
'Rank 1001 – 3000': [],
'Rank 3001 – 5000': [],
'Rank 5001 – 8000': [],
'Rank 8001+': []
};
allWords.forEach(word => {
const rank = getRank(word);
if (rank <= 1000) groups['Rank 1 – 1000'].push(word);
else if (rank <= 3000) groups['Rank 1001 – 3000'].push(word);
else if (rank <= 5000) groups['Rank 3001 – 5000'].push(word);
else if (rank <= 8000) groups['Rank 5001 – 8000'].push(word);
else groups['Rank 8001+'].push(word);
});
return Object.entries(groups).map(([label, words]) =>     <div class="lw-rank-group">       <div class="lw-rank-label">${label}</div> <div class="lw-rank-words"> ${words.map(w =>
<span class="lw-word-chip ${getWordClass(w)}" data-word="${w}">${w}</span>
).join('')}       </div>     </div>   ).join('');
}
═══════════════════════════════════════
SAVE WORDS — chrome.storage.local
═══════════════════════════════════════
function saveWord(word, translation) {
chrome.storage.local.get(['savedWords'], (result) => {
const saved = result.savedWords || [];
if (!saved.find(w => w.word === word)) {
saved.unshift({
word,
translation,
savedAt: new Date().toLocaleDateString()
});
chrome.storage.local.set({ savedWords: saved });
showToast('Word saved! ✓');
} else {
showToast('Already saved');
}
});
}
function renderSavedTab() {
chrome.storage.local.get(['savedWords'], (result) => {
const saved = result.savedWords || [];
const container = document.getElementById('lw-saved-list');
if (saved.length === 0) {
container.innerHTML = '<p class="lw-empty">No saved words yet. Click any word to save it.</p>';
return;
}
container.innerHTML = saved.map(w =>       <div class="lw-saved-item">         <div class="lw-saved-left">           <span class="lw-saved-word">${w.word}</span> <span class="lw-saved-translation">🇸🇴 ${w.translation}</span>           <span class="lw-saved-date">${w.savedAt}</span> </div> <div class="lw-saved-actions"> <button onclick="pronounce('${w.word}')">🔊</button> <button onclick="deleteWord('${w.word}')">🗑</button> </div> </div> ).join('');
});
}
function deleteWord(word) {
chrome.storage.local.get(['savedWords'], (result) => {
const filtered = (result.savedWords || []).filter(w => w.word !== word);
chrome.storage.local.set({ savedWords: filtered }, renderSavedTab);
});
}
═══════════════════════════════════════
SUBTITLE INTERCEPT — Non-YouTube Sites
═══════════════════════════════════════
In background.js — intercept any .vtt or .srt file the browser downloads:
chrome.webRequest.onBeforeRequest.addListener(
(details) => {
if (details.url.match(/.(vtt|srt)(?|$)/i) && details.type === 'xmlhttprequest') {
chrome.tabs.sendMessage(details.tabId, {
type: 'SUBTITLE_URL_FOUND',
url: details.url
});
}
},
{ urls: ["<all_urls>"] }
);
In content.js — receive and parse it:
chrome.runtime.onMessage.addListener((msg) => {
if (msg.type === 'SUBTITLE_URL_FOUND') {
fetch(msg.url)
.then(r => r.text())
.then(text => {
subtitles = parseVTT(text); // or parseSRT(text)
renderSidebarSubtitles(subtitles);
});
}
});
function parseVTT(text) {
const lines = text.split('\n\n').slice(1); // skip WEBVTT header
return lines.map((block, i) => {
const parts = block.trim().split('\n');
const times = parts[0]?.match(/(\d+:\d+[\d:.]+)\s*-->\s*(\d+:\d+[\d:.]+)/);
if (!times) return null;
return {
index: i,
start: toSeconds(times[1]),
duration: toSeconds(times[2]) - toSeconds(times[1]),
text: parts.slice(1).join(' ').replace(/<[^>]+>/g, '')
};
}).filter(Boolean);
}
function parseSRT(text) {
return text.split(/\n\n+/).map((block, i) => {
const lines = block.trim().split('\n');
const times = lines[1]?.match(/(\d+:\d+:\d+,\d+)\s*-->\s*(\d+:\d+:\d+,\d+)/);
if (!times) return null;
return {
index: i,
start: toSeconds(times[1].replace(',', '.')),
duration: toSeconds(times[2].replace(',', '.')) - toSeconds(times[1].replace(',', '.')),
text: lines.slice(2).join(' ')
};
}).filter(Boolean);
}
function toSeconds(timeStr) {
const parts = timeStr.split(':').map(Number);
return parts.length === 3
? parts[0] _ 3600 + parts[1] _ 60 + parts[2]
: parts[0] \* 60 + parts[1];
}
═══════════════════════════════════════
CSS — content.css KEY RULES
═══════════════════════════════════════
#lw-sidebar {
position: fixed;
right: 0; top: 0;
width: 380px; height: 100vh;
background: #0f0f0f;
color: #e5e5e5;
font-family: -apple-system, BlinkMacSystemFont, sans-serif;
font-size: 14px;
z-index: 999999;
display: flex;
flex-direction: column;
border-left: 1px solid #2a2a2a;
overflow: hidden;
}
.lw-tabs {
display: flex;
border-bottom: 1px solid #2a2a2a;
background: #111;
}
.lw-tab {
flex: 1; padding: 12px;
cursor: pointer; text-align: center;
color: #888; background: none; border: none;
font-size: 13px;
}
.lw-tab.active {
color: #7C3AED;
border-bottom: 2px solid #7C3AED;
}
.lw-subtitle-list {
flex: 1; overflow-y: auto;
padding: 8px 0;
}
.lw-line {
padding: 10px 16px;
cursor: pointer;
line-height: 1.6;
border-left: 3px solid transparent;
}
.lw-line:hover { background: #1a1a1a; }
.lw-line.active {
border-left: 3px solid #7C3AED;
background: #1a1a2e;
}
.lw-rare-high { color: #F97316; cursor: pointer; }
.lw-rare-mid { color: #A855F7; cursor: pointer; }
.lw-word { cursor: pointer; }
.lw-word:hover { text-decoration: underline; }
#lw-overlay {
position: absolute;
bottom: 80px;
left: 50%;
transform: translateX(-50%);
text-align: center;
pointer-events: none;
z-index: 2147483647;
width: 90%;
}
.lw-sub-primary {
font-size: 22px;
font-weight: bold;
color: #ffffff;
text-shadow: 2px 2px 6px #000, -1px -1px 4px #000;
line-height: 1.4;
}
.lw-sub-translation {
font-size: 17px;
color: #FDE68A;
text-shadow: 1px 1px 4px #000;
margin-top: 4px;
}
#lw-word-popup {
position: fixed;
width: 300px;
background: #1a1a2e;
border: 1px solid #7C3AED;
border-radius: 12px;
padding: 20px;
z-index: 999999999;
box-shadow: 0 8px 32px rgba(124,58,237,0.3);
display: none;
}
.lw-popup-word {
font-size: 24px; font-weight: bold;
color: #fff; margin-bottom: 4px;
}
.lw-popup-rank {
font-size: 11px; color: #888;
margin-bottom: 10px;
}
.lw-popup-translation {
font-size: 18px; color: #FDE68A;
margin-bottom: 12px;
}
.lw-popup-speak {
background: #7C3AED; color: white;
border: none; border-radius: 8px;
padding: 8px 16px; cursor: pointer;
width: 100%; margin-bottom: 12px;
}
.lw-example {
font-size: 12px; color: #aaa;
border-left: 2px solid #333;
padding-left: 8px; margin: 6px 0;
font-style: italic;
}
.lw-popup-save {
background: transparent;
border: 1px solid #7C3AED;
color: #7C3AED; border-radius: 8px;
padding: 8px 16px; cursor: pointer;
width: 100%; margin-top: 8px;
}
.lw-rank-group { margin-bottom: 16px; }
.lw-rank-label {
font-size: 11px; color: #555;
padding: 8px 16px 4px;
text-transform: uppercase; letter-spacing: 1px;
border-bottom: 1px solid #1e1e1e;
}
.lw-rank-words { padding: 8px 16px; line-height: 2.2; }
.lw-word-chip {
display: inline-block;
margin: 2px 4px;
cursor: pointer;
font-size: 14px;
}
.lw-word-chip:hover { text-decoration: underline; }
.lw-saved-item {
display: flex; justify-content: space-between;
align-items: center; padding: 12px 16px;
border-bottom: 1px solid #1e1e1e;
}
.lw-saved-word { font-size: 16px; font-weight: bold; display: block; }
.lw-saved-translation { font-size: 13px; color: #FDE68A; display: block; }
.lw-saved-date { font-size: 11px; color: #555; display: block; margin-top: 2px; }
.lw-saved-actions button {
background: none; border: none;
cursor: pointer; font-size: 16px;
margin-left: 8px; opacity: 0.6;
}
.lw-saved-actions button:hover { opacity: 1; }
.lw-toast {
position: fixed; bottom: 80px; left: 50%;
transform: translateX(-50%);
background: #7C3AED; color: white;
padding: 8px 20px; border-radius: 20px;
font-size: 13px; z-index: 9999999999;
animation: fadeOut 2s forwards;
}
@keyframes fadeOut {
0% { opacity: 1; }
70% { opacity: 1; }
100% { opacity: 0; }
}
═══════════════════════════════════════
KEYBOARD SHORTCUTS
═══════════════════════════════════════
let autoPause = false;
document.addEventListener('keydown', (e) => {
if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
const video = document.querySelector('video');
if (!video) return;
if (e.key === 'a' || e.key === 'A') {
// Replay current subtitle line
const current = subtitles[currentIndex];
if (current) { video.currentTime = current.start; video.play(); }
}
if (e.key === 'd' || e.key === 'D') {
// Jump to next subtitle line
const next = subtitles[currentIndex + 1];
if (next) { video.currentTime = next.start; }
}
if (e.key === 's' || e.key === 'S') {
// Toggle auto-pause
autoPause = !autoPause;
showToast(autoPause ? 'Auto-pause ON' : 'Auto-pause OFF');
}
});
═══════════════════════════════════════
TOAST NOTIFICATION
═══════════════════════════════════════
function showToast(message) {
const existing = document.getElementById('lw-toast');
if (existing) existing.remove();
const toast = document.createElement('div');
toast.id = 'lw-toast';
toast.className = 'lw-toast';
toast.textContent = message;
document.body.appendChild(toast);
setTimeout(() => toast.remove(), 2000);
}
═══════════════════════════════════════
BUILD ORDER — Follow This Exactly
═══════════════════════════════════════
Step 1: manifest.json + content.js that just logs "LingoWatch loaded" to console
Step 2: Inject sidebar HTML with hardcoded fake subtitle lines to test layout
Step 3: Set up Python FastAPI backend with youtube-transcript-api
Step 4: Fetch real YouTube transcript from backend and render in sidebar
Step 5: Sync sidebar to video — highlight current line as video plays
Step 6: Inject dual subtitle overlay on the video element
Step 7: Wrap words in <span> tags with lw-word class, click opens popup
Step 8: Popup shows translation + pronunciation button
Step 9: Load frequency.json, highlight rare words orange/purple
Step 10: Build Words tab with frequency groups
Step 11: Build Save + Saved tab with chrome.storage.local
Step 12: Add keyboard shortcuts
Step 13: Add .vtt/.srt intercept in background.js for non-YouTube sites
═══════════════════════════════════════
DO NOT USE
═══════════════════════════════════════

No React, Vue, Angular, or any frontend framework — vanilla JS only
No paid APIs of any kind
No YouTube Data API v3
No OAuth or login system
No external CSS frameworks inside the extension
No jQuery

═══════════════════════════════════════
ALL APIs USED ARE FREE
═══════════════════════════════════════

MyMemory: https://api.mymemory.translated.net — no key, 5000 words/day free
Free Dictionary: https://api.dictionaryapi.dev — no key, unlimited
SpeechSynthesis: window.speechSynthesis — built into Chrome, free
youtube-transcript-api: pip install youtube-transcript-api — free Python library
Word frequency: bundled JSON file, no API call needed
chrome.storage.local: built into Chrome, free
