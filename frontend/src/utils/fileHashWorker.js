export function createFileHasher() {
  const worker = new Worker(new URL('../workers/fileHash.worker.js', import.meta.url), { type: 'module' })
  let pending = null
  let fatalError = null
  const finish = (error, digest) => {
    if (!pending) return
    const current = pending
    pending = null
    current.signal?.removeEventListener('abort', current.abort)
    if (error) current.reject(error)
    else current.resolve(digest)
  }
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') pending?.onProgress(data.bytes, data.total)
    else if (data.type === 'complete') finish(null, data.digest)
    else if (data.type === 'error') finish(new Error(data.message))
  }
  worker.onerror = event => {
    fatalError = Object.assign(new Error(event.message || 'SHA-256 검사 작업을 시작하지 못했습니다.'), { name: 'WorkerError' })
    finish(fatalError)
    worker.terminate()
  }
  return {
    hash(file, onProgress = () => {}, signal) {
      if (fatalError) return Promise.reject(fatalError)
      if (signal?.aborted) return Promise.reject(new DOMException('검사를 취소했습니다.', 'AbortError'))
      return new Promise((resolve, reject) => {
        const abort = () => {
          worker.terminate()
          finish(new DOMException('검사를 취소했습니다.', 'AbortError'))
        }
        pending = { resolve, reject, onProgress, signal, abort }
        signal?.addEventListener('abort', abort, { once: true })
        try { worker.postMessage({ file }) } catch (error) { finish(error) }
      })
    },
    close() { worker.terminate() },
  }
}
