import axios from 'axios'

const api = axios.create({ baseURL: '/api/shop', withCredentials: true })
export const getShopMeta = version => api.get('/meta', { params: { version } }).then(r => r.data)
export const getShopItems = (params, signal) => api.get('/items', { params, signal }).then(r => r.data)
export const getShopItem = (id, version) => api.get(`/items/${id}`, { params: { version } }).then(r => r.data)
