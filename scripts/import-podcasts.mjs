import fetch from "node-fetch";

const SEEDS = [
  "All Ears English Podcast",
  "Speak English with ESLPod",
  "Luke's ENGLISH Podcast",
  "This American Life",
  "The Joe Rogan Experience",
  "Radiolab",
  "TED Talks Daily"
];

async function run() {
  console.log("Importing seed podcasts...");
  const res = await fetch("http://127.0.0.1:3001/api/admin/import-podcasts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seeds: SEEDS })
  });
  const data = await res.json();
  console.log("Import result:", JSON.stringify(data, null, 2));

  console.log("Syncing feeds...");
  const syncRes = await fetch("http://127.0.0.1:3001/api/admin/sync-feeds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const syncData = await syncRes.json();
  console.log("Sync result:", JSON.stringify(syncData, null, 2));
}

run().catch(console.error);
