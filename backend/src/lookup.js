import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { searchCalendarForLinkedIn } from "./routes/calendar.js";
import { searchDrive } from "./routes/drive.js";

const COLLEAGUES_FILE = join(dirname(fileURLToPath(import.meta.url)), "../colleagues.json");
const DRIVE_SHORTCUTS_FILE = join(dirname(fileURLToPath(import.meta.url)), "../drive-shortcuts.json");

function loadColleagues() {
  try {
    return JSON.parse(readFileSync(COLLEAGUES_FILE, "utf8"));
  } catch {
    return [];
  }
}

function searchColleagues(name) {
  const colleagues = loadColleagues();
  const query = name.toLowerCase();
  return colleagues
    .filter((c) => c.name.toLowerCase().includes(query))
    .map((c) => ({
      name: c.name,
      linkedinUrl: c.linkedinUrl,
      source: "Colleague Directory",
      score: 3,
    }));
}

function searchDriveShortcuts(query) {
  try {
    const shortcuts = JSON.parse(readFileSync(DRIVE_SHORTCUTS_FILE, "utf8"));
    const q = query.toLowerCase();
    return shortcuts
      .filter((s) => s.aliases.some((a) => a.toLowerCase().includes(q) || q.includes(a.toLowerCase())))
      .map((s) => ({ name: s.name, linkedinUrl: s.url, source: "Google Drive", score: 4 }));
  } catch {
    return [];
  }
}

export async function lookupByName(name) {
  const shortcuts = searchDriveShortcuts(name);
  if (shortcuts.length > 0) return shortcuts;

  const colleagues = searchColleagues(name);
  if (colleagues.length > 0) return colleagues;

  const [calResult, driveResult] = await Promise.allSettled([
    searchCalendarForLinkedIn(name),
    searchDrive(name),
  ]);

  const calResults = calResult.status === "fulfilled" ? calResult.value : [];
  if (calResult.status === "rejected") console.warn("[SmartLink] Calendar lookup failed:", calResult.reason?.message);

  if (calResults.length > 0) return calResults;

  const driveResults = driveResult.status === "fulfilled" ? driveResult.value : [];
  if (driveResult.status === "rejected") console.warn("[SmartLink] Drive lookup failed:", driveResult.reason?.message);

  return driveResults;
}
