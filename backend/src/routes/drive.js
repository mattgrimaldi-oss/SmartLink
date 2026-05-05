import { getAccessToken } from "./calendar.js";

export async function searchDrive(query) {
  const accessToken = await getAccessToken();

  const params = new URLSearchParams({
    q: `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`,
    fields: "files(id,name,webViewLink,mimeType)",
    pageSize: "10",
    orderBy: "viewedByMeTime desc",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  });

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return [];
  const data = await res.json();

  return (data.files || []).map((f) => ({
    name: f.name,
    linkedinUrl: f.webViewLink,
    source: "Google Drive",
    score: 1,
  }));
}
