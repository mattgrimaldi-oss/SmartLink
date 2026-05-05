const BASE = "https://slack.com/api";

function authHeader() {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN not set");
  return `Bearer ${token}`;
}

function normalizeName(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreMatch(member, query) {
  const q = normalizeName(query);
  const displayName = normalizeName(member.profile?.display_name || "");
  const realName = normalizeName(member.profile?.real_name || "");
  if (realName === q || displayName === q) return 2;
  if (realName.includes(q) || displayName.includes(q)) return 1;
  return 0;
}

let memberCache = null;
let memberCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchAllMembers() {
  const now = Date.now();
  if (memberCache && now - memberCacheTime < CACHE_TTL_MS) return memberCache;

  const members = [];
  let cursor;

  do {
    const params = new URLSearchParams({ limit: "200" });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${BASE}/users.list?${params}`, {
      headers: { Authorization: authHeader() },
    });

    if (!res.ok) throw new Error(`Slack API HTTP ${res.status}`);

    const data = await res.json();
    if (!data.ok) throw new Error(`Slack API error: ${data.error}`);

    members.push(...(data.members || []));
    cursor = data.response_metadata?.next_cursor;
  } while (cursor);

  memberCache = members;
  memberCacheTime = now;
  return members;
}

export async function searchSlack(name) {
  if (!process.env.SLACK_BOT_TOKEN) return [];

  const members = await fetchAllMembers();
  const results = [];

  for (const member of members) {
    if (member.deleted || member.is_bot) continue;

    const score = scoreMatch(member, name);
    if (score === 0) continue;

    // LinkedIn URL stored in profile fields — common field names Slack uses
    const profile = member.profile || {};
    const linkedinUrl =
      profile.linkedin ||
      profile.linkedin_profile ||
      Object.values(profile).find(
        (v) => typeof v === "string" && v.includes("linkedin.com/in/")
      );

    if (!linkedinUrl) continue;

    results.push({
      name: profile.real_name || profile.display_name || name,
      linkedinUrl,
      source: "Slack",
      score,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
