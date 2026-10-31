import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import '../styles/shopSharing.css'
import { resolveShortUrl } from '../api/shopSharing'

export default function ShortLinkPage() {
  const { code } = useParams(), [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    resolveShortUrl(code, controller.signal).then(data => {
      if (!controller.signal.aborted && /^\/shop(?:\?|$)/.test(data.target)) window.location.replace('https://r2archive.com' + data.target)
    }).catch(() => { if (!controller.signal.aborted) setError('존재하지 않거나 만료된 공유 URL입니다.') })
    return () => controller.abort()
  }, [code])
  return <main className="share-link-status"><p role="status">{error || '공유된 화면을 불러오는 중입니다.'}</p>{error && <Link to="/shop">상점으로 이동</Link>}</main>
}
