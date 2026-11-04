export function isAutomatedBrowser() {
  if (typeof navigator === 'undefined') return false
  return navigator.webdriver === true || /headlesschrome|playwright|r2archive-codex-test/i.test(navigator.userAgent || '')
}
