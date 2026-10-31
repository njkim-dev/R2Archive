import { useEffect, useRef } from 'react'

export default function usePreviewInteraction(canvas, angle, zoom, onChange) {
  const current = useRef({ angle, zoom, onChange })
  current.current = { angle, zoom, onChange }
  useEffect(() => {
    const node = canvas.current
    let drag = null, frame = 0, pending = null
    const update = next => {
      pending = { ...(pending || current.current), ...next }
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; const view = pending; pending = null; current.current.onChange?.({ angle: view.angle, zoom: view.zoom }) })
    }
    const down = event => {
      if (event.button !== 0 || !current.current.onChange) return
      drag = { id: event.pointerId, x: event.clientX, angle: (pending || current.current).angle }
      node.setPointerCapture(event.pointerId); node.dataset.dragging = 'true'
    }
    const move = event => { if (drag?.id === event.pointerId) update({ angle: ((drag.angle + (event.clientX - drag.x) * .5) % 360 + 360) % 360 }) }
    const up = event => { if (drag?.id === event.pointerId) { drag = null; delete node.dataset.dragging; if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId) } }
    const wheel = event => {
      if (!current.current.onChange) return
      event.preventDefault()
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1)
      update({ zoom: Math.round(Math.min(135, Math.max(75, (pending || current.current).zoom * Math.exp(-Math.min(300, Math.max(-300, pixels)) * .0015))) * 100) / 100 })
    }
    const key = event => {
      const view = pending || current.current
      if (!view.onChange) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); update({ angle: (view.angle + (event.key === 'ArrowLeft' ? 355 : 5)) % 360 }) }
      if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); update({ zoom: Math.min(135, Math.max(75, view.zoom + (event.key === '-' ? -5 : 5))) }) }
    }
    node.addEventListener('pointerdown', down); node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up); node.addEventListener('lostpointercapture', up)
    node.addEventListener('wheel', wheel, { passive: false }); node.addEventListener('keydown', key)
    return () => {
      cancelAnimationFrame(frame)
      node.removeEventListener('pointerdown', down); node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up); node.removeEventListener('lostpointercapture', up)
      node.removeEventListener('wheel', wheel); node.removeEventListener('keydown', key)
    }
  }, [canvas])
}
