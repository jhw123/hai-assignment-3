import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'
import katex from 'katex'
import sanitizeHtml from 'sanitize-html'

// Normalize Unicode characters that KaTeX doesn't accept (smart quotes, non-breaking spaces, unicode minus, dashes)
function normalizeLatexInput(s) {
  if (s == null) return ''
  return String(s)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u00A0/g, ' ')
    // collapse double-escaped backslashes which sometimes appear after CSV parsing/escaping
    .replace(/\\\\/g, '\\')
    .trim()
}

const DATA_PATH = path.join(process.cwd(), 'data.csv')
let CACHE = null

function parseChoices(raw) {
  if (!raw) return []
  // Normalize doubled quotes (from CSV escaping) and try JSON parse
  try {
    const attempt = raw.replace(/""/g, '"')
    return JSON.parse(attempt)
  } catch (e) {
    // Fallback: use regex to extract quoted strings
    const m = raw.match(/"([^"]+)"/g) || raw.match(/'([^']+)'/g)
    if (m) return m.map(s => s.replace(/^"|"$/g, ''))
    // Final fallback: strip brackets and split
    const inner = raw.replace(/^\s*\[\s*/, '').replace(/\s*\]\s*$/, '')
    return inner.split(',').map(s=>s.trim().replace(/^"|"$/g,''))
  }
}

export function loadQuestions() {
  if (CACHE) return CACHE
  if (!fs.existsSync(DATA_PATH)) { CACHE = []; return CACHE }
  const content = fs.readFileSync(DATA_PATH, 'utf8')
  const parsed = Papa.parse(content, { header: true, skipEmptyLines: true }).data
  // helper: escape text then replace $...$ / $$...$$ with katex-rendered HTML
  function renderMathToHTML(text) {
    if (!text) return ''
      // Detect bare LaTeX patterns (prefer backslash commands) but avoid treating long prose as math.
      // If the whole string is a single math expression wrapped in $...$ or $$...$$, strip
      // those delimiters before testing/rendering. This fixes cases like "$5\\sqrt{5}$".
      const sText = String(text)
      // strip matching surrounding $ or $$ if present
      let inner = sText
      if (sText.startsWith('$$') && sText.endsWith('$$') && sText.length > 4) {
        inner = sText.slice(2, -2)
      } else if (sText.startsWith('$') && sText.endsWith('$') && sText.length > 2) {
        inner = sText.slice(1, -1)
      }
      const hasBackslashCommand = /\\[a-zA-Z]+/.test(inner)
      const noSpaces = /^\S+$/.test(inner)
      const shortMathLike = inner.length < 60 && /^[\s0-9A-Za-z\\{}\^_\/\+\-\(\)\[\]=:,.;%]+$/.test(inner)
      // Only treat as a full bare-LaTeX expression when it's short/math-like, or when it
      // contains a backslash command and has no spaces (e.g. "5\\sqrt{5}" or "\\frac{7}{9}").
      if ((hasBackslashCommand && noSpaces) || shortMathLike) {
        try {
          const normText = normalizeLatexInput(inner)
          const mathHtml = katex.renderToString(normText, { displayMode: false, throwOnError: true })
          const cleanMath = sanitizeHtml(mathHtml, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['span', 'div']),
            allowedAttributes: { '*': ['class', 'style'] }
          })
          return cleanMath
        } catch (e) {
          // fall through to escaping + replacement below
        }
      }

    // Work on the raw text: replace display and inline math first, then sanitize the whole result.
    const raw = String(text)
    // Replace display math $$...$$
    let out = raw.replace(/\$\$([\s\S]+?)\$\$/g, (m, expr) => {
      try {
        const normExpr = normalizeLatexInput(expr)
        return katex.renderToString(normExpr, { displayMode: true, throwOnError: true })
      } catch (e) {
        return m
      }
    })
    // Replace inline math $...$
    out = out.replace(/\$([^\$]+?)\$/g, (m, expr) => {
      try {
        // trim the captured expression and normalize escaped backslashes
        const normExpr = normalizeLatexInput(String(expr).replace(/\\\\/g, '\\').trim())
        return katex.renderToString(normExpr, { displayMode: false, throwOnError: true })
      } catch (e) {
        return m
      }
    })

    // Sanitize KaTeX output but allow classes on spans/divs (KaTeX uses <span class="katex">)
    const clean = sanitizeHtml(out, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['span', 'div']),
      allowedAttributes: {
        '*': ['class', 'style']
      }
    })
    return clean
  }

  CACHE = parsed.map((row, i) => {
    const q = row.question || row.Question || ''
    const choicesRaw = row.choices || row.Choices || '[]'
    const choices = parseChoices(choicesRaw)
    // use the CSV row index as the canonical id (0-based)
    // optional explanation column (support several common names)
    const explanation = row.explanation || row.Explanation || row.explain || row.ExplanationText || ''
    return { id: i, question: q, choices, explanation }
  })
  return CACHE
}
