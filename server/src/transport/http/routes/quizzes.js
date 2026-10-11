import express from 'express'
import { createQuiz, deleteQuiz, getQuiz, listQuizzes, updateQuiz } from '../../../services/quizzes.js'
import { questionsFromXlsx, templateWorkbook } from '../../../services/quizExcel.js'
import { listResults, quizStats, statsOverview } from '../../../services/stats.js'
import { requireHost, route } from '../middleware.js'

export function registerQuizRoutes(app) {
  app.get('/api/stats', requireHost, route(async (req, res) => {
    res.json(await statsOverview(req.userId))
  }))

  app.get('/api/quizzes/:id/stats', requireHost, route(async (req, res) => {
    const stats = await quizStats(req.userId, req.params.id)
    if (!stats) {
      res.status(404).json({ error: 'Квиз не найден' })
      return
    }
    res.json(stats)
  }))

  app.get('/api/template', requireHost, async (_req, res) => {
    const buffer = await templateWorkbook()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="testonline-shablon.xlsx"')
    res.send(Buffer.from(buffer))
  })

  app.get('/api/quizzes', requireHost, route(async (req, res) => {
    res.json({ quizzes: await listQuizzes(req.userId) })
  }))

  app.get('/api/quizzes/:id', requireHost, route(async (req, res) => {
    const quiz = await getQuiz(req.params.id, req.userId)
    if (!quiz) {
      res.status(404).json({ error: 'Квиз не найден' })
      return
    }
    res.json(quiz)
  }))

  app.post('/api/import', requireHost, express.raw({ type: 'application/octet-stream', limit: '2mb' }), async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Файл пустой' })
        return
      }
      res.json({ questions: await questionsFromXlsx(req.body) })
    } catch (error) {
      res.status(error.status || 400).json({
        error: error.status ? error.message : 'Не удалось прочитать файл. Нужен Excel .xlsx',
      })
    }
  })

  app.post('/api/quizzes', requireHost, route(async (req, res) => {
    try {
      res.status(201).json(await createQuiz(req.userId, req.body))
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  }))

  app.put('/api/quizzes/:id', requireHost, route(async (req, res) => {
    try {
      const quiz = await updateQuiz(req.params.id, req.userId, req.body)
      if (!quiz) {
        res.status(404).json({ error: 'Квиз не найден' })
        return
      }
      res.json(quiz)
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  }))

  app.delete('/api/quizzes/:id', requireHost, route(async (req, res) => {
    if (!(await deleteQuiz(req.params.id, req.userId))) {
      res.status(404).json({ error: 'Квиз не найден' })
      return
    }
    res.json({ ok: true })
  }))

  app.get('/api/results', requireHost, route(async (req, res) => {
    res.json({ results: await listResults(req.userId) })
  }))
}
