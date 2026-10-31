let owners = 0, savedOverflow, savedPadding

export function lockShopScroll() {
  const body = document.body
  if (owners++ === 0) {
    savedOverflow = body.style.overflow; savedPadding = body.style.paddingRight
    body.style.paddingRight = `${parseFloat(getComputedStyle(body).paddingRight) + window.innerWidth - document.documentElement.clientWidth}px`
    body.style.overflow = 'hidden'
  }
  let active = true
  return () => {
    if (!active) return
    active = false
    if (--owners === 0) { body.style.overflow = savedOverflow; body.style.paddingRight = savedPadding }
  }
}
