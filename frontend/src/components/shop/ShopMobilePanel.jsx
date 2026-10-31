import { lockShopScroll } from './shopModalScroll'
import { useLayoutEffect, useRef } from 'react'

export default function ShopMobilePanel({ open, onClose, children }) {
  const dialog = useRef(null)
  useLayoutEffect(() => {
    const node = dialog.current
    if (!open) return
    const release = lockShopScroll()
    node.showModal()
    return () => { node.close(); release() }
  }, [open])
  return <dialog ref={dialog} className="shop-mobile-panel" aria-label="아이템 현황" onCancel={event => { event.preventDefault(); onClose() }} onClick={event => {
    if (event.target !== event.currentTarget) return
    const box = event.currentTarget.getBoundingClientRect()
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose()
  }}>{children}</dialog>
}
