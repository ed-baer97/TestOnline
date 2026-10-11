export function publicInfo(room) {
  return {
    code: room.code,
    title: room.quiz.title,
    status: room.status,
    playerCount: room.players.size,
    joinable: room.status === 'lobby',
  }
}

export function leaderboard(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .map((player, index) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      rank: index + 1,
      lastPoints: player.lastPoints,
      lastCorrect: player.lastCorrect,
    }))
}

function questionPayload(question, reveal) {
  const payload = {
    text: question.text,
    timeLimit: question.timeLimit,
    options: question.options.map((option, index) => ({ index, text: option.text })),
  }
  if (reveal) payload.correctIndex = question.correctIndex
  return payload
}

function optionCounts(room) {
  const question = room.quiz.questions[room.questionIndex]
  const counts = question.options.map(() => 0)
  for (const player of room.players.values()) {
    if (player.answered && player.answerIndex != null) counts[player.answerIndex] += 1
  }
  return counts
}

export function viewFor(room, viewer) {
  const question = room.questionIndex >= 0 ? room.quiz.questions[room.questionIndex] : null
  const reveal = room.status === 'reveal'
  const board = leaderboard(room)
  const showQuestion = room.status === 'question' || room.status === 'reveal'
  const base = {
    code: room.code,
    title: room.quiz.title,
    status: room.status,
    questionIndex: room.questionIndex,
    questionCount: room.quiz.questions.length,
    endsAt: room.status === 'question' ? room.endsAt : null,
    serverNow: Date.now(),
    playerCount: room.players.size,
    answeredCount: [...room.players.values()].filter((player) => player.answered).length,
  }

  if (viewer?.role === 'host') {
    return {
      ...base,
      role: 'host',
      players: [...room.players.values()]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((player) => ({
          id: player.id,
          name: player.name,
          score: player.score,
          online: player.online,
          answered: player.answered,
        })),
      question: showQuestion && question
        ? {
            ...questionPayload(question, reveal),
            optionCounts: reveal ? optionCounts(room) : undefined,
          }
        : null,
      leaderboard: board.slice(0, 50).map(({ name, score, rank }) => ({ name, score, rank })),
    }
  }

  const player = room.players.get(viewer?.playerId)
  const me = player ? board.find((entry) => entry.id === player.id) : null
  const top = board.slice(0, 5).map(({ name, score, rank }) => ({ name, score, rank }))
  return {
    ...base,
    role: 'player',
    me: player
      ? {
          name: player.name,
          score: player.score,
          answered: player.answered,
          answerIndex: room.status === 'question' || reveal ? player.answerIndex : null,
          lastPoints: reveal || room.status === 'podium' ? player.lastPoints : null,
          lastCorrect: reveal || room.status === 'podium' ? player.lastCorrect : null,
          rank: me?.rank ?? null,
        }
      : null,
    question: showQuestion && question ? questionPayload(question, reveal) : null,
    leaderboard: top,
  }
}

export function hostView(room) {
  return viewFor(room, { role: 'host' })
}

export function playerView(room, playerId) {
  return viewFor(room, { role: 'player', playerId })
}
