import { useEffect, useState } from 'react'
import useStore from '../../store/useStore'
import { getPerceivedStats, submitPerceived, updatePerceived } from '../../api/client'
import { getAnonId } from '../../utils/helpers'

export default function PerceivedSection({ song }) {
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(null)
  const [opinion, setOpinion] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const updateSongPerceived = useStore(s => s.updateSongPerceived)
  const user = useStore(s => s.user)
  const anonId = getAnonId()
  // 로그인 사용자는 세션으로 식별해 익명 ID를 URL에 노출하지 않는다.
  const statsAnonId = user ? '' : anonId

  useEffect(() => {
    setSubmitted(false)
    getPerceivedStats(song.id, statsAnonId).then(data => {
      setStats(data)
      setSelected(data.my_vote ? data.my_vote.level : null)
      setOpinion('')
    })
  }, [song.id, user?.id])

  const allSteps = []
  for (let v = 0.5; v <= 12.0 + 1e-9; v += 0.5) allSteps.push(+v.toFixed(1))

  const bins = stats?.bins ?? new Array(24).fill(0)
  const maxBin = Math.max(...bins, 1)
  const officialBin = Math.round((song.level - 0.5) * 2)

  const handleSubmit = async () => {
    if (selected == null) return
    // 요청 본문의 익명 ID는 로그인 전 투표를 계정에 승계할 때만 사용한다.
    const payload = { anon_id: anonId, level: selected, opinion: opinion || null }
    try {
      if (stats?.my_vote) {
        await updatePerceived(song.id, payload)
      } else {
        await submitPerceived(song.id, payload)
      }
      const fresh = await getPerceivedStats(song.id, statsAnonId)
      setStats(fresh)
      setSubmitted(true)
      updateSongPerceived(song.id, fresh.avg ?? null, fresh.total_votes ?? 0)
    } catch (_) {
    }
  }

  const diff = selected != null ? selected - song.level : null

  return (
    <div className="perceived">
      <div className="perceived-head">
        <h5>유저 체감 레벨</h5>
        <span className="sub">
          표기: LV {song.level.toFixed(1)} · 투표{' '}
          <b style={{ color: 'var(--fg-3)' }}>{stats?.total_votes ?? 0}</b>명
        </span>
      </div>

      <div className="perceived-row">
        <div className="perceived-avg">
          <div className="big">{stats?.avg != null ? stats.avg.toFixed(1) : '—'}</div>
          <div className="lbl">체감 평균</div>
          {stats?.avg != null && (
            <div className="n">
              {(stats.avg - song.level) >= 0 ? '+' : ''}{(stats.avg - song.level).toFixed(2)} vs 표기
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="perceived-dist">
            {bins.map((v, i) => (
              <div
                key={i}
                className={`perceived-bar${i === officialBin ? ' highlight' : ''}`}
                style={{ height: `${maxBin ? (v / maxBin * 100) : 0}%` }}
                title={`LV ${(0.5 + i * 0.5).toFixed(1)} — ${v}표`}
              />
            ))}
          </div>
          <div className="perceived-scale">
            <span>0.5</span><span>3.0</span><span>6.0</span><span>9.0</span><span>12.0</span>
          </div>
        </div>
      </div>

      <div className="perceived-notice">
        여러분의 데이터로 많은 사람들의 게임 환경을 개선합니다.<br/>
        부적절한 체감 난이도는 삭제됩니다.
      </div>

      <div className="perceived-form-block">
        <div style={{ fontSize: 11.5, color: 'var(--fg-3)', fontWeight: 500, marginBottom: 8 }}>
          내 체감 난이도를 선택해주세요
        </div>
        <div className="perceived-steps">
          {allSteps.map(v => (
            <button
              key={v}
              className={`perceived-step${v === song.level ? ' is-official' : ''}${selected === v ? ' on' : ''}`}
              onClick={() => !submitted && setSelected(v)}
              title={v === song.level ? '표기 난이도' : ''}
            >
              {v.toFixed(1)}
            </button>
          ))}
        </div>

        {selected != null && (
          <div style={{ marginTop: 10, fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: diff > 0.3 ? 'oklch(0.75 0.18 25)' : diff < -0.3 ? 'var(--ok)' : 'var(--fg-4)' }}>
            공식 {song.level.toFixed(1)} → 내 체감 {selected.toFixed(1)} ({diff >= 0 ? '+' : ''}{diff?.toFixed(1)})
          </div>
        )}

        {!submitted && (
          <>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginBottom: 6 }}>간단한 의견</div>
              <textarea
                value={opinion}
                onChange={e => setOpinion(e.target.value)}
                placeholder="간단한 의견을 작성해주세요 (선택)"
                rows={2}
                style={{
                  width: '100%', background: 'var(--surface-1)', border: '1px solid var(--line-soft)',
                  borderRadius: 8, padding: '8px 10px', color: 'var(--fg)', fontSize: 12.5,
                  fontFamily: 'inherit', resize: 'vertical', minHeight: 48, outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: 12, padding: '6px 14px' }}
                disabled={selected == null}
                onClick={handleSubmit}
              >
                등록
              </button>
            </div>
          </>
        )}
        {submitted && (
          <div style={{ marginTop: 12, color: 'var(--ok)', fontSize: 12.5 }}>등록됨 ✓</div>
        )}
      </div>
    </div>
  )
}
