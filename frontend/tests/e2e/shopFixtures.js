export const version = 'a'.repeat(20)
export const hash = 'c'.repeat(64)
export const root = `/api/shop/assets/${version}`
export const hero = { id: '1000208', version, name: '돌발모드(영웅)', category: '503', department: 'functional', sex: 'common', slot: null, preview_available: false, description: '장애물이 갑자기 출현합니다.', prices: [{ key: 'P1', label: '1일', amount: 1000, currency: 'cash' }, { key: 'P7', label: '7일', amount: 2000, currency: 'cash' }, { key: 'P30', label: '30일', amount: 4000, currency: 'cash' }], thumbnail: null }
export const shirt = { ...hero, id: '200', name: '검증 셔츠(남)', department: 'wearable', sex: 'male', slot: 'top', preview_available: true, model: `${root}/models/${'b'.repeat(64)}.json.gz`, counterpart_id: '201' }
export const femaleShirt = { ...shirt, id: '201', name: '검증 셔츠(여)', sex: 'female' }
export const pet = { ...shirt, id: '300', name: '검증 펫', sex: 'common', slot: 'pet', model: `${root}/models/${'c'.repeat(64)}.json.gz`, counterpart_id: null }
export const mesh = { meshes: [{ name: 'Waist', vertices: [-20, 20, 0, 0, 0, 1, 0, 0, 20, 20, 0, 0, 0, 1, 1, 0, 0, 280, 0, 0, 0, 1, .5, 1], indices: [0, 1, 2], texture: `${hash}.webp` }] }
export const petMesh = { meshes: [{ ...mesh.meshes[0], name: 'Pet-body', vertices: [-130, 30, 0, 0, 0, 1, 0, 0, -30, 30, 0, 0, 0, 1, 1, 0, -80, 140, 0, 0, 0, 1, .5, 1] }] }
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFUlEQVR4nGP8////fwYGBgYmEAHCAD34BABm6tHAAAAAAElFTkSuQmCC', 'base64')

export async function setup(page,{admin=true,loggedIn=true,metaGate,listGate,items,nextGate,models,texture=png,modelGate,textureRevision,favoriteIds=[],favoriteGate,authGate,wardrobeIds=[],wardrobeMains=[],wardrobeGate,wardrobeSaveGate,characters:initialCharacters}={}){
  page.on('pageerror',error=>{throw error})
  const requests=[],shortLinks=new Map(),savedFavorites=new Set(favoriteIds.map(String)),links=new Map()
  const allItems=()=>items||[shirt,femaleShirt,pet,hero]
  let characters=(initialCharacters||[{id:'1',name:'남성캐릭터',sex:'male'},{id:'2',name:'여성캐릭터',sex:'female'}]).map(source=>{
    const character=source.character||source
    return {character:{id:String(character.id),name:character.name,sex:character.sex},ids:new Set((source.ids||wardrobeIds.filter(id=>allItems().some(item=>item.id===String(id)&&[character.sex,'common'].includes(item.sex)))).map(String)),mains:new Map((source.mains||wardrobeMains.filter(main=>main.sex===character.sex)).map(main=>[main.slot,main])),image:source.image!==false}
  })
  const state=entry=>{
    const key=(entry.character.id+[...entry.mains.values()].map(main=>main.item.id).sort().join('')).padEnd(24,'0').slice(0,24)
    return {character:entry.character,ids:[...entry.ids],mains:[...entry.mains.values()],thumbnail_key:key,thumbnail:entry.image?`/api/shop/characters/${entry.character.id}/thumbnail?key=${key}`:null}
  }
  const union=()=>[...new Set(characters.flatMap(entry=>[...entry.ids]))]
  requests.wardrobe=()=>characters[0]?state(characters[0]):{ids:[],mains:[]}
  requests.characters=()=>characters.map(state)
  function save(entry,id){const item=allItems().find(item=>item.id===id);if(!item)return;entry.ids.add(id);if(item.department==='wearable'&&item.slot&&!entry.mains.has(item.slot))entry.mains.set(item.slot,{sex:entry.character.sex,slot:item.slot,item:{...item,version}})}
  await page.addInitScript(()=>{window.__copiedShopUrl='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__copiedShopUrl=value}}})})
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method()
    if(!path.startsWith('/api/'))return route.continue()
    if(path.startsWith('/api/shop/'))requests.push(path)
    if(path==='/api/auth/me'){if(authGate)await authGate;return route.fulfill({json:{user:loggedIn?{id:1,provider:'google',nickname:'관리자',onboarded:true}:null}})}
    if(path==='/api/auth/admin-status')return route.fulfill({json:{is_admin:admin}})
    if(path==='/api/share/short'&&method==='POST'){
      const target=route.request().postDataJSON().target,existing=[...shortLinks].find(([,value])=>value===target),code=existing?.[0]||(shortLinks.size+1).toString(36).padStart(4,'0')
      shortLinks.set(code,target);await page.evaluate(()=>{window.__copiedShopUrl=''});return route.fulfill({json:{url:'https://r2archive.com/short/'+code}})
    }
    if(path.startsWith('/api/share/short/'))return route.fulfill({json:{target:shortLinks.get(path.split('/').at(-1))}})
    if(path==='/api/share/myhome/check'){
      const link=links.get(url.searchParams.get('handle')),id=url.searchParams.get('character_id')
      return route.fulfill({json:{available:!link||link===id}})
    }
    if(path==='/api/share/myhome'){
      let id=url.searchParams.get('character_id')
      if(method==='PUT'){const body=route.request().postDataJSON();id=String(body.character_id);links.set(body.handle,id)}
      let handle=[...links].find(([,cid])=>cid===id)?.[0]||null
      if(method==='DELETE'){if(handle)links.delete(handle);handle=null}
      return route.fulfill({json:{handle}})
    }
    if(path.startsWith('/api/share/homes/')){
      const handle=decodeURIComponent(path.split('/').at(-1)),entry=characters.find(entry=>entry.character.id===links.get(handle))
      return entry?route.fulfill({json:{...state(entry),handle}}):route.fulfill({status:404,json:{detail:'존재하지 않거나 공유가 해제된 마이홈입니다'}})
    }
    if(path==='/api/shop/characters'){
      if(method==='POST'){
        const body=route.request().postDataJSON()
        if(characters.length>=17)return route.fulfill({status:409,json:{detail:'캐릭터는 최대 17개까지 생성할 수 있습니다'}})
        if(characters.some(entry=>entry.character.name.toLowerCase()===body.name.toLowerCase()))return route.fulfill({status:409,json:{detail:'이미 사용 중인 캐릭터 이름입니다'}})
        const id=String(Math.max(0,...characters.map(entry=>Number(entry.character.id)))+1),entry={character:{id,name:body.name,sex:body.sex},ids:new Set(),mains:new Map(),image:false};characters.push(entry)
        return route.fulfill({status:201,json:state(entry)})
      }
      return route.fulfill({json:{characters:characters.map(state),limit:17}})
    }
    if(path.startsWith('/api/shop/characters/')){
      const parts=path.split('/'),entry=characters.find(entry=>entry.character.id===parts[4])
      if(!entry)return route.fulfill({status:404,json:{detail:'캐릭터를 찾을 수 없습니다'}})
      if(parts[5]==='thumbnail'){if(method==='PUT'){entry.image=true;return route.fulfill({status:204})}return route.fulfill({body:png,contentType:'image/png'})}
      if(method==='GET'){if(wardrobeGate)await wardrobeGate;return route.fulfill({json:state(entry)})}
      if(method==='DELETE'&&!parts[5]){characters=characters.filter(item=>item!==entry);for(const [handle,id]of links)if(id===entry.character.id)links.delete(handle);return route.fulfill({status:204})}
      if(wardrobeSaveGate)await wardrobeSaveGate
      if(parts[5]==='items'&&method==='POST')for(const id of route.request().postDataJSON().ids)save(entry,String(id))
      if(parts[5]==='items'&&method==='DELETE'){
        const id=parts[6];entry.ids.delete(id)
        for(const [slot,main]of entry.mains)if(main.item.id===id){entry.mains.delete(slot);const next=allItems().find(item=>item.slot===slot&&entry.ids.has(item.id));if(next)entry.mains.set(slot,{sex:entry.character.sex,slot,item:next})}
      }
      if(parts[5]==='mains'){
        const item=allItems().find(item=>item.id===parts[6]);if(!item||!entry.ids.has(item.id))return route.fulfill({status:422,json:{detail:'저장한 꾸미기 아이템만 메인으로 지정할 수 있습니다'}})
        entry.mains.set(item.slot,{sex:entry.character.sex,slot:item.slot,item:{...item,version}})
      }
      return route.fulfill({json:state(entry)})
    }
    if(path==='/api/shop/wardrobe'){if(wardrobeGate)await wardrobeGate;return route.fulfill({json:{ids:union(),mains:[]}})}
    if(path.startsWith('/api/shop/wardrobe/'))return route.fulfill({status:409,json:{detail:'의상을 저장할 캐릭터를 선택해주세요'}})
    if(path==='/api/shop/favorites'&&method==='DELETE'){const slot=url.searchParams.get('slot'),removed=[...savedFavorites].filter(id=>!slot||allItems().some(item=>item.id===id&&item.slot===slot));removed.forEach(id=>savedFavorites.delete(id));return route.fulfill({json:{removed_ids:removed,count:removed.length}})}
    if(path==='/api/shop/favorites'){if(favoriteGate)await favoriteGate;return route.fulfill({json:{ids:[...savedFavorites]}})}
    if(path.startsWith('/api/shop/favorites/')){const id=path.split('/').at(-1);if(method==='POST')savedFavorites.add(id);else savedFavorites.delete(id);return route.fulfill({json:{id,favorite:savedFavorites.has(id)}})}
    if(path==='/api/shop/meta'){if(metaGate)await metaGate;return route.fulfill({json:{revision:version,texture_revision:textureRevision,bases:{male:`${root}/models/${'d'.repeat(64)}.json.gz`,female:`${root}/models/${'e'.repeat(64)}.json.gz`},counts:{wearable:2,functional:1,other:0},admin_only:false}})}
    if(path==='/api/shop/items'){
      if(listGate)await listGate
      const params=url.searchParams,position=params.get('cursor')||'',start=position?Number(position.split(':')[0])+1:0,size=Number(params.get('page_size')||24)
      if(start&&nextGate)await nextGate
      const character=characters.find(entry=>entry.character.id===(params.get('character_id')||links.get(params.get('home')))),owned=character?[...character.ids]:union()
      let list=items||(params.get('department')==='wearable'?[params.get('sex')==='female'?femaleShirt:shirt]:[hero])
      list=list.filter(item=>(!item.is_unreleased||params.get('include_unreleased')==='true'&&(item.department==='wearable'||['couple','friend'].includes(item.group)))&&(!params.get('department')||item.department===params.get('department'))&&(!params.get('sex')||item.sex===params.get('sex')||item.sex==='common')&&(!params.get('slot')||item.slot===params.get('slot'))&&(!params.get('group')||item.group===params.get('group'))&&(!params.get('subgroup')||item.subgroup===params.get('subgroup'))&&(!params.get('q')||item.name.includes(params.get('q')))&&(!(params.get('owned_only')==='true'||params.get('home'))||owned.includes(item.id))&&(params.get('favorites_only')!=='true'||savedFavorites.has(item.id))&&(params.get('preview_only')!=='true'||!!item.preview_available&&!!item.model)&&(params.get('paired_only')!=='true'||!!item.counterpart_id||item.slot==='pet'&&item.sex==='common'))
      const chunk=list.slice(start,start+size).map(item=>({...item,owners:characters.filter(entry=>entry.ids.has(item.id)).map(entry=>entry.character)})),more=start+size<list.length
      return route.fulfill({json:{version,items:chunk,total:start?null:list.length,page_size:size,has_more:more,next_cursor:more?`${start+size-1}:${chunk.at(-1).id}`:null}})
    }
    if(path.startsWith('/api/shop/items/'))return route.fulfill({json:items?.find(item=>path.endsWith('/'+item.id))||(path.endsWith('/201')?femaleShirt:path.endsWith('/200')?shirt:path.endsWith('/300')?pet:hero)})
    if(path.includes('/models/')){if(modelGate)await modelGate;return route.fulfill({json:models?.[path]||(path.includes('c'.repeat(64))?petMesh:mesh)})}
    if(path.includes('/textures/')||path.includes('/thumbnails/'))return route.fulfill({body:texture,contentType:'image/png'})
    if(path.endsWith('/flags'))return route.fulfill({json:{favorites:[],played:[],played_all:[]}})
    return route.fulfill({json:[]})
  })
  return requests
}

export async function copiedShopUrl(page) {
  await page.waitForFunction(() => !!window.__copiedShopUrl)
  const raw = new URL(await page.evaluate(() => window.__copiedShopUrl))
  if (!raw.pathname.startsWith('/short/')) return raw
  const data = await page.evaluate(code => fetch('/api/share/short/' + code).then(response => response.json()), raw.pathname.split('/').at(-1))
  return new URL(data.target, 'https://r2archive.com')
}
