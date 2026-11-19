// Ответ с ошибкой превращается в Error с текстом сервера из поля error.
export async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await response.json().catch(() => ({}))
  const message = typeof data.error === 'string' ? data.error : ''
  if (!response.ok) throw new Error(message || `Ошибка запроса (${response.status})`)
  return data
}

// fetch не сообщает прогресс тела запроса, поэтому ролик отправляется через XHR.
export function uploadWithProgress(url, body, headers, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.withCredentials = true
    for (const [key, value] of Object.entries(headers)) xhr.setRequestHeader(key, value)
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    }
    xhr.onload = () => {
      let data
      try {
        data = JSON.parse(xhr.responseText || '{}')
      } catch {
        data = {}
      }
      const message = typeof data.error === 'string' ? data.error : ''
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(message || `Ошибка запроса (${xhr.status})`))
        return
      }
      resolve(data)
    }
    xhr.onerror = () => reject(new Error('Не удалось загрузить видео'))
    xhr.send(body)
  })
}
