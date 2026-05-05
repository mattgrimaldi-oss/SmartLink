# SmartLink

A Chrome extension for recruiters. Highlight a name in Gmail, hit **⌘+Shift+L** (Mac) or **Ctrl+Shift+L** (Windows), and the name becomes a hyperlink to that person's LinkedIn profile — pulled automatically from Greenhouse (candidates) or Slack (colleagues).

---

## How it works

1. You highlight a name in a Gmail compose window
2. Press the keyboard shortcut
3. SmartLink checks your Greenhouse ATS for a candidate with that name
4. If not found there, checks your Slack workspace for a colleague
5. If one match is found, the name is linked instantly
6. If multiple matches are found, a small picker appears so you choose the right person

---

## Setup

### 1. Start the backend

The backend runs locally and handles all API calls (keeps your keys out of the extension).

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and fill in your keys
npm run dev
```

Your `.env` file needs:

| Variable | Where to get it |
|---|---|
| `GREENHOUSE_API_KEY` | Greenhouse → Configure → Dev Center → API Credential Management |
| `SLACK_BOT_TOKEN` | Create a Slack app with `users:read` + `users.profile:read` scopes → Bot User OAuth Token |

### 2. Load the extension in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle, top right)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo

### 3. Configure the extension

1. Click the SmartLink icon in your Chrome toolbar
2. Click **Configure API keys →**
3. Enter your Greenhouse API key and Slack bot token
4. Set the backend URL (default: `http://localhost:3000`)
5. Click **Save settings**, then **Test connection** to verify

---

## Usage

1. Open Gmail and start composing or replying to an email
2. Type or find the person's name in the email body
3. **Highlight the name** with your mouse or keyboard
4. Press **⌘+Shift+L** (Mac) or **Ctrl+Shift+L** (Windows)
5. The name becomes a clickable LinkedIn hyperlink

---

## Project structure

```
SmartLink/
├── extension/          # Chrome extension (Manifest V3)
│   ├── manifest.json
│   ├── background.js   # Handles keyboard shortcut command
│   ├── content.js      # Injected into Gmail — does the linking
│   ├── popup.html/js   # Toolbar popup with status indicators
│   └── options.html/js # Settings page for API keys
│
└── backend/            # Node.js/Express backend
    ├── .env.example
    └── src/
        ├── index.js        # Express server + /health + /lookup routes
        ├── lookup.js       # Orchestrates Greenhouse + Slack lookups
        └── routes/
            ├── greenhouse.js   # Greenhouse Harvest API integration
            └── slack.js        # Slack API integration (with member caching)
```

---

## Deploying the backend

For production use, deploy the backend to a platform like [Railway](https://railway.app) or [Render](https://render.com) and update the backend URL in the extension settings. Set your environment variables in the platform's dashboard — never commit your `.env` file.
