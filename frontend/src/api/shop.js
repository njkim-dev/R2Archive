import axios from 'axios'

const api = axios.create({ baseURL: '/api/shop', withCredentials: true })
export const getShopMeta = version => api.get('/meta', { params: { version } }).then(r => r.data)
export const getShopImageEstimate = (slot, signal) => api.get('/image-search/estimate', { params: { slot }, signal, timeout: 5000 }).then(r => r.data)
export const searchShopImage = ({ image, sex, slot, version, mode = 'terra' }, signal) => {
  const data = new FormData()
  data.append('image', image, image.name || 'search.png'); data.append('sex', sex); data.append('slot', slot)
  if (version) data.append('version', version)
  data.append('include_unreleased', 'true')
  data.append('mode', mode)
  return api.post('/image-search', data, { signal, timeout: 150000 }).then(r => r.data)
}
export async function rateShopImage(id, slot, itemId, value) {
  const response = await fetch(`/api/shop/image-search/history/${id}/votes`, {
    method: 'PUT', credentials: 'include', keepalive: true,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot, item_id: itemId, value })
  })
  const data = await response.json()
  if (!response.ok) {
    const error = new Error('평가를 저장하지 못했습니다. 다시 시도해주세요.')
    error.response = { status: response.status, data }
    throw error
  }
  return data
}
export const recordShopImageAction = (id, action, items) => api.post(`/image-search/history/${id}/actions`, { action, item_ids: items.map(item => String(item.id)) }).then(r => r.data)
export const getImageSearchHistory = (params, signal) => api.get('/image-search/admin/history', { params, signal }).then(r => r.data)
export const getImageSearchHistoryDetail = (id, signal) => api.get(`/image-search/admin/history/${id}`, { signal }).then(r => r.data)
export const getImageSearchFeedback = (ids, signal) => api.get('/image-search/admin/feedback', { params: { ids }, paramsSerializer: { indexes: null }, signal }).then(r => r.data)
export const reviewImageSearch = (id, data) => api.put(`/image-search/admin/history/${id}/review`, data).then(r => r.data)
export const deleteImageSearch = id => api.delete(`/image-search/admin/history/${id}`).then(r => r.data)
export const publishShopImage = (id, selectedIds) => api.post(`/image-search/history/${id}/share`, { selected_ids: selectedIds }).then(r => r.data)
export const getSharedShopImage = (token, signal) => api.get(`/image-search/shared/${encodeURIComponent(token)}`, { signal }).then(r => r.data)
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
