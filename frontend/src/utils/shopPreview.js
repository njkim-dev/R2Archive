export const canPreviewItem = item => !!(item?.preview_available && item?.model || item?.couple_preview?.motion && item?.couple_preview?.audio)
