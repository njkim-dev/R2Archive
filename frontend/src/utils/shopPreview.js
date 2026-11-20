export const canPreviewItem = item => !!(item?.preview_available && item?.model || item?.couple_preview?.motion && item?.couple_preview?.audio || item?.effect_preview)

export function startCoupleAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext
  let audioContext, audioReady
  try {
    audioContext = new Audio()
    audioReady = audioContext.resume().then(() => true, () => false)
  } catch {
    audioReady = Promise.resolve(false)
  }
  return { audioContext, audioReady, started: true }
}
