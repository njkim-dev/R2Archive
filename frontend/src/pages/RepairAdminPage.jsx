import { useState } from 'react'
import { Link } from 'react-router-dom'
import useStore from '../store/useStore'
import useRepairAvailability from '../hooks/useRepairAvailability'
import { setRepairAvailability } from '../api/client'
import '../styles/game-repair.css'

export default function RepairAdminPage() {
  const { authLoaded, adminLoaded, isAdmin, user, openLogin } = useStore()
  const { status, refresh } = useRepairAvailability()
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  async function save(enabled) {
    setSaving(true)
    setMessage('운영 상태를 저장 중입니다.')
    try {
      await setRepairAvailability(enabled)
      const latest = await refresh()
      setMessage(latest?.enabled === enabled ? (enabled ? '복구 기능을 열었습니다.' : '복구 기능을 닫았습니다.') : '운영 상태를 다시 확인해주세요.')
    } catch (error) {
      setMessage(error?.response?.data?.detail || '저장하지 못했습니다. 다시 시도해주세요.')
    } finally { setSaving(false) }
  }
  const waiting = !authLoaded || (user && !adminLoaded)
  return <main className="repair-page">
    <header className="repair-heading"><Link to="/game-repair">← 게임 복구</Link><h1>복구 기능 관리</h1><p>관리자 전용 운영 설정입니다.</p></header>
    {isAdmin ? <>
      <section className="repair-guide"><h2>점검 중에는 복구 기능을 닫아주세요</h2><p>닫으면 두 검사 유형과 새 개별 파일·ZIP 다운로드 요청이 차단됩니다.</p><p>다시 열기 전에 정상 PC에서 패치를 받고, 정상 실행과 NAS 기준 파일 갱신을 확인해주세요.</p><p>접속 중인 화면도 약 10초 간격으로 상태를 확인해 검사를 중단합니다.</p></section>
      <div className="repair-admin-status" role="status">{!status ? '운영 상태를 확인 중입니다.' : status.revision === 'unavailable' ? status.message : status.enabled ? '현재 상태: 열림' : '현재 상태: 닫힘'}</div>
      <div className="repair-toolbar"><button disabled={!status || saving || status.enabled} onClick={() => save(true)}>복구 기능 열기</button><button disabled={!status || saving || !status.enabled && status.revision !== 'unavailable'} onClick={() => save(false)}>복구 기능 닫기</button></div>
      <p className="repair-admin-message" role="status" aria-live="polite">{message}</p>
    </> : <section className="repair-guide"><h2>{waiting ? '관리자 권한을 확인 중입니다.' : '관리자만 이용할 수 있습니다.'}</h2>{authLoaded && !user && <button onClick={openLogin}>로그인</button>}</section>}
  </main>
}
