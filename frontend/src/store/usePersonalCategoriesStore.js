import { create } from 'zustand'
import {
  getMyPersonalCategories,
  getEditablePersonalCategories,
  getPublicPersonalCategories,
  getMySubscribedPersonalCategories,
  createPersonalCategory,
  patchPersonalCategory,
  subscribePersonalCategory,
  unsubscribePersonalCategory,
  setPersonalCategoryMemberRole,
  deletePersonalCategoryMember,
  addSongToPersonalCategory,
  deleteSongFromPersonalCategory,
} from '../api/client'

const usePersonalCategoriesStore = create((set, get) => ({
  myCategories: [],
  editableCategories: [],
  publicCategories: [],
  subscribedCategories: [],
  loaded: false,
  publicLoaded: false,
  subscribedLoaded: false,
  loading: false,

  fetchMyCategories: async () => {
    set({ loading: true })
    try {
      const data = await getMyPersonalCategories()
      set({ myCategories: data, loaded: true, loading: false })
      return data
    } catch (e) {
      set({ myCategories: [], loaded: true, loading: false })
      throw e
    }
  },

  fetchEditableCategories: async () => {
    try {
      const data = await getEditablePersonalCategories()
      set({ editableCategories: data })
      return data
    } catch (e) {
      set({ editableCategories: [] })
      throw e
    }
  },

  fetchPublicCategories: async () => {
    try {
      const data = await getPublicPersonalCategories()
      set({ publicCategories: data, publicLoaded: true })
      return data
    } catch (e) {
      set({ publicCategories: [], publicLoaded: true })
      throw e
    }
  },

  fetchSubscribedCategories: async () => {
    try {
      const data = await getMySubscribedPersonalCategories()
      set({ subscribedCategories: data, subscribedLoaded: true })
      return data
    } catch (e) {
      set({ subscribedCategories: [], subscribedLoaded: true })
      throw e
    }
  },

  fetchDirectory: async (user) => {
    const jobs = [get().fetchPublicCategories()]
    if (user) {
      jobs.push(get().fetchMyCategories())
      jobs.push(get().fetchSubscribedCategories())
      jobs.push(get().fetchEditableCategories())
    }
    await Promise.allSettled(jobs)
  },

  create: async (body) => {
    const category = await createPersonalCategory(body)
    await Promise.allSettled([
      get().fetchMyCategories(),
      get().fetchPublicCategories(),
      get().fetchEditableCategories(),
    ])
    return category
  },

  patch: async (categoryId, body) => {
    await patchPersonalCategory(categoryId, body)
    await Promise.allSettled([
      get().fetchMyCategories(),
      get().fetchPublicCategories(),
      get().fetchSubscribedCategories(),
      get().fetchEditableCategories(),
    ])
  },

  subscribe: async (code) => {
    const result = await subscribePersonalCategory(code)
    await Promise.allSettled([
      get().fetchPublicCategories(),
      get().fetchSubscribedCategories(),
      get().fetchEditableCategories(),
    ])
    return result
  },

  unsubscribe: async (code) => {
    const result = await unsubscribePersonalCategory(code)
    await Promise.allSettled([
      get().fetchPublicCategories(),
      get().fetchSubscribedCategories(),
      get().fetchEditableCategories(),
    ])
    return result
  },

  updateMemberRole: async (categoryId, memberUserId, role) => {
    const result = await setPersonalCategoryMemberRole(categoryId, memberUserId, role)
    await Promise.allSettled([
      get().fetchSubscribedCategories(),
      get().fetchEditableCategories(),
    ])
    return result
  },

  removeMember: async (categoryId, memberUserId) => {
    const result = await deletePersonalCategoryMember(categoryId, memberUserId)
    await Promise.allSettled([
      get().fetchSubscribedCategories(),
      get().fetchEditableCategories(),
      get().fetchPublicCategories(),
    ])
    return result
  },

  saveSong: async (categoryId, songId) => {
    const result = await addSongToPersonalCategory(categoryId, songId)
    await Promise.allSettled([
      get().fetchMyCategories(),
      get().fetchPublicCategories(),
      get().fetchSubscribedCategories(),
      get().fetchEditableCategories(),
    ])
    return result
  },

  deleteSong: async (categoryId, songId) => {
    const result = await deleteSongFromPersonalCategory(categoryId, songId)
    await Promise.allSettled([
      get().fetchMyCategories(),
      get().fetchPublicCategories(),
      get().fetchSubscribedCategories(),
      get().fetchEditableCategories(),
    ])
    return result
  },

  clear: () => set({
    myCategories: [],
    editableCategories: [],
    subscribedCategories: [],
    loaded: false,
    subscribedLoaded: false,
    loading: false,
  }),
}))

export default usePersonalCategoriesStore
