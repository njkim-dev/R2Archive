export function createShopImageCache({ maxEntries = 160, maxBytes = 12 * 1024 * 1024, maxConcurrent = 4, maxRetries = 2, retryDelay = attempt => 400 * (attempt + 1), fetcher = (...args) => fetch(...args), createUrl = blob => URL.createObjectURL(blob), revokeUrl = url => URL.revokeObjectURL(url) } = {}) {
  const entries = new Map()
  let queue = [], running = 0, bytes = 0, generation = 0
  const aborted = () => new DOMException('Image request cancelled', 'AbortError')
  function touch(entry) { entries.delete(entry.key); entries.set(entry.key, entry) }
  function trim() {
    for (const [key, entry] of entries) {
      if (entries.size <= maxEntries && bytes <= maxBytes) break
      if (entry.refs || !entry.url) continue
      revokeUrl(entry.url); bytes -= entry.size; entries.delete(key)
    }
  }
  async function run(entry) {
    running++
    entry.started = true
    try {
      let response
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        response = await fetcher(entry.key, { credentials: 'same-origin', cache: 'no-store', signal: entry.controller.signal })
        if (![429, 503].includes(response.status) || attempt === maxRetries) break
        if (!entry.refs || entry.generation !== generation) throw aborted()
        await new Promise((resolve, reject) => {
          const signal = entry.controller.signal
          const stop = () => { clearTimeout(timer); reject(aborted()) }
          const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve() }, retryDelay(attempt))
          if (signal.aborted) stop()
          else signal.addEventListener('abort', stop, { once: true })
        })
      }
      if (!response.ok) throw new Error(`Image request failed: ${response.status}`)
      const blob = await response.blob()
      if (entry.generation !== generation) throw aborted()
      entry.size = blob.size
      entry.url = createUrl(blob)
      bytes += entry.size
      touch(entry)
      entry.resolve(entry.url)
      trim()
    } catch (error) {
      if (entries.get(entry.key) === entry) entries.delete(entry.key)
      entry.reject(error)
    } finally { running--; drain() }
  }
  function drain() {
    while (running < maxConcurrent && queue.length) {
      const entry = queue.shift()
      if (entry.refs && entry.generation === generation) run(entry)
      else { if (entries.get(entry.key) === entry) entries.delete(entry.key); entry.reject(aborted()) }
    }
  }
  return {
    acquire(key) {
      let entry = entries.get(key)
      if (!entry) {
        entry = { key, refs: 0, size: 0, generation, controller: new AbortController() }
        entry.promise = new Promise((resolve, reject) => { entry.resolve = resolve; entry.reject = reject })
        entries.set(key, entry)
        queue.push(entry)
      }
      entry.refs++
      touch(entry)
      queueMicrotask(drain)
      let released = false
      return { promise: entry.promise, release() {
        if (released) return
        released = true
        entry.refs--
        if (!entry.refs && !entry.started && !entry.url) {
          queue = queue.filter(pending => pending !== entry)
          if (entries.get(entry.key) === entry) entries.delete(entry.key)
          entry.reject(aborted())
        }
        trim()
      } }
    },
    clear() {
      generation++
      for (const entry of entries.values()) { entry.controller.abort(); if (entry.url) revokeUrl(entry.url); entry.reject(aborted()) }
      entries.clear(); queue = []; bytes = 0
    },
    stats: () => ({ entries: entries.size, bytes, running, queued: queue.length }),
  }
}
