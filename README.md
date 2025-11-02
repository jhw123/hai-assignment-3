# Math MCQ Labeling App

This project provides a simple web UI to present multiple-choice math questions (from `data.csv`) and collect labels.

There are two implementations in the repository:

- Legacy: a small Flask app (`app.py`) — kept only for reference.
- Recommended: a Next.js app (frontend + API routes) — actively developed and maintained in this repo.

Quick start (Next.js, macOS / zsh)

1. Open a terminal in the project folder:

```bash
cd /Users/hyoungwook/Desktop/assignment3
```

2. Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

3. Open the app in your browser:

Visit <http://localhost:3000>

What the app does

- Reads questions from `data.csv` in the project root.
- Presents one question at a time to the worker.
- Submits answers to the API route `/api/submit`.
- By default, the server writes labeled rows to `labels.csv` in the project root.
- If configured, the server can append submissions directly to a Google Spreadsheet (preferred for shared/remote storage).

Google Sheets integration (recommended for remote storage)

The Next.js API route `pages/api/submit.js` will append each submitted row to a Google Sheet when the environment is configured. If Google Sheets isn't configured or an append fails, the server will fall back to writing `labels.csv` locally.

Required environment variables

- `GOOGLE_SHEET_ID` — the ID portion of your Google Spreadsheet URL (required to enable Sheets writes).

Credentials: choose one of the following methods to authenticate the server to Google:

1) Service account JSON via file (recommended for local dev):

 - Create a Google Cloud service account and download the JSON key file.
 - Share your target Google Sheet with the service account email (from the key JSON).
 - Set the environment variable to the JSON file path:

  ```bash
  export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account-key.json"
  export GOOGLE_SHEET_ID="your_sheet_id_here"
  ```

2) Service account JSON as an environment variable (convenient for some deploys):

 - Put the entire service account JSON into `GOOGLE_SERVICE_ACCOUNT_JSON` as a single-line JSON string. For example (zsh):

  ```bash
  export GOOGLE_SERVICE_ACCOUNT_JSON='$(cat /path/to/service-account-key.json)'
  export GOOGLE_SHEET_ID="your_sheet_id_here"
  ```

 - Note: ensure the JSON string preserves newlines; using a file and `GOOGLE_APPLICATION_CREDENTIALS` is simpler and less error-prone.

Optional environment variables

- `GOOGLE_SHEET_RANGE` — A1 notation range for append (default: `Sheet1!A:E`). The submit handler appends five columns: id, selected_index, selected_text, worker_id, timestamp.

How to get your `GOOGLE_SHEET_ID`

- Open your sheet in the browser. The URL looks like `https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit#gid=0`. Copy the `<SHEET_ID>` portion.

Example run with Sheets enabled (zsh):

```bash
export GOOGLE_APPLICATION_CREDENTIALS="$HOME/keys/my-service-account.json"
export GOOGLE_SHEET_ID="1a2B3cD4e5F6g7H8I9jK0lmnopqrstuv"
npm install
npm run dev
```

Testing and fallback

- Submit a few labels via the UI. If Sheets is configured correctly, rows should appear in the spreadsheet. If the server can't reach Sheets or credentials are invalid, submissions will still be saved locally to `labels.csv` as a fallback.

Download labels

- You can download the local CSV at: <http://localhost:3000/api/labels> (if using local fallback). When using Google Sheets only, export data from Google Sheets as needed.

Notes and troubleshooting

- Make sure the service account email has at least Editor access to the target sheet.
- If you use `GOOGLE_SERVICE_ACCOUNT_JSON`, be careful when pasting the JSON into env vars—newlines and quoting can cause issues. Prefer the `GOOGLE_APPLICATION_CREDENTIALS` file approach for simplicity.
- If you see an error in the server logs about missing env vars, verify `GOOGLE_SHEET_ID` and one of the credential approaches is set.

Legacy Flask app

- The repository still contains a legacy `app.py` (Flask). The Next.js app is the recommended option.

License / Attribution

- (keep any license or project-specific notes here)
