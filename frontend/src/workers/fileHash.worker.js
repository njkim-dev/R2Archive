import { hashFileChunks } from '../utils/fileSha256'

self.onmessage = async ({ data: { file } }) => {
  let lastProgress = 0
  try {
    const digest = await hashFileChunks(file, (bytes, total) => {
      const now = performance.now()
      if (now - lastProgress >= 100 || bytes === total) {
        self.postMessage({ type: 'progress', bytes, total })
        lastProgress = now
      }
    })
    self.postMessage({ type: 'complete', digest })
  } catch (error) { self.postMessage({ type: 'error', message: error.message }) }
}
