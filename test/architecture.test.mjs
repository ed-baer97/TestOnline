import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Слои сверху вниз. Импорт разрешён внутри слоя и в перечисленные нижние слои.
const server = {
  dir: 'server/src',
  layers: [
    ['entry', /^(index|app)\.js$/],
    ['transport', /^transport\//],
    ['services', /^services\//],
    ['repositories', /^repositories\//],
    ['domain', /^domain\//],
    ['infrastructure', /^infrastructure\//],
  ],
  allowed: {
    entry: ['transport', 'infrastructure'],
    transport: ['services', 'infrastructure'],
    services: ['repositories', 'domain', 'infrastructure'],
    repositories: ['domain', 'infrastructure'],
    domain: [],
    infrastructure: [],
  },
}

const client = {
  dir: 'client/src',
  layers: [
    ['entry', /^(main\.jsx|styles\.css)$/],
    ['app', /^app\//],
    ['pages', /^pages\//],
    ['components', /^components\//],
    ['state', /^state\//],
    ['api', /^api\//],
    ['lib', /^lib\//],
  ],
  allowed: {
    entry: ['app'],
    app: ['pages', 'components', 'state', 'lib'],
    pages: ['components', 'state', 'lib'],
    components: ['state', 'lib'],
    state: ['api', 'lib'],
    api: [],
    lib: [],
  },
}

function sourceFiles(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...sourceFiles(full))
    else if (/\.(js|jsx|mjs|css)$/.test(entry.name)) out.push(full)
  }
  return out
}

function relativeImports(code) {
  const found = []
  const patterns = [
    /\bimport\s+(?:[^'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g,
    /\bexport\s+[^'"]*?\s+from\s+['"](\.{1,2}\/[^'"]+)['"]/g,
    /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    for (const match of code.matchAll(pattern)) found.push(match[1])
  }
  return found
}

function layerOf(spec, file) {
  const match = spec.layers.find(([, pattern]) => pattern.test(file))
  return match ? match[0] : null
}

function graph(spec) {
  const base = path.join(root, spec.dir)
  const files = sourceFiles(base).map((full) => path.relative(base, full).split(path.sep).join('/'))
  const edges = new Map()
  for (const file of files) {
    if (file.endsWith('.css')) {
      edges.set(file, [])
      continue
    }
    const code = fs.readFileSync(path.join(base, file), 'utf8')
    const targets = relativeImports(code).map((target) => path.posix.normalize(path.posix.join(path.posix.dirname(file), target)))
    edges.set(file, targets)
  }
  return { base, files, edges }
}

function layerViolations(spec) {
  const { files, edges } = graph(spec)
  const problems = []
  for (const file of files) {
    const from = layerOf(spec, file)
    if (!from) {
      problems.push(`${spec.dir}/${file}: файл вне слоёв`)
      continue
    }
    for (const target of edges.get(file)) {
      if (!files.includes(target)) {
        problems.push(`${spec.dir}/${file}: импорт несуществующего ${target}`)
        continue
      }
      const to = layerOf(spec, target)
      if (to && to !== from && !spec.allowed[from].includes(to)) {
        problems.push(`${spec.dir}/${file} (${from}) → ${target} (${to})`)
      }
    }
  }
  return problems
}

function cycles(spec) {
  const { files, edges } = graph(spec)
  const state = new Map()
  const stack = []
  const found = []
  function visit(file) {
    state.set(file, 'open')
    stack.push(file)
    for (const target of edges.get(file) || []) {
      if (state.get(target) === 'open') found.push([...stack.slice(stack.indexOf(target)), target].join(' → '))
      else if (!state.has(target)) visit(target)
    }
    stack.pop()
    state.set(file, 'done')
  }
  for (const file of files) if (!state.has(file)) visit(file)
  return found
}

function filesMatching(spec, pattern, allowedPrefixes) {
  const { base, files } = graph(spec)
  return files
    .filter((file) => !file.endsWith('.css') && !allowedPrefixes.some((prefix) => file.startsWith(prefix)))
    .filter((file) => pattern.test(fs.readFileSync(path.join(base, file), 'utf8')))
    .map((file) => `${spec.dir}/${file}`)
}

for (const spec of [server, client]) {
  test(`${spec.dir}: зависимости только сверху вниз`, () => {
    assert.deepEqual(layerViolations(spec), [])
  })

  test(`${spec.dir}: нет циклических импортов`, () => {
    assert.deepEqual(cycles(spec), [])
  })
}

test('server/src: SQL только в репозиториях и схеме базы', () => {
  assert.deepEqual(filesMatching(server, /['"`]\s*(SELECT|INSERT|UPDATE|DELETE)\s/, ['repositories/', 'infrastructure/db/']), [])
})

test('server/src: сервисы и HTTP не ходят в базу мимо репозиториев', () => {
  assert.deepEqual(filesMatching(server, /infrastructure\/db\//, ['repositories/', 'infrastructure/']), [])
})

test('client/src: fetch только в api/, sessionStorage и localStorage только в state/', () => {
  assert.deepEqual(filesMatching(client, /\bfetch\(/, ['api/']), [])
  assert.deepEqual(filesMatching(client, /\b(sessionStorage|localStorage)\b/, ['state/']), [])
})
