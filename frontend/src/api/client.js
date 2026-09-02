import axios from 'axios'
import { getSessionId } from '../utils/helpers'
import { apiPath, isXyxMode } from '../utils/serverMode'

const api = axios.create({ baseURL: '/api', withCredentials: true })

let _rateLimitAlertCooldown = 0
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 429 && !err.config?.skipRateLimitAlert) {
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

export const getRecords = (id) =>
  isXyxMode() ? Promise.resolve([]) : api.get(`/songs/${id}/records`).then(r => r.data)
export const addRecord = (id, body) =>
  isXyxMode() ? Promise.reject(new Error('XYX records are not enabled yet')) : api.post(`/songs/${id}/records`, body).then(r => r.data)
export const getRanking = (id) =>
  isXyxMode() ? Promise.resolve([]) : api.get(`/songs/${id}/ranking`).then(r => r.data)
export const getMyRecordsForSong = (id) =>
  isXyxMode() ? Promise.resolve([]) : api.get(`/songs/${id}/records/me`).then(r => r.data)
export const parseScreenshot = (file) => {
  const fd = new FormData()
  fd.append('image', file)
  return api.post('/parse-screenshot', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}
export const getMyScreenshotFilenames = () =>
  api.get('/users/me/screenshot-filenames').then(r => r.data)
export const uploadRecordScreenshot = (recordId, file) => {
  const fd = new FormData()
  fd.append('image', file)
  return api.post(`/records/${recordId}/screenshot`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const getPerceivedStats = (id, anonId) =>
  api.get(apiPath(`/songs/${id}/perceived/stats`, `/xyx/songs/${id}/perceived/stats`), {
    // 로그인 사용자의 익명 ID는 URL에 노출하지 않는다.
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

// 성과 영상은 일반 기록과 별도로 관리한다.
export const getPlayVideos = (id) =>
  api.get(apiPath(`/songs/${id}/play-videos`, `/xyx/songs/${id}/play-videos`)).then(r => r.data)
export const addPlayVideo = (id, body) =>
  api.post(apiPath(`/songs/${id}/play-videos`, `/xyx/songs/${id}/play-videos`), body).then(r => r.data)

export const getAuthMe = () => api.get('/auth/me').then(r => r.data)
// 관리자 여부는 일반 세션 응답과 분리한다.
export const getAdminStatus = () => api.get('/auth/admin-status').then(r => r.data).catch(() => ({ is_admin: false }))
export const logoutApi = () => api.post('/auth/logout').then(r => r.data)
export const getYoutubeCandidates = (status = 'pending') =>
  api.get('/admin/youtube-candidates', { params: { status } }).then(r => r.data)
export const getPmangYoutubeCandidates = (status = 'pending') =>
  api.get('/admin/pmang-youtube-candidates', { params: { status } }).then(r => r.data)
export const trackPageview = async (body) => {
  const config = { skipRateLimitAlert: true }
  try {
    let response = await api.post('/analytics/pageview', body, config)
    if (response.data?.bootstrap) {
      response = await api.post('/analytics/pageview', body, config)
    }
    return response.data
  } catch {
    return null
  }
}
function currentDevice() {
  if (typeof window === 'undefined') return 'unknown'
  if (window.matchMedia?.('(max-width: 767px)').matches) return 'mobile'
  if (window.matchMedia?.('(max-width: 1100px)').matches) return 'tablet'
  return 'desktop'
}
export const trackSongCatalogView = async (body) => {
  if (!body?.song_id) return null
  const config = { skipRateLimitAlert: true }
  const payload = {
    path: typeof window === 'undefined' ? '/' : window.location.pathname,
    title: typeof document === 'undefined' ? null : document.title,
    referrer: typeof document === 'undefined' ? null : document.referrer || null,
    device: currentDevice(),
    ...body,
  }
  try {
    let response = await api.post('/analytics/catalog-view', payload, config)
    if (response.data?.bootstrap) {
      response = await api.post('/analytics/catalog-view', payload, config)
    }
    return response.data
  } catch {
    return null
  }
}
export const getAnalyticsSummary = (days = 30) =>
  api.get('/admin/analytics/summary', { params: { days } }).then(r => r.data)
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

export const getMyGroups = () => api.get('/me/groups').then(r => r.data)
export const getGroupDetail = (gid) => api.get(`/groups/${gid}`).then(r => r.data)
export const createGroup = (body) => api.post('/groups', body).then(r => r.data)
export const joinGroup = (body) => api.post('/groups/join', body).then(r => r.data)
export const lookupGroupByCode = (code) =>
  api.get(`/groups/by-code/${encodeURIComponent(code)}`).then(r => r.data)

export const listFeedback = (params = {}) =>
  api.get('/feedback', { params }).then(r => r.data)
export const listSongFeedback = (params = {}) =>
  api.get('/admin/song-feedback', { params }).then(r => r.data)
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

export const getMyPersonalCategories = () => api.get(apiPath('/me/personal-categories', '/me/xyx-categories')).then(r => r.data)
export const getEditablePersonalCategories = () => api.get(apiPath('/me/personal-categories/editable', '/me/xyx-categories/editable')).then(r => r.data)
export const getPublicPersonalCategories = () => api.get(apiPath('/personal-categories/public', '/xyx-categories/public')).then(r => r.data)
export const getMySubscribedPersonalCategories = () => api.get(apiPath('/me/personal-category-subscriptions', '/me/xyx-category-subscriptions')).then(r => r.data)
export const getSongPersonalCategories = (songId) =>
  api.get(apiPath(`/songs/${songId}/personal-categories`, `/xyx/songs/${songId}/categories`)).then(r => r.data)
export const getRecommendedPracticeSections = (songId) =>
  isXyxMode() ? Promise.resolve([]) : api.get(`/songs/${songId}/practice-sections/recommended`).then(r => r.data)
export const getMyPracticeSections = (songId) =>
  isXyxMode() ? Promise.resolve([]) : api.get(`/songs/${songId}/practice-sections/mine`).then(r => r.data)
export const getPracticeSections = (songId) =>
  isXyxMode() ? Promise.resolve([]) : api.get(`/songs/${songId}/practice-sections`).then(r => r.data)
export const addPracticeSection = (songId, body) =>
  isXyxMode() ? Promise.reject(new Error('Practice sections are only available on KR server')) : api.post(`/songs/${songId}/practice-sections`, body).then(r => r.data)
export const recommendPracticeSection = (songId, sectionId) =>
  isXyxMode() ? Promise.reject(new Error('Practice sections are only available on KR server')) : api.post(`/songs/${songId}/practice-sections/${sectionId}/recommend`).then(r => r.data)
export const deletePracticeSection = (songId, sectionId) =>
  isXyxMode() ? Promise.reject(new Error('Practice sections are only available on KR server')) : api.delete(`/songs/${songId}/practice-sections/${sectionId}`).then(r => r.data)
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
