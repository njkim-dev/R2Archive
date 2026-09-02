import { create } from 'zustand'
import {
  getMyGroups, getGroupDetail, createGroup, joinGroup,
  patchGroup, deleteGroup, regenGroupCode, revokeGroupCode,
  acceptGroupApp, rejectGroupApp, setGroupMemberRole,
  kickGroupMember, transferGroupOwner, leaveGroup,
  getGroupLeaderboard, getGroupFeed, getGroupSongFirsts,
} from '../api/client'

const useGroupsStore = create((set, get) => ({
  myGroups: [],
  loaded: false,

  detail: null,
  detailLoading: false,
  leaderboard: [],
  feed: [],
  songFirsts: [],

  fetchMyGroups: async () => {
    try {
      const data = await getMyGroups()
      set({ myGroups: data, loaded: true })
    } catch {
      set({ myGroups: [], loaded: true })
    }
  },

  loadGroupPage: async (gid) => {
    set({ detail: null, leaderboard: [], feed: [], songFirsts: [], detailLoading: true })
    try {
      const [detail, leaderboard, feed, songFirsts] = await Promise.all([
        getGroupDetail(gid),
        getGroupLeaderboard(gid),
        getGroupFeed(gid, 80),
        getGroupSongFirsts(gid),
      ])
      set({ detail, leaderboard, feed, songFirsts, detailLoading: false })
    } catch (e) {
      set({ detailLoading: false })
      throw e
    }
  },

  refreshDetail: async () => {
    const cur = get().detail
    if (!cur) return
    try {
      const detail = await getGroupDetail(cur.id)
      set({ detail })
    } catch {}
  },

  refreshLeaderboard: async () => {
    const cur = get().detail
    if (!cur) return
    try {
      const leaderboard = await getGroupLeaderboard(cur.id)
      set({ leaderboard })
    } catch {}
  },

  clearDetail: () => set({ detail: null, leaderboard: [], feed: [], songFirsts: [] }),

  create: async (body) => {
    const g = await createGroup(body)
    await get().fetchMyGroups()
    return g
  },
  join: async (body) => {
    const r = await joinGroup(body)
    await get().fetchMyGroups()
    return r
  },
  patch: async (gid, body) => {
    await patchGroup(gid, body)
    await get().fetchMyGroups()
    await get().refreshDetail()
  },
  remove: async (gid) => {
    await deleteGroup(gid)
    await get().fetchMyGroups()
    get().clearDetail()
  },
  regenCode: async (gid) => {
    const r = await regenGroupCode(gid)
    await get().fetchMyGroups()
    await get().refreshDetail()
    return r
  },
  revokeCode: async (gid) => {
    await revokeGroupCode(gid)
    await get().fetchMyGroups()
    await get().refreshDetail()
  },
  accept: async (gid, aid) => {
    await acceptGroupApp(gid, aid)
    await get().fetchMyGroups()
    await get().refreshDetail()
    await get().refreshLeaderboard()
  },
  reject: async (gid, aid) => {
    await rejectGroupApp(gid, aid)
    await get().refreshDetail()
  },
  setRole: async (gid, mid, role) => {
    await setGroupMemberRole(gid, mid, role)
    await get().refreshDetail()
  },
  kick: async (gid, mid) => {
    await kickGroupMember(gid, mid)
    await get().fetchMyGroups()
    await get().refreshDetail()
    await get().refreshLeaderboard()
  },
  transfer: async (gid, toUserId) => {
    await transferGroupOwner(gid, toUserId)
    await get().fetchMyGroups()
    await get().refreshDetail()
  },
  leave: async (gid) => {
    await leaveGroup(gid)
    await get().fetchMyGroups()
    get().clearDetail()
  },
}))

export default useGroupsStore
