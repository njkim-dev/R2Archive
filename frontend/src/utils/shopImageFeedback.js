const channelName = 'r2-shop-image-feedback'

export function notifyImageFeedback(searchId) {
  window.dispatchEvent(new CustomEvent(channelName, { detail: searchId }))
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(channelName)
  channel.postMessage(searchId)
  channel.close()
}

export function watchImageFeedback(refresh) {
  const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName)
  const changed = () => { if (!document.hidden) refresh() }
  if (channel) channel.onmessage = changed
  window.addEventListener(channelName, changed)
  window.addEventListener('focus', changed)
  document.addEventListener('visibilitychange', changed)
  const timer = setInterval(changed, 5000)
  return () => {
    clearInterval(timer); channel?.close()
    window.removeEventListener(channelName, changed)
    window.removeEventListener('focus', changed)
    document.removeEventListener('visibilitychange', changed)
  }
}
