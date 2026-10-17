import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export const HASH_CHUNK_BYTES = 4 * 1024 * 1024

export async function hashFileChunks(file, onProgress = () => {}, signal) {
  const hash = sha256.create()
  try {
    signal?.throwIfAborted()
    for (let offset = 0; offset < file.size; offset += HASH_CHUNK_BYTES) {
      signal?.throwIfAborted()
      const end = Math.min(offset + HASH_CHUNK_BYTES, file.size)
      const chunk = await file.slice(offset, end).arrayBuffer()
      signal?.throwIfAborted()
      if (chunk.byteLength !== end - offset) throw new Error('파일을 끝까지 읽지 못했습니다.')
      hash.update(new Uint8Array(chunk))
      onProgress(end, file.size)
    }
    signal?.throwIfAborted()
    return bytesToHex(hash.digest())
  } finally { hash.destroy() }
}
