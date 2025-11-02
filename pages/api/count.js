import { loadQuestions } from './_helpers'

export default function handler(req, res) {
  const qs = loadQuestions()
  res.status(200).json({ count: qs.length })
}
