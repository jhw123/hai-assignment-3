import { useEffect, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

function renderMathToHTMLClient(text) {
  if (!text) return ''
  const normalizeLatexInput = (x) => String(x)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u00A0/g, ' ')
    .trim()

  // collapse double-escaped backslashes (CSV/JSON escaping can produce "\\\\sqrt")
  let raw = String(text).replace(/\\\\/g, '\\')
  // helper to escape non-math text for safe insertion
  const escapeHtml = (str) => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  // If the whole string is wrapped in $$...$$ or $...$, render that directly.
  const trimmed = raw.trim()
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length>4) {
    const inner = normalizeLatexInput(trimmed.slice(2, -2))
    try { return katex.renderToString(inner, { displayMode: true, throwOnError: true }) } catch (e) { return escapeHtml(trimmed) }
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length>2) {
    const inner = normalizeLatexInput(trimmed.slice(1, -1))
    try { return katex.renderToString(inner, { displayMode: false, throwOnError: true }) } catch (e) { return escapeHtml(trimmed) }
  }

  // Heuristic: if entire string is short and math-like or is a single backslash command expression, render whole string without $ delimiters.
  const innerNoDelim = normalizeLatexInput(raw)
  const hasBackslashCommand = /\\[a-zA-Z]+/.test(innerNoDelim)
  const noSpaces = /^\S+$/.test(innerNoDelim)
  const shortMathLike = innerNoDelim.length < 60 && /^[\s0-9A-Za-z\\{}\^_\/\+\-\(\)\[\]=:,.;%]+$/.test(innerNoDelim)
  if ((hasBackslashCommand && noSpaces) || shortMathLike) {
    try { return katex.renderToString(innerNoDelim, { displayMode: false, throwOnError: true }) } catch (e) { /* fall through to inline replacement */ }
  }

  // Replace display math $$...$$ first, then inline $...$, leaving other text escaped.
  // We'll build the output by walking the string and replacing math spans.
  let out = ''
  const displayRegex = /\$\$([\s\S]+?)\$\$/g
  const inlineRegex = /\$([^\$]+?)\$/g

  // Helper to process a region of text with inline replacements (for simplicity, run inline replacement on the chunk)
  function processChunk(chunk) {
    // We must extract inline math from the RAW chunk (before escaping) so that
    // characters like '>' and '<' are passed to KaTeX, not HTML entities (&gt;/&lt;).
    let out = ''
    let last = 0
    let m
    // Reset regex state
    inlineRegex.lastIndex = 0
    while ((m = inlineRegex.exec(chunk)) !== null) {
      // text before the math - escape it
      out += escapeHtml(chunk.slice(last, m.index))
      const expr = m[1]
      try {
        const norm = normalizeLatexInput(String(expr).replace(/\\\\/g, '\\').trim())
        out += katex.renderToString(norm, { displayMode: false, throwOnError: true })
      } catch (e) {
        out += escapeHtml(m[0])
      }
      last = inlineRegex.lastIndex
    }
    // remainder
    out += escapeHtml(chunk.slice(last))
    return out
  }

  // First handle display math
  let lastIndex = 0
  let match
  while ((match = displayRegex.exec(raw)) !== null) {
    const idx = match.index
    out += processChunk(raw.slice(lastIndex, idx))
    try {
      const inner = normalizeLatexInput(match[1])
      out += katex.renderToString(inner, { displayMode: true, throwOnError: true })
    } catch (e) {
      out += escapeHtml(match[0])
    }
    lastIndex = displayRegex.lastIndex
  }
  out += processChunk(raw.slice(lastIndex))
  return out
}

export default function AiPage() {
  const SESSION_LIMIT = 10
  const [total, setTotal] = useState(0)
  const [current, setCurrent] = useState(0)
  const [question, setQuestion] = useState(null)
  const [selected, setSelected] = useState(null)
  const [workerId, setWorkerId] = useState('')
  const [solvedCount, setSolvedCount] = useState(0)

  useEffect(() => {
    // Get count and next unanswered index
    fetch('/api/count').then(r => r.json()).then(j => {
      setTotal(j.count || 0)
      // ask progress for the ai sheet specifically
      fetch('/api/progress?sheet=ai').then(r2 => r2.json()).then(p => {
        if (typeof p.nextIndex === 'number') setCurrent(Math.max(0, Math.min(j.count - 1, p.nextIndex)))
      }).catch(()=>{})
    }).catch(()=>{})
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const wid = params.get('workerId') || params.get('workerid') || params.get('worker')
      if (wid) setWorkerId(wid)
    }
    // redirect to completion if already solved 10 or more
    if (typeof window !== 'undefined') {
      try {
        const solved = JSON.parse(localStorage.getItem('solvedIds') || '[]')
        const count = Array.isArray(solved) ? solved.length : 0
        setSolvedCount(count)
        if (count >= SESSION_LIMIT) {
          window.location.href = '/done'
        }
      } catch (e) {}
    }
  }, [])

  useEffect(() => { if (total>0) loadQuestion(current) }, [total, current])

  async function loadQuestion(idx){
    const res = await fetch(`/api/question/${idx}`)
    if (!res.ok) { setQuestion(null); return }
    const j = await res.json()
    setQuestion(j)
    setSelected(null)
  }

  async function submit(){
    if (selected===null) { alert('Choose an option'); return }
    const payload = {
      id: question.id,
      selected_index: Number(selected),
      selected_text: question.choices[Number(selected)],
      worker_id: workerId || ''
    }
  // Tell the server to save this response to the 'ai' sheet
  payload.sheetName = 'ai'
  const res = await fetch('/api/submit', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)})
    if (res.ok) {
      // update local solvedIds (avoid double-counting same question)
      try {
        const key = 'solvedIds'
        const raw = localStorage.getItem(key) || '[]'
        const arr = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []
        if (!arr.includes(question.id)) {
          arr.push(question.id)
          localStorage.setItem(key, JSON.stringify(arr))
        }
        const count = arr.length
        setSolvedCount(count)
        if (count >= SESSION_LIMIT) {
          window.location.href = '/done'
          return
        }
      } catch (e) {}
      setTimeout(() => { setCurrent(c => Math.min(total - 1, c + 1)) }, 150)
      alert('Saved — moving to next')
    } else {
      alert('Save failed')
    }
  }

  return (
    <div style={{fontFamily:'-apple-system, Roboto, Arial', maxWidth:900, margin:'40px auto', padding:20}}>
<div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>Question {current+1}</div>
        <div>Progress: {solvedCount} / {SESSION_LIMIT}</div>
      </div>

      <div style={{marginTop:8}}>
        <label>
          Worker ID:{' '}
          <input value={workerId} onChange={e=>setWorkerId(e.target.value)} placeholder="optional worker id" style={{marginLeft:8}} />
        </label>
      </div>

      <div style={{marginTop:16}}>
        <div style={{fontSize:18, minHeight:80}} dangerouslySetInnerHTML={{ __html: question ? renderMathToHTMLClient(question.question) : 'Loading...' }} />
        <div style={{marginTop:8}}>
          {question && question.choices.map((c,i)=> (
            <div key={i} style={{margin:'8px 0'}}>
              <label>
                <input type="radio" name="choice" value={i} checked={selected==i} onChange={()=>setSelected(i)} />
                <span style={{marginLeft:8}} dangerouslySetInnerHTML={{__html: renderMathToHTMLClient(c) }} />
              </label>
            </div>
          ))}
        </div>

        <div style={{marginTop:12, padding:10, background:'#f9f9f9', border:'1px solid #eee'}}>
          <strong>Explanation</strong>
          <div style={{marginTop:8}} dangerouslySetInnerHTML={{__html: question && question.explanation ? renderMathToHTMLClient(question.explanation) : '<em>No explanation provided</em>'}} />
        </div>
      </div>

      <div style={{marginTop:16}}>
        <button onClick={()=> setCurrent(Math.max(0,current-1))}>Previous</button>
        <button onClick={submit} style={{marginLeft:8}}>Submit</button>
        <button onClick={()=> setCurrent(Math.min(total-1,current+1))} style={{marginLeft:8}}>Next</button>
      </div>
    </div>
  )
}
