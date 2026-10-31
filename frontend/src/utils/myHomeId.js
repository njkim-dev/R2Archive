export function myHomeId(value) {
  const handle = value.normalize('NFC')
  const bytes = new TextEncoder().encode(handle).length
  const valid = /^[A-Za-z0-9\u1100-\u11ff\u3130-\u318f\uac00-\ud7af[\]_-]+$/.test(handle) && bytes <= 20
  return { handle, bytes, valid }
}
