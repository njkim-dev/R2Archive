import axios from 'axios'

const api = axios.create({ baseURL: '/api/shop', withCredentials: true })
export const getShopMeta = version => api.get('/meta', { params: { version } }).then(r => r.data)
export const searchShopImage = ({ image, sex, slot, version, includeUnreleased, mode = 'terra' }, signal) => {
  const data = new FormData()
  data.append('image', image, 'search.jpg'); data.append('sex', sex); data.append('slot', slot)
  if (version) data.append('version', version)
  data.append('include_unreleased', String(includeUnreleased))
  data.append('mode', mode)
  return api.post('/image-search', data, { signal, timeout: 150000 }).then(r => r.data)
}
export const getShopItems = (params, signal) => api.get('/items', { params, signal }).then(r => r.data)
export const getShopItem = (id, version) => api.get(`/items/${id}`, { params: { version } }).then(r => r.data)
export const getShopFavorites = signal => api.get('/favorites', { signal }).then(r => r.data)
export const saveShopFavorite = (id, version) => api.post(`/favorites/${id}`, null, { params: { version } }).then(r => r.data)
export const deleteShopFavorite = id => api.delete(`/favorites/${id}`).then(r => r.data)
export const clearShopFavorites = slot => api.delete('/favorites', { params: { slot: slot || undefined } }).then(r => r.data)
export const getShopWardrobe = (version, signal) => api.get('/wardrobe', { params: { version }, signal }).then(r => r.data)
export const saveShopWardrobe = (id, version) => api.post(`/wardrobe/${id}`, null, { params: { version } }).then(r => r.data)
export const setShopWardrobeMain = (id, sex, version) => api.put(`/wardrobe/${id}/main`, null, { params: { sex, version } }).then(r => r.data)
export const deleteShopWardrobe = (id, version) => api.delete(`/wardrobe/${id}`, { params: { version } }).then(r => r.data)
export const saveShopWardrobeBatch = (ids, version) => api.post('/wardrobe/batch', { ids }, { params: { version } }).then(r => r.data)
