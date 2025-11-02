import { google } from 'googleapis'

async function appendToSheet(row, sheetName) {
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID not set')

  // create auth client: prefer service account JSON in env, else use key file path
  let authClient
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
    authClient = new google.auth.JWT(key.client_email, null, key.private_key, ['https://www.googleapis.com/auth/spreadsheets'])
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const auth = new google.auth.GoogleAuth({ keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes: ['https://www.googleapis.com/auth/spreadsheets'] })
    authClient = await auth.getClient()
  } else {
    throw new Error('No Google service account credentials found in env')
  }

  const sheets = google.sheets({ version: 'v4', auth: authClient })
  // If a specific sheet name was provided, use it (columns A:E); otherwise fall back to env range or Sheet1
  const range = sheetName ? `${sheetName}!A:E` : (process.env.GOOGLE_SHEET_RANGE || 'Sheet1!A:E')
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end()
    return
  }
  const body = req.body
  if (!body || typeof body.id === 'undefined') {
    res.status(400).json({ error: 'missing payload' })
    return
  }
  const row = [body.id, body.selected_index, body.selected_text || '', body.worker_id || '', new Date().toISOString()]
  const sheetName = body.sheetName || body.sheet || null

  // If GOOGLE_SHEET_ID is configured, append to Google Sheets. Otherwise fallback to local CSV.
  if (process.env.GOOGLE_SHEET_ID) {
    try {
      await appendToSheet(row, sheetName)
      return res.status(200).json({ status: 'ok', saved: 'google_sheet', sheet: sheetName || null })
    } catch (err) {
      console.error('Google Sheets append failed:', err)
      // fallback to local file
    }
  }
}
