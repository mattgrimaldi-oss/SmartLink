import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE = "https://harvest.greenhouse.io/v1";
const GH_APP = "https://app.greenhouse.io/people";
const CACHE_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../.greenhouse-cache.json");
const INCREMENTAL_INTERVAL_MS = 60 * 60 * 1000; // check for new/updated candidates every hour

let candidateMap = new Map(); // id → candidate
let lastFullFetch = 0;
let lastIncrementalFetch = 0;

function authHeader() {
  const key = process.env.GREENHOUSE_API_KEY;
  if (!key) throw new Error("GREENHOUSE_API_KEY not set");
  return "Basic " + Buffer.from(`${key}:`).toString("base64");
}

function normalizeName(name) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

async function fetchPage(params) {
  const res = await fetch(`${BASE}/candidates?${params}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Greenhouse API ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchAllPages(extraParams = "") {
  const all = [];
  let page = 1;
  while (true) {
    const batch = await fetchPage(`per_page=500&page=${page}${extraParams}`);
    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < 500) break;
    page++;
  }
  return all;
}

function loadFromDisk() {
  if (!existsSync(CACHE_FILE)) return false;
  try {
    const { candidates, savedAt } = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    for (const c of candidates) candidateMap.set(c.id, c);
    lastFullFetch = savedAt;
    lastIncrementalFetch = savedAt;
    console.log(`[SmartLink] Loaded ${candidateMap.size} candidates from disk cache.`);
    return true;
  } catch {
    return false;
  }
}

function saveToDisk() {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify({
      savedAt: Date.now(),
      candidates: Array.from(candidateMap.values()),
    }));
  } catch (err) {
    console.warn("[SmartLink] Could not save cache to disk:", err.message);
  }
}

async function fullFetch() {
  console.log("[SmartLink] Fetching all Greenhouse candidates (first run)...");
  const candidates = await fetchAllPages();
  candidateMap.clear();
  for (const c of candidates) candidateMap.set(c.id, c);
  lastFullFetch = Date.now();
  lastIncrementalFetch = Date.now();
  saveToDisk();
  console.log(`[SmartLink] Cached ${candidateMap.size} candidates.`);
}

async function incrementalFetch() {
  const since = new Date(lastIncrementalFetch - 60000).toISOString(); // 1 min overlap to avoid gaps
  const updated = await fetchAllPages(`&updated_after=${encodeURIComponent(since)}`);
  if (updated.length) {
    for (const c of updated) candidateMap.set(c.id, c);
    saveToDisk();
    console.log(`[SmartLink] Updated ${updated.length} candidates from Greenhouse.`);
  }
  lastIncrementalFetch = Date.now();
}

export async function warmCache() {
  const loadedFromDisk = loadFromDisk();
  if (!loadedFromDisk) {
    await fullFetch();
  }
  // Schedule hourly incremental updates
  setInterval(async () => {
    try { await incrementalFetch(); } catch (err) {
      console.warn("[SmartLink] Incremental fetch failed:", err.message);
    }
  }, INCREMENTAL_INTERVAL_MS);
}

export async function searchGreenhouse(name) {
  if (!process.env.GREENHOUSE_API_KEY) return [];
  if (candidateMap.size === 0) await fullFetch();

  const q = normalizeName(name);
  const results = [];

  for (const c of candidateMap.values()) {
    const full = normalizeName(`${c.first_name} ${c.last_name}`);
    let score = 0;
    if (full === q) score = 2;
    else if (full.startsWith(q) || q.startsWith(full)) score = 1;
    if (score === 0) continue;

    results.push({
      name: `${c.first_name} ${c.last_name}`,
      linkedinUrl: `${GH_APP}/${c.id}`,
      source: "Greenhouse",
      score,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
