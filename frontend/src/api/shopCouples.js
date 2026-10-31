import axios from 'axios'
const api=axios.create({baseURL:'/api/shop/couples',withCredentials:true,timeout:10000})
export const getCouples=signal=>api.get('',{signal}).then(r=>r.data)
export const requestCouple=(id,url)=>api.post('/'+id,{url})
export const acceptCouple=id=>api.post(`/${id}/accept`)
export const removeCouple=id=>api.delete('/'+id)
export const getCoupleHome=(id,version,signal)=>api.get(`/${id}/home`,{params:{version},signal}).then(r=>r.data)
