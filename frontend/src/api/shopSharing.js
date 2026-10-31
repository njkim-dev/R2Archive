import axios from 'axios'

const api = axios.create({ baseURL: '/api/share', withCredentials: true })
export const createShortUrl = url => {
  const target = new URL(url, 'https://r2archive.com')
  if (target.origin !== 'https://r2archive.com' || target.pathname !== '/shop') return Promise.reject(new Error('상점 URL만 공유할 수 있습니다.'))
  return api.post('/short', { target: target.pathname + target.search }).then(r => r.data.url)
}
export const resolveShortUrl = (code, signal) => api.get(`/short/${encodeURIComponent(code)}`, { signal }).then(r => r.data)
export const getMyHomeLink = (characterId,signal) => api.get('/myhome', { params:{character_id:characterId},signal }).then(r => r.data)
export const checkMyHomeId = (handle, signal, characterId) => api.get('/myhome/check', { params: { handle,character_id:characterId }, signal }).then(r => r.data)
export const publishMyHome = (handle,characterId) => api.put('/myhome', { handle,character_id:characterId }).then(r => r.data)
export const removeMyHomeLink = characterId => api.delete('/myhome',{params:{character_id:characterId}}).then(r => r.data)
export const getPublicHome = (handle, version, signal) => api.get(`/homes/${encodeURIComponent(handle)}`, { params: { version }, signal }).then(r => r.data)
export const myHomeUrl = handle => 'https://r2archive.com/myhome/' + encodeURIComponent(handle)
