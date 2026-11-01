import {useEffect,useLayoutEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import '../styles/tooltip.css'

const id='r2-app-tooltip'
export default function AppTooltip(){
  const [current,setCurrent]=useState(null),tip=useRef(null),closeTimer=useRef(null)
  useEffect(()=>{
    const cancel=()=>clearTimeout(closeTimer.current)
    const close=()=>{cancel();closeTimer.current=setTimeout(()=>setCurrent(null),120)}
    const element=target=>target instanceof Element?target.closest('[data-tooltip]'):null
    const over=event=>{
      if(event.pointerType==='touch')return
      if(tip.current?.contains(event.target)){cancel();return}
      const anchor=element(event.target),text=anchor?.getAttribute('data-tooltip')
      if(text){cancel();setCurrent(old=>old?.anchor===anchor&&old.text===text?old:{anchor,text})}else close()
    }
    const out=event=>{const next=event.relatedTarget;if(next instanceof Node&&(tip.current?.contains(next)||element(event.target)?.contains(next)))return;close()}
    const focus=event=>{const anchor=element(event.target),text=anchor?.getAttribute('data-tooltip');cancel();setCurrent(text?{anchor,text}:null)}
    document.addEventListener('pointerover',over,true);document.addEventListener('pointerout',out,true);document.addEventListener('focusin',focus,true);document.addEventListener('focusout',close,true)
    return()=>{cancel();document.removeEventListener('pointerover',over,true);document.removeEventListener('pointerout',out,true);document.removeEventListener('focusin',focus,true);document.removeEventListener('focusout',close,true)}
  },[])
  useLayoutEffect(()=>{
    if(!current)return
    const node=tip.current,anchor=current.anchor;let frame=0
    if(!node||!anchor.isConnected){setCurrent(null);return}
    const described=new Set((anchor.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean));described.add(id);anchor.setAttribute('aria-describedby',[...described].join(' '))
    if(typeof node.showPopover==='function')node.showPopover()
    const position=()=>{
      frame=0
      if(!anchor.isConnected){setCurrent(null);return}
      const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight,bounds=anchor.getBoundingClientRect()
      if(bounds.bottom<top||bounds.top>top+height||bounds.right<left||bounds.left>left+width){setCurrent(null);return}
      const belowSpace=Math.max(0,top+height-bounds.bottom-16),aboveSpace=Math.max(0,bounds.top-top-16)
      node.style.maxWidth=Math.max(1,Math.min(420,width-16))+'px';node.style.maxHeight=Math.max(1,Math.max(belowSpace,aboveSpace))+'px'
      const box=node.getBoundingClientRect(),x=Math.max(left+8,Math.min(bounds.left+(bounds.width-box.width)/2,left+width-box.width-8))
      const below=bounds.bottom+8,y=below+box.height<=top+height-8?below:Math.max(top+8,Math.min(bounds.top-box.height-8,top+height-box.height-8))
      node.style.left=x+'px';node.style.top=y+'px';node.style.visibility='visible'
      node.style.pointerEvents=node.scrollHeight>node.clientHeight+1?'auto':'none'
    }
    const update=()=>{if(!frame)frame=requestAnimationFrame(position)}
    const resize=new ResizeObserver(update);resize.observe(anchor);resize.observe(node)
    const changes=new MutationObserver(()=>{const text=anchor.getAttribute('data-tooltip');if(!anchor.isConnected||!text)setCurrent(null);else if(text!==current.text)setCurrent({anchor,text})});changes.observe(document.body,{childList:true,subtree:true});changes.observe(anchor,{attributes:true,attributeFilter:['data-tooltip']})
    const escape=event=>{if(event.key==='Escape')setCurrent(null)}
    document.addEventListener('keydown',escape,true);window.addEventListener('resize',update);document.addEventListener('scroll',update,true);window.visualViewport?.addEventListener('resize',update);window.visualViewport?.addEventListener('scroll',update);position()
    return()=>{
      cancelAnimationFrame(frame);resize.disconnect();changes.disconnect();document.removeEventListener('keydown',escape,true);window.removeEventListener('resize',update);document.removeEventListener('scroll',update,true);window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update)
      const remaining=(anchor.getAttribute('aria-describedby')||'').split(/\s+/).filter(value=>value&&value!==id);if(remaining.length)anchor.setAttribute('aria-describedby',remaining.join(' '));else anchor.removeAttribute('aria-describedby')
      if(typeof node.hidePopover==='function'&&node.matches(':popover-open'))node.hidePopover()
    }
  },[current])
  if(!current)return null
  return createPortal(<div id={id} ref={tip} className="app-tooltip" role="tooltip" popover="manual">{current.text}</div>,current.anchor.closest('dialog[open]')||document.body)
}
