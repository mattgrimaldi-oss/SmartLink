import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const TOKENS_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../.google-tokens.json");
const SEARCH_MONTHS_BACK = 3;

function getCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set");
  return { clientId, clientSecret };
}

function loadTokens() {
  if (!existsSync(TOKENS_FILE)) return null;
  try { return JSON.parse(readFileSync(TOKENS_FILE, "utf8")); } catch { return null; }
}

function saveTokens(tokens) {
  writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

export async function getAccessToken() {
  const tokens = loadTokens();
  if (!tokens?.refresh_token) throw new Error("Not authenticated. Visit /auth/google to connect your Google account.");
  return refreshAccessToken(tokens.refresh_token);
}

function extractLinkedIn(text) {
  if (!text) return null;
  const match = text.match(/https?:\/\/(www\.)?linkedin\.com\/in\/[^\s\n\r"'<>]+/i);
  return match ? match[0].replace(/[.,;)]+$/, "") : null;
}

export function getAuthUrl(redirectUri) {
  const { clientId } = getCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.readonly",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function handleAuthCallback(code, redirectUri) {
  const { clientId, clientSecret } = getCredentials();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tokens = await res.json();
  if (!tokens.refresh_token) throw new Error("No refresh token returned. Make sure the OAuth app is set to request offline access.");
  saveTokens(tokens);
  return tokens;
}

export function isAuthenticated() {
  const tokens = loadTokens();
  return !!(tokens?.refresh_token);
}

async function listCalendars(accessToken) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  return data.items || [];
}

async function searchCalendar(calendarId, name, accessToken) {
  const timeMin = new Date();
  timeMin.setMonth(timeMin.getMonth() - SEARCH_MONTHS_BACK);

  const params = new URLSearchParams({
    q: name,
    timeMin: timeMin.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

export async function searchCalendarForLinkedIn(name) {
  if (!process.env.GOOGLE_CLIENT_ID) return [];

  const accessToken = await getAccessToken();
  const calendars = await listCalendars(accessToken);

  // Search across all calendars the user has access to
  const allEvents = await Promise.all(
    calendars.map((cal) => searchCalendar(cal.id, name, accessToken))
  );

  const seen = new Set();
  const results = [];

  for (const events of allEvents) {
    for (const event of events) {
      const linkedIn = extractLinkedIn(event.description);
      if (!linkedIn || seen.has(linkedIn)) continue;
      seen.add(linkedIn);

      // Check that the candidate's name appears in the event
      const eventText = `${event.summary || ""} ${event.description || ""} ${
        (event.attendees || []).map((a) => a.displayName || a.email).join(" ")
      }`.toLowerCase();

      if (!eventText.includes(name.split(" ")[0].toLowerCase())) continue;

      results.push({
        name,
        linkedinUrl: linkedIn,
        source: "Google Calendar",
        score: 2,
      });
    }
  }

  return results;
}
