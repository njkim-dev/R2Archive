import { Link } from 'react-router-dom'
import useStore from '../store/useStore'

export default function RepairAvailability({ status }) {
  const isAdmin = useStore(s => s.isAdmin)
  return <section className="repair-availability" aria-label="복구 서비스 운영 상태" role="status">
    <p>{!status ? '복구 서비스 운영 상태를 확인 중입니다.' : status.enabled ? '파일 검사와 복구를 이용할 수 있습니다.' : status.message || '게임 점검 중입니다. 잠시 후 다시 이용해주세요.'}</p>
    {isAdmin && <Link className="repair-admin-link" to="/game-repair/admin">복구 기능 관리</Link>}
  </section>
}
