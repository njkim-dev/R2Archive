import { useEffect, useRef } from 'react'

const limit = (value, min, max) => Math.round(Math.min(max, Math.max(min, value)) * 100) / 100
export default function usePreviewInteraction(canvas, angle, zoom, panX, panY, mode, onChange) {
  const current = useRef(null)
  current.current = { angle, zoom, panX, panY, mode, onChange }
  useEffect(() => {
    const node = canvas.current, pointers = new Map()
    let gesture = null, frame = 0, pending = null
    const view = () => pending || current.current
    const update = next => {
      pending = { ...view(), ...next }
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0
        const value = pending; pending = null
        current.current = { ...current.current, angle: value.angle, zoom: value.zoom, panX: value.panX, panY: value.panY }
        current.current.onChange?.({ angle: value.angle, zoom: value.zoom, panX: value.panX, panY: value.panY })
      })
    }
    const rebase = () => {
      const points = [...pointers.values()], camera = view()
      gesture = points.length >= 2 ? { kind: 'pinch', distance: Math.max(1, Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)), zoom: camera.zoom } : points.length ? { kind: camera.mode, ...points[0], angle: camera.angle, panX: camera.panX, panY: camera.panY } : null
      if (gesture) node.dataset.dragging = 'true'; else delete node.dataset.dragging
    }
    const down = event => {
      if (event.button !== 0 || !current.current.onChange || pointers.size >= 2) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      node.setPointerCapture(event.pointerId); rebase()
    }
    const move = event => {
      if (!pointers.has(event.pointerId)) return
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (pointers.size >= 2) {
        const points = [...pointers.values()], distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
        update({ zoom: limit(gesture.zoom * distance / gesture.distance, 75, 135) })
      } else if (gesture.kind !== current.current.mode) rebase()
      else if (gesture.kind === 'move') update({ panX: limit(gesture.panX + (event.clientX - gesture.x) / Math.max(1, node.clientWidth) * 100, -75, 75), panY: limit(gesture.panY + (event.clientY - gesture.y) / Math.max(1, node.clientHeight) * 100, -75, 75) })
      else update({ angle: ((gesture.angle + (event.clientX - gesture.x) * .5) % 360 + 360) % 360 })
    }
    const up = event => {
      if (!pointers.delete(event.pointerId)) return
      if (node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId)
      rebase()
    }
    const reset = () => { const ids = [...pointers.keys()]; pointers.clear(); gesture = null; delete node.dataset.dragging; for (const id of ids) if (node.hasPointerCapture(id)) node.releasePointerCapture(id) }
    const wheel = event => {
      if (!current.current.onChange) return
      event.preventDefault()
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1)
      update({ zoom: limit(view().zoom * Math.exp(-Math.min(300, Math.max(-300, pixels)) * .0015), 75, 135) })
    }
    const key = event => {
      const camera = view()
      if (!camera.onChange) return
      if (camera.mode === 'move' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); update({ panX: limit(camera.panX + (event.key === 'ArrowLeft' ? -2 : event.key === 'ArrowRight' ? 2 : 0), -75, 75), panY: limit(camera.panY + (event.key === 'ArrowUp' ? -2 : event.key === 'ArrowDown' ? 2 : 0), -75, 75) })
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); update({ angle: (camera.angle + (event.key === 'ArrowLeft' ? 355 : 5)) % 360 }) }
      if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); update({ zoom: limit(camera.zoom + (event.key === '-' ? -5 : 5), 75, 135) }) }
    }
    node.addEventListener('pointerdown', down); node.addEventListener('pointermove', move)
    node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up); node.addEventListener('lostpointercapture', up)
    node.addEventListener('wheel', wheel, { passive: false }); node.addEventListener('keydown', key); window.addEventListener('blur', reset)
    return () => {
      cancelAnimationFrame(frame); reset()
      node.removeEventListener('pointerdown', down); node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up); node.removeEventListener('lostpointercapture', up)
      node.removeEventListener('wheel', wheel); node.removeEventListener('keydown', key); window.removeEventListener('blur', reset)
    }
  }, [canvas])
}
