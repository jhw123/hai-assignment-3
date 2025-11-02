import { loadQuestions } from '../_helpers'

export default function handler(req, res) {
  const { id } = req.query
  const qs = loadQuestions()
  const idx = parseInt(Array.isArray(id)? id[0]: id, 10)
  if (Number.isNaN(idx) || idx < 0 || idx >= qs.length) {
    res.status(404).end()
    return
  }
  res.status(200).json(qs[idx])
}
