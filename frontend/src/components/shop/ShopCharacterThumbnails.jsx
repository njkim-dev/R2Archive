import { useEffect,useRef,useState } from 'react'
import ShopViewer from './ShopViewer'
import { saveCharacterThumbnail } from '../../api/shopCharacters'
import { SHOP_SLOTS } from '../../utils/shopUrl'
const noCounterparts={}

export default function ShopCharacterThumbnails({characters,meta}){
  const [entry,setEntry]=useState(null),attempted=useRef(new Set()),[epoch,setEpoch]=useState(0)
  useEffect(()=>{
    if(!meta||entry)return
    const next=characters.items.find(item=>!item.thumbnail&&!attempted.current.has(item.character.id+':'+item.thumbnail_key))
    if(next){attempted.current.add(next.character.id+':'+next.thumbnail_key);setEntry(next)}
  },[characters.items,meta,entry,epoch])
  const chosen=useRef(null)
  if(entry&&chosen.current?.key!==entry.thumbnail_key)chosen.current={key:entry.thumbnail_key,slots:Object.fromEntries(SHOP_SLOTS.map(slot=>{const item=entry.mains.find(main=>main.slot===slot)?.item;return[slot,item?.preview_available&&item.model?item:null]}))}
  async function ready(canvas){
    const current=entry
    try{const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82));if(blob)await saveCharacterThumbnail(current.character.id,current.thumbnail_key,blob,meta.revision);characters.reload()}catch{}finally{setEntry(null);setEpoch(x=>x+1)}
  }
  if(!entry||!meta)return null
  return <div className="shop-thumbnail-renderer" aria-hidden="true"><ShopViewer key={entry.character.id+entry.thumbnail_key} meta={meta} sex={entry.character.sex} slots={chosen.current.slots} counterparts={noCounterparts} pair={false} angle={180} zoom={100} onViewChange={()=>{}} disposeContext onReady={ready} onFailure={()=>setEntry(null)}/></div>
}
