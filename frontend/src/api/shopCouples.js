import axios from 'axios'
const api=axios.create({baseURL:'/api/shop/couples',withCredentials:true,timeout:10000})
export const getCouples=signal=>api.get('',{signal}).then(r=>r.data)
export const requestCouple=(id,url)=>api.post('/'+id,{url})
export const acceptCouple=(id,relationshipId)=>api.post(`/${id}/accept`,null,{params:{relationship_id:relationshipId}})
export const removeCouple=(id,relationshipId,status)=>api.delete('/'+id,{params:{relationship_id:relationshipId,expected_status:status}})
export const getCoupleHome=(id,version,signal)=>api.get(`/${id}/home`,{params:{version},signal}).then(r=>r.data)
