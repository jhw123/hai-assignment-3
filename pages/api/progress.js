import fs from 'fs'
import path from 'path'
import { google } from 'googleapis'
import { loadQuestions } from './_helpers'

const DATA_PATH = path.join(process.cwd(), 'labels.csv')

async function getAnsweredFromSheet(sheetName) {
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!sheetId) return null
  let authClient
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    authClient = new google.auth.JWT(key.client_email, null, key.private_key, ['https://www.googleapis.com/auth/spreadsheets.readonly'])
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const auth = new google.auth.GoogleAuth({ keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
    authClient = await auth.getClient()
  } else {
    return null
  }

  const sheets = google.sheets({ version: 'v4', auth: authClient })
  // prefer explicit sheetName if provided, else env range, else default Sheet1
  const range = sheetName ? `${sheetName}!A:A` : (process.env.GOOGLE_SHEET_RANGE || 'Sheet1!A:A')
  const resp = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range })
  const rows = resp.data.values || []
  // first column expected to be question id
  return new Set(rows.map(r => { const v = r[0]; const n = parseInt(v, 10); return Number.isNaN(n)? null : n }).filter(x=>x!==null))
}

function getAnsweredFromLocal() {
  if (!fs.existsSync(DATA_PATH)) return null
  const raw = fs.readFileSync(DATA_PATH, 'utf8')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const ids = new Set()
  for (const l of lines) {
    // CSV row: id,selected_index,selected_text,worker_id,timestamp
    const parts = l.split(',')
    const id = parseInt(parts[0], 10)
    if (!Number.isNaN(id)) ids.add(id)
  }
  return ids
}

export default async function handler(req, res) {
  const qs = loadQuestions()
  const sheetName = req.query && req.query.sheet ? String(req.query.sheet) : null
  // try Google Sheets first
  try {
    const fromSheet = await getAnsweredFromSheet(sheetName)
    const answered = fromSheet || getAnsweredFromLocal() || new Set()
    // find first index not in answered
    let next = 0
    while (next < qs.length && answered.has(next)) next++
    res.status(200).json({ nextIndex: next })
  } catch (e) {
    console.error('progress error', e)
    // fallback: local
    const answeredLocal = getAnsweredFromLocal() || new Set()
    let next = 0
    while (next < qs.length && answeredLocal.has(next)) next++
    res.status(200).json({ nextIndex: next })
  }
}
