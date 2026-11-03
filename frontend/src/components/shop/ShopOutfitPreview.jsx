import { lockShopScroll } from './shopModalScroll'
import { useLayoutEffect, useRef } from 'react'
import { Copy, X } from 'lucide-react'

export default function ShopOutfitPreview({ onClose, onCopy, children, tools, headerTools, saveTools, onDialog, className = '' }) {
  const dialog = useRef(null)
  useLayoutEffect(() => {
    const node = dialog.current, release = lockShopScroll()
    node.showModal()
    onDialog?.(node)
    return () => { onDialog?.(null); node.close(); release() }
  }, [])
  return <dialog ref={dialog} className={`shop-couple-dialog shop-outfit-dialog ${className}`} aria-label="의상 미리보기" onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="shop-couple-heading shop-preview-toolbar"><h2>의상 미리보기</h2><div className="shop-couple-actions">{headerTools}{saveTools}{onCopy && <button aria-label="의상 URL 복사" onClick={onCopy}><Copy size={16} /><span>URL 복사</span></button>}<button aria-label="의상 미리보기 닫기" onClick={onClose}><X size={22} /><span>닫기</span></button></div></div>
    {children}{tools}
  </dialog>
}
