import axios from 'axios'
import { getSessionId } from '../utils/helpers'

const api = axios.create({ baseURL: '/api', withCredentials: true })

let _rateLimitAlertCooldown = 0
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 429) {
      const now = Date.now()
      if (now - _rateLimitAlertCooldown > 3000) {
        _rateLimitAlertCooldown = now
        alert('요청이 너무 잦아요. 잠시 후 다시 시도해주세요.')
      }
    }
    return Promise.reject(err)
  }
)

export const getSongs = () => api.get('/songs').then(r => r.data)
export const getMeta = () => api.get('/meta').then(r => r.data)
export const getSong = (id) => api.get(`/songs/${id}`).then(r => r.data)
export const logPlay = (id) => api.post(`/songs/${id}/play`, { session_id: getSessionId() }).catch(() => {})

export const getComments = (id) => api.get(`/songs/${id}/comments`).then(r => r.data)
export const addComment = (id, body) => api.post(`/songs/${id}/comments`, body).then(r => r.data)

export const getPerceivedStats = (id, anonId) =>
  api.get(`/songs/${id}/perceived/stats`, { params: { anon_id: anonId } }).then(r => r.data)
export const submitPerceived = (id, body) => api.post(`/songs/${id}/perceived`, body).then(r => r.data)
export const updatePerceived = (id, body) => api.put(`/songs/${id}/perceived`, body).then(r => r.data)
export const deletePerceived = (id, body) => api.delete(`/songs/${id}/perceived`, { data: body }).then(r => r.data)

export const submitFeedback = (id, body) => api.post(`/songs/${id}/feedback`, body).then(r => r.data)

export const getRecords = (id) => api.get(`/songs/${id}/records`).then(r => r.data)
export const addRecord = (id, body) => api.post(`/songs/${id}/records`, body).then(r => r.data)
export const getRanking = (id) => api.get(`/songs/${id}/ranking`).then(r => r.data)
export const getMyRecordsForSong = (id) => api.get(`/songs/${id}/records/me`).then(r => r.data)
export const parseScreenshot = (file) => {
  const fd = new FormData()
  fd.append('image', file)
  return api.post('/parse-screenshot', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 15000,
  }).then(r => r.data)
}

export const getMyScreenshotFilenames = () =>
  api.get('/users/me/screenshot-filenames').then(r => r.data)

export const uploadRecordScreenshot = (recordId, file) => {
  const fd = new FormData()
  fd.append('image', file)
  return api.post(`/records/${recordId}/screenshot`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 20000,
  }).then(r => r.data)
}

export const getAuthMe = () => api.get('/auth/me').then(r => r.data)
export const logoutApi = () => api.post('/auth/logout').then(r => r.data)
export const patchMe = (body) => api.patch('/users/me', body).then(r => r.data)
export const checkNickname = (q) =>
  api.get('/users/check-nickname', { params: { q } }).then(r => r.data)
export const getMyFlags = () => api.get('/users/me/flags').then(r => r.data)
export const addFavorite = (songId) =>
  api.post(`/users/me/favorites/${songId}`).then(r => r.data)
export const removeFavorite = (songId) =>
  api.delete(`/users/me/favorites/${songId}`).then(r => r.data)
export const getMyRecords = () => api.get('/users/me/records').then(r => r.data)
export const getMyComments = () => api.get('/users/me/comments').then(r => r.data)
export const deleteMyRecord = (recordId) =>
  api.delete(`/users/me/records/${recordId}`).then(r => r.data)
export const deleteMyComment = (commentId) =>
  api.delete(`/users/me/comments/${commentId}`).then(r => r.data)
export const oauthLoginUrl = (provider, remember = false) =>
  `/api/auth/${provider}/login?remember=${remember ? '1' : '0'}`
