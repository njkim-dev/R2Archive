import axios from 'axios'
import { getSessionId } from '../utils/helpers'
import { apiPath, isXyxMode } from '../utils/serverMode'

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

export const getSongs = () => api.get(apiPath('/songs', '/xyx/songs')).then(r => r.data)
export const getRemovedSongs = () => api.get(apiPath('/songs/removed', '/xyx/songs/removed')).then(r => r.data)
export const getMeta = () => api.get(apiPath('/meta', '/xyx/meta')).then(r => r.data)
export const getPmangSongs = () => api.get('/pmang-songs').then(r => r.data)
export const getPmangComments = (id) => api.get(`/pmang-songs/${id}/comments`).then(r => r.data)
export const addPmangComment = (id, body) => api.post(`/pmang-songs/${id}/comments`, body).then(r => r.data)
export const getPmangRecords = (id) => api.get(`/pmang-songs/${id}/records`).then(r => r.data)
export const addPmangRecord = (id, body) => api.post(`/pmang-songs/${id}/records`, body).then(r => r.data)
export const getMyPmangFavorites = () => api.get('/users/me/pmang-favorites').then(r => r.data)
export const addPmangFavorite = (id) => api.post(`/users/me/pmang-favorites/${id}`).then(r => r.data)
export const removePmangFavorite = (id) => api.delete(`/users/me/pmang-favorites/${id}`).then(r => r.data)
export const getSong = (id) => api.get(apiPath(`/songs/${id}`, `/xyx/songs/${id}`)).then(r => r.data)
export const logPlay = (id) => api.post(apiPath(`/songs/${id}/play`, `/xyx/songs/${id}/play`), { session_id: getSessionId() }).catch(() => {})

export const getComments = (id) =>
  api.get(apiPath(`/songs/${id}/comments`, `/xyx/songs/${id}/comments`)).then(r => r.data)
export const addComment = (id, body) =>
  api.post(apiPath(`/songs/${id}/comments`, `/xyx/songs/${id}/comments`), body).then(r => r.data)

export const getPerceivedStats = (id, anonId) =>
  api.get(apiPath(`/songs/${id}/perceived/stats`, `/xyx/songs/${id}/perceived/stats`), {
    // 로그인 사용자는 anonId를 빈 문자열로 넘김 → 쿼리스트링 자체를 생략해
    // Caddy/브라우저 히스토리에 anon_id가 남지 않도록 한다.
    params: anonId ? { anon_id: anonId } : {},
  }).then(r => r.data)
export const submitPerceived = (id, body) =>
  api.post(apiPath(`/songs/${id}/perceived`, `/xyx/songs/${id}/perceived`), body).then(r => r.data)
export const updatePerceived = (id, body) =>
  api.put(apiPath(`/songs/${id}/perceived`, `/xyx/songs/${id}/perceived`), body).then(r => r.data)
export const deletePerceived = (id, body) =>
  api.delete(apiPath(`/songs/${id}/perceived`, `/xyx/songs/${id}/perceived`), { data: body }).then(r => r.data)

export const submitFeedback = (id, body) =>
  isXyxMode() ? Promise.reject(new Error('XYX feedback is not enabled yet')) : api.post(`/songs/${id}/feedback`, body).then(r => r.data)

export const getRecords = (id) =>
  isXyxMode() ? Promise.resolve([]) : api.get(`/songs/${id}/records`).then(r => r.data)
export const addRecord = (id, body) =>
  isXyxMode() ? Promise.reject(new Error('XYX records are not enabled yet')) : api.post(`/songs/${id}/records`, body).then(r => r.data)
// 본 게임 플레이 영상 — achievements 테이블 (records와 분리됨)
export const getPlayVideos = (id) =>
  api.get(apiPath(`/songs/${id}/play-videos`, `/xyx/songs/${id}/play-videos`)).then(r => r.data)
export const addPlayVideo = (id, body) =>
  api.post(apiPath(`/songs/${id}/play-videos`, `/xyx/songs/${id}/play-videos`), body).then(r => r.data)
export const getRanking = (id) =>
  isXyxMode() ? Promise.resolve([]) : api.get(`/songs/${id}/ranking`).then(r => r.data)
export const getMyRecordsForSong = (id) =>
  isXyxMode() ? Promise.resolve([]) : api.get(`/songs/${id}/records/me`).then(r => r.data)
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
// 관리자 여부는 /auth/me에서 빼고 별도 호출로 분리 — 정보 노출 최소화.
// 비로그인 시 401이라 try/catch로 false 폴백.
export const getAdminStatus = () => api.get('/auth/admin-status').then(r => r.data).catch(() => ({ is_admin: false }))
export const logoutApi = () => api.post('/auth/logout').then(r => r.data)
export const getYoutubeCandidates = (status = 'pending') =>
  api.get('/admin/youtube-candidates', { params: { status } }).then(r => r.data)
export const getPmangYoutubeCandidates = (status = 'pending') =>
  api.get('/admin/pmang-youtube-candidates', { params: { status } }).then(r => r.data)
export const patchMe = (body) => api.patch('/users/me', body).then(r => r.data)
export const checkNickname = (q) =>
  api.get('/users/check-nickname', { params: { q } }).then(r => r.data)
export const getMyFlags = () => api.get(apiPath('/users/me/flags', '/users/me/xyx-flags')).then(r => r.data)
export const addFavorite = (songId) =>
  api.post(apiPath(`/users/me/favorites/${songId}`, `/users/me/xyx-favorites/${songId}`)).then(r => r.data)
export const removeFavorite = (songId) =>
  api.delete(apiPath(`/users/me/favorites/${songId}`, `/users/me/xyx-favorites/${songId}`)).then(r => r.data)
export const getMyRecords = () => api.get('/users/me/records').then(r => r.data)
export const saveManualRecords = (entries) =>
  api.put('/users/me/records/manual', { entries }).then(r => r.data)
export const getMyComments = () => api.get('/users/me/comments').then(r => r.data)
export const deleteMyRecord = (recordId) =>
  api.delete(`/users/me/records/${recordId}`).then(r => r.data)
export const deleteMyComment = (commentId) =>
  api.delete(`/users/me/comments/${commentId}`).then(r => r.data)
export const oauthLoginUrl = (provider, remember = false) =>
  `/api/auth/${provider}/login?remember=${remember ? '1' : '0'}`

export const getRankings = (groupId = null) =>
  api.get('/rankings/songs', { params: groupId ? { group_id: groupId } : {} }).then(r => r.data)
export const searchRankingUsers = (q) => api.get('/rankings/users', { params: { q } }).then(r => r.data)
export const lookupRankingUser = (nickname) =>
  api.get('/rankings/users/lookup', { params: { nickname } }).then(r => r.data)
export const getUserRankingRecords = (userId) =>
  api.get(`/rankings/users/${userId}/records`).then(r => r.data)

// ---------- Groups ----------
export const getMyGroups = () => api.get('/me/groups').then(r => r.data)
export const getGroupDetail = (gid) => api.get(`/groups/${gid}`).then(r => r.data)
export const createGroup = (body) => api.post('/groups', body).then(r => r.data)
export const joinGroup = (body) => api.post('/groups/join', body).then(r => r.data)
export const lookupGroupByCode = (code) =>
  api.get(`/groups/by-code/${encodeURIComponent(code)}`).then(r => r.data)

// ---------- Feedback ----------
export const listFeedback = (params = {}) =>
  api.get('/feedback', { params }).then(r => r.data)
export const createFeedback = (body) =>
  api.post('/feedback', body).then(r => r.data)
export const voteFeedback = (id) =>
  api.post(`/feedback/${id}/vote`).then(r => r.data)
export const patchGroup = (gid, body) => api.patch(`/groups/${gid}`, body).then(r => r.data)
export const deleteGroup = (gid) => api.delete(`/groups/${gid}`).then(r => r.data)
export const regenGroupCode = (gid) => api.post(`/groups/${gid}/regen-code`).then(r => r.data)
export const revokeGroupCode = (gid) => api.post(`/groups/${gid}/revoke-code`).then(r => r.data)
export const acceptGroupApp = (gid, aid) =>
  api.post(`/groups/${gid}/applications/${aid}/accept`).then(r => r.data)
export const rejectGroupApp = (gid, aid) =>
  api.post(`/groups/${gid}/applications/${aid}/reject`).then(r => r.data)
export const setGroupMemberRole = (gid, mid, role) =>
  api.patch(`/groups/${gid}/members/${mid}/role`, { role }).then(r => r.data)
export const kickGroupMember = (gid, mid) =>
  api.delete(`/groups/${gid}/members/${mid}`).then(r => r.data)
export const transferGroupOwner = (gid, toUserId) =>
  api.post(`/groups/${gid}/transfer-owner`, { to_user_id: toUserId }).then(r => r.data)
export const leaveGroup = (gid) => api.post(`/groups/${gid}/leave`).then(r => r.data)
export const getGroupLeaderboard = (gid) => api.get(`/groups/${gid}/leaderboard`).then(r => r.data)
export const getGroupFeed = (gid, limit = 80) =>
  api.get(`/groups/${gid}/feed`, { params: { limit } }).then(r => r.data)
export const getGroupSongFirsts = (gid) => api.get(`/groups/${gid}/song-firsts`).then(r => r.data)

// ---------- Personal Categories ----------
export const getMyPersonalCategories = () => api.get(apiPath('/me/personal-categories', '/me/xyx-categories')).then(r => r.data)
export const getEditablePersonalCategories = () => api.get(apiPath('/me/personal-categories/editable', '/me/xyx-categories/editable')).then(r => r.data)
export const getPublicPersonalCategories = () => api.get(apiPath('/personal-categories/public', '/xyx-categories/public')).then(r => r.data)
export const getMySubscribedPersonalCategories = () => api.get(apiPath('/me/personal-category-subscriptions', '/me/xyx-category-subscriptions')).then(r => r.data)
export const getSongPersonalCategories = (songId) =>
  api.get(apiPath(`/songs/${songId}/personal-categories`, `/xyx/songs/${songId}/categories`)).then(r => r.data)
export const createPersonalCategory = (body) => api.post(apiPath('/personal-categories', '/xyx-categories'), body).then(r => r.data)
export const patchPersonalCategory = (categoryId, body) =>
  api.patch(apiPath(`/personal-categories/${categoryId}`, `/xyx-categories/${categoryId}`), body).then(r => r.data)
export const getPersonalCategoryByCode = (code) =>
  api.get(apiPath(`/personal-categories/by-code/${encodeURIComponent(code)}`, `/xyx-categories/by-code/${encodeURIComponent(code)}`)).then(r => r.data)
export const subscribePersonalCategory = (code) =>
  api.post(apiPath(`/personal-categories/by-code/${encodeURIComponent(code)}/subscribe`, `/xyx-categories/by-code/${encodeURIComponent(code)}/subscribe`)).then(r => r.data)
export const unsubscribePersonalCategory = (code) =>
  api.delete(apiPath(`/personal-categories/by-code/${encodeURIComponent(code)}/subscribe`, `/xyx-categories/by-code/${encodeURIComponent(code)}/subscribe`)).then(r => r.data)
export const setPersonalCategoryMemberRole = (categoryId, memberUserId, role) =>
  api.patch(apiPath(`/personal-categories/${categoryId}/members/${memberUserId}/role`, `/xyx-categories/${categoryId}/members/${memberUserId}/role`), { role }).then(r => r.data)
export const deletePersonalCategoryMember = (categoryId, memberUserId) =>
  api.delete(apiPath(`/personal-categories/${categoryId}/members/${memberUserId}`, `/xyx-categories/${categoryId}/members/${memberUserId}`)).then(r => r.data)
export const addSongToPersonalCategory = (categoryId, songId) =>
  api.post(apiPath(`/personal-categories/${categoryId}/songs`, `/xyx-categories/${categoryId}/songs`), { song_id: songId }).then(r => r.data)
export const deleteSongFromPersonalCategory = (categoryId, songId) =>
  api.delete(apiPath(`/personal-categories/${categoryId}/songs/${songId}`, `/xyx-categories/${categoryId}/songs/${songId}`)).then(r => r.data)
