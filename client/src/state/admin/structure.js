import { useEffect, useState } from 'react'
import { api } from '../../api/index.js'

const actions = {
  createClass: (body) => api.createClass(body),
  updateClass: (id, body) => api.updateClass(id, body),
  deleteClass: (id) => api.deleteClass(id),
  updateTrack: (id, body) => api.updateTrack(id, body),
  deleteTrack: (id) => api.deleteTrack(id),
}

// Дерево классов организации. Изменения идут через run: он сбрасывает сообщения и перечитывает дерево.
export function useClassTree() {
  const [tree, setTree] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [trackName, setTrackName] = useState('')

  function load() {
    return api.structure().then(setTree)
  }

  useEffect(() => {
    load().catch((err) => setError(err.message))
  }, [])

  async function run(action) {
    setError('')
    setNotice('')
    try {
      await action()
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function addTrack(event) {
    event.preventDefault()
    await run(async () => {
      await api.createTrack({ name: trackName })
      setTrackName('')
      setNotice('Курс создан')
    })
  }

  return { tree, error, notice, trackName, setTrackName, run, addTrack, actions }
}
