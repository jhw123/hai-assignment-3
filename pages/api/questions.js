import { loadQuestions } from './_helpers'

export default function handler(req, res) {
  const qs = loadQuestions()
  // Return the array of questions (id, question, choices, optional explanation)
  res.status(200).json(qs)
}
