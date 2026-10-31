import axios from 'axios'
const api=axios.create({baseURL:'/api/shop/characters',withCredentials:true})
export const getCharacters=(version,signal)=>api.get('',{params:{version},signal}).then(r=>r.data)
export const createCharacter=(name,sex,version)=>api.post('',{name,sex},{params:{version}}).then(r=>r.data)
export const getCharacter=(id,version,signal)=>api.get('/'+id,{params:{version},signal}).then(r=>r.data)
export const deleteCharacter=id=>api.delete('/'+id)
export const saveCharacterItems=(id,ids,version)=>api.post(`/${id}/items`,{ids},{params:{version}}).then(r=>r.data)
export const removeCharacterItem=(id,item,version)=>api.delete(`/${id}/items/${item}`,{params:{version}}).then(r=>r.data)
export const setCharacterMain=(id,item,version)=>api.put(`/${id}/mains/${item}`,null,{params:{version}}).then(r=>r.data)
export const saveCharacterThumbnail=(id,key,blob,version)=>api.put(`/${id}/thumbnail`,blob,{params:{key,version},headers:{'Content-Type':'image/webp'}})

export const setCharacterPrivacy=(id,item,is_private,version)=>api.put(`/${id}/items/${item}/privacy`,{is_private},{params:{version}}).then(r=>r.data)
