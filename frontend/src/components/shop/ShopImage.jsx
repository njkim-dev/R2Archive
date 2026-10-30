import { createContext, useContext, useEffect, useState } from 'react'
import { createShopImageCache } from '../../utils/shopImageCache'

const ImageCache = createContext(null)

export function ShopImageSession({ children }) {
  const [cache] = useState(() => createShopImageCache())
  useEffect(() => () => cache.clear(), [cache])
  return <ImageCache.Provider value={cache}>{children}</ImageCache.Provider>
}

export default function ShopImage({ item }) {
  const cache = useContext(ImageCache)
  const [image, setImage] = useState(null)
  useEffect(() => {
    setImage(null)
    if (!item?.thumbnail) return
    let active = true
    const handle = cache.acquire(item.thumbnail)
    handle.promise.then(url => { if (active) setImage({ source: item.thumbnail, url }) }).catch(() => { if (active) setImage({ source: item.thumbnail, failed: true }) })
    return () => { active = false; handle.release() }
  }, [cache, item?.thumbnail])
  return image?.source === item?.thumbnail && image?.url
    ? <img src={image.url} alt={item.name} width="128" height="128" decoding="async" onError={() => setImage(null)} />
    : <span className="shop-image-fallback">{item?.thumbnail && !image?.failed ? '이미지 불러오는 중' : '이미지 준비 중'}</span>
}
