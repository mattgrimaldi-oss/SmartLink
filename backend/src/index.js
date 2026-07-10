import "dotenv/config";
import express from "express";
import cors from "cors";
import { lookupByName } from "./lookup.js";
import { getAuthUrl, handleAuthCallback, isAuthenticated, searchCalendarForLinkedIn } from "./routes/calendar.js";

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DOMAIN =
  process.env.PUBLIC_DOMAIN ||
  process.env.RAILWAY_PUBLIC_DOMAIN ||
  (process.env.VERCEL_URL ? process.env.VERCEL_URL : null);
const REDIRECT_URI = PUBLIC_DOMAIN
  ? `https://${PUBLIC_DOMAIN}/auth/google/callback`
  : `http://localhost:${PORT}/auth/google/callback`;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith("chrome-extension://") || origin === "https://mail.google.com" || origin === "https://app.slack.com" || origin === "https://docs.google.com") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  }
}));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    google: isAuthenticated(),
    greenhouse: !!process.env.GREENHOUSE_API_KEY,
    slack: !!process.env.SLACK_BOT_TOKEN,
  });
});

// Step 1: redirect to Google login
app.get("/auth/google", (_req, res) => {
  res.redirect(getAuthUrl(REDIRECT_URI));
});

// Step 2: Google redirects back here with a code
app.get("/auth/google/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code");
  try {
    const tokens = await handleAuthCallback(code, REDIRECT_URI);
    // On serverless (Vercel) the token can't be persisted at runtime — show it so it can be
    // pasted into the GOOGLE_TOKENS env var once. On Railway it's already saved automatically.
    const tokenBlock = process.env.VERCEL
      ? `<p style="font-family:sans-serif">Paste this into the <b>GOOGLE_TOKENS</b> environment variable in Vercel:</p>
         <textarea style="width:100%;height:120px;font-family:monospace;font-size:12px">${JSON.stringify(tokens)}</textarea>`
      : "";
    res.send(`
      <h2 style="font-family:sans-serif;color:#1a73e8">✓ Google Calendar connected!</h2>
      <p style="font-family:sans-serif">SmartLink can now search your calendars. You can close this tab.</p>
      ${tokenBlock}
    `);
  } catch (err) {
    res.status(500).send(`Auth failed: ${err.message}`);
  }
});

app.get("/debug", async (req, res) => {
  const name = req.query.name?.trim();
  if (!name) return res.status(400).json({ error: "name required" });
  const [cal] = await Promise.allSettled([searchCalendarForLinkedIn(name)]);
  res.json({
    calendar: cal.status === "fulfilled" ? cal.value : { error: cal.reason?.message },
  });
});

app.get("/lookup", async (req, res) => {
  const name = req.query.name?.trim();
  if (!name || name.length < 2) {
    return res.status(400).json({ error: "name query param required" });
  }
  try {
    const results = await lookupByName(name);
    res.json(results);
  } catch (err) {
    console.error("[SmartLink] lookup error:", err.message);
    res.status(500).json({ error: "Lookup failed", detail: err.message });
  }
});

// On Vercel the app is imported as a serverless handler, so don't bind a port there.
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`SmartLink backend running on http://localhost:${PORT}`);
    console.log(`  Google Calendar: ${isAuthenticated() ? "connected" : `NOT connected — visit http://localhost:${PORT}/auth/google`}`);
  });
}

export default app;
