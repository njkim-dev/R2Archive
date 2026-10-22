import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { inspectInstallation, repairFileUrl, repairTargets } from '../utils/gameRepair'
import { estimateScanTime } from '../utils/scanTime'
import useRepairAvailability from '../hooks/useRepairAvailability'
import RepairAvailability from '../components/RepairAvailability'
import '../styles/game-repair.css'

const labels = { ok: '일치', missing: '누락', size: '불일치', hash: '불일치', unreadable: '읽기 실패' }

export default function GameRepairPage() {
  const [params] = useSearchParams()
  const mode = params.get('mode')
  const availability = useRepairAvailability()
  const available = !!availability.status?.enabled
  if (mode === 'launch' || mode === 'music') return <RepairInspection key={mode} mode={mode} availability={availability} />
  return <main className="repair-page repair-choice-page">
    <header className="repair-heading"><Link to="/">← 처음으로</Link><h1>게임 설치 파일 검사 및 복구</h1><p>어떤 문제가 발생하나요?</p></header>
    <RepairAvailability status={availability.status} />
    <nav className="repair-choices" aria-label="복구 유형 선택">
      <Link to="?mode=launch" aria-disabled={!available} tabIndex={available ? undefined : -1} onClick={event => { if (!available) event.preventDefault() }}>게임 실행이 안되거나 게임이 튕기시나요?</Link>
      <Link to="?mode=music" aria-disabled={!available} tabIndex={available ? undefined : -1} onClick={event => { if (!available) event.preventDefault() }}>특정 노래가 튕기시나요?</Link>
    </nav>
  </main>
}

function RepairInspection({ mode, availability }) {
  const available = !!availability.status?.enabled
  const revision = availability.status?.revision
  const manifestRequest = useRef(0)
  const scanTiming = useRef(null)
  const [remainingTime, setRemainingTime] = useState('남은 시간 계산 중…')
  const [manifest, setManifest] = useState(null)
  const [loadedRevision, setLoadedRevision] = useState(null)
  const [folderName, setFolderName] = useState('')
  const folderInput = useRef(null)
  const scanController = useRef(null)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [scanComplete, setScanComplete] = useState(false)
  const [musicWarning, setMusicWarning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('복구 기준 정보를 불러오고 있습니다.')
  const supported = 'webkitdirectory' in document.createElement('input')

  async function loadManifest() {
    if (!available) return
    const request = ++manifestRequest.current
    try {
      const response = await fetch('/api/game-repair/manifest', { cache: 'no-store' })
      if (!response.ok) throw new Error((await response.json()).detail || '복구 기준 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
      const data = await response.json()
      if (!data.snapshot || !Array.isArray(data.files) || !data.files.length) throw new Error('복구 기준 정보가 올바르지 않습니다.')
      if (request !== manifestRequest.current) return
      setManifest(data)
      setLoadedRevision(revision)
      setMessage('게임을 종료한 뒤 설치 폴더를 선택해주세요.')
    } catch (error) { if (request === manifestRequest.current) setMessage(error.message) }
  }
  useEffect(() => {
    scanController.current?.abort()
    setManifest(null)
    setLoadedRevision(null)
    setScanComplete(false)
    setMusicWarning(false)
    setResult(null)
    manifestRequest.current++
    if (available) loadManifest()
    return () => { manifestRequest.current++; scanController.current?.abort() }
  }, [available, revision])

  useEffect(() => {
    if (!busy && scanComplete && musicWarning) {
      setMusicWarning(false)
      window.alert('음악 파일도 일부 문제가 발견되었습니다.\n복구 완료 후, 음악 파일 복구도 진행해주세요')
    }
  }, [busy, scanComplete, musicWarning])

  useEffect(() => {
    if (!busy) return
    const timer = window.setInterval(() => {
      const stats = scanTiming.current
      if (stats) setRemainingTime(estimateScanTime({ ...stats, elapsedMs: performance.now() - stats.startedAt }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [busy])

  async function scan(selected, controller) {
    setResult(null)
    setScanComplete(false)
    setMusicWarning(false)
    const checked = await inspectInstallation(selected, manifest, ({ completed, total, file, bytes: read, size, bytesRead, remainingBytes, elapsedMs }) => {
      if (controller.signal.aborted) return
      scanTiming.current = { bytesRead, remainingBytes, startedAt: performance.now() - elapsedMs }
      setRemainingTime(estimateScanTime({ bytesRead, remainingBytes, elapsedMs }))
      setProgress((completed + (size ? read / size : 0)) / total * 100)
      setMessage(`SHA-256 검사 중 · ${completed}/${total} · ${file}${size ? ` (${Math.floor(read / size * 100)}%)` : ''}`)
    }, { signal: controller.signal, mode, onRow: row => {
      if (controller.signal.aborted) return
      setResult(current => ({ rows: [...(current?.rows || []), row] }))
    } })
    if (controller.signal.aborted) throw new DOMException('검사가 중단되었습니다.', 'AbortError')
    setFolderName(checked.folder)
    setResult(checked)
    setScanComplete(true)
    setMusicWarning(checked.musicIssues.length > 0)
    setProgress(100)
    const issues = checked.rows.filter(row => row.status !== 'ok').length
    setMessage(issues ? `검사 완료 · 확인이 필요한 파일 ${issues}개. 개별 파일 또는 ZIP으로 내려받아 설치 폴더에 넣은 후 다시 검사해주세요.` : '검사 대상 파일의 SHA-256이 모두 일치합니다. 계속 종료된다면 보안 프로그램의 보호 기록과 게임 오류 로그를 확인해주세요.')
  }

  async function selectFolder(event) {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selected.length) return
    if (!available || !manifest || loadedRevision !== revision || busy) return
    scanController.current = new AbortController()
    scanTiming.current = null
    setRemainingTime('남은 시간 계산 중…')
    setBusy(true)
    setProgress(0)
    setFolderName('')
    setMessage('SHA-256 검사를 시작합니다.')
    try {
      const latest = await availability.refresh()
      if (!latest?.enabled || latest.revision !== revision) throw new Error(latest?.message || '운영 상태가 변경되었습니다. 기준 정보를 확인한 후 다시 검사해주세요.')
      await scan(selected, scanController.current)
    }
    catch (error) {
      setProgress(0)
      setMessage(error.name === 'AbortError' ? '검사를 취소했습니다. 부분 검사 결과는 정상 판정에 사용하지 않습니다.' : `검사하지 못했습니다: ${error.message}`)
    }
    finally { setBusy(false) }
  }

  const ready = available && !!manifest && loadedRevision === revision
  const canDownload = ready && scanComplete && !busy
  const issues = result?.rows.filter(row => row.status !== 'ok') || []
  const archiveParams = new URLSearchParams()
  issues.forEach(row => archiveParams.append('name', row.name))
  const archiveUrl = manifest ? `/api/game-repair/archive/${encodeURIComponent(manifest.snapshot)}?${archiveParams}` : ''
  const targets = manifest ? repairTargets(manifest, mode) : []
  const totalBytes = targets.reduce((total, file) => total + file.size, 0)
  const rows = issues
  return <main className="repair-page">
    <header className="repair-heading"><Link to="/game-repair">← 문제 유형 선택</Link><h1>게임 설치 파일 검사 및 복구</h1><p>{mode === 'music' ? '특정 노래가 튕기시나요? 음악 파일을 검사합니다.' : '알투비트의 주요 게임 파일을 검사합니다.'}</p></header>
    <RepairAvailability status={availability.status} />
    <section className="repair-guide">
      <h2>게임을 종료하고 시작하세요</h2>
      <p>게임 설치 경로를 선택해서 파일을 검사하세요.</p>
      <p>경로를 모르면 VLauncher에서 게임 실행 버튼 좌측의 설정 버튼을 클릭하면, 설치 경로를 확인할 수 있습니다.</p>
      <p>현재 설치된 파일이 올바르게 설치된게 맞는지 검사합니다.</p>
      <p>중요 핵심 파일을 나눠 읽으며 디스크 속도에 따라 수 분 걸릴 수 있습니다. 파일 내용은 서버에 업로드하지 않습니다.</p>
      <p>문제 파일은 개별 파일 또는 ZIP으로 다운로드한 뒤 설치 폴더에 넣어주세요.</p>
      <p>폴더 선택 창에 '업로드'라고 표시되어도 파일은 이 PC 안에서만 검사하며 서버로 전송하지 않습니다. 브라우저의 보안 설정을 변경할 필요가 없습니다.</p>
    </section>
    {!supported && <p className="repair-unsupported" role="alert">Windows의 Chrome 또는 Edge에서 열어주세요. 이 브라우저는 폴더 선택을 지원하지 않습니다.</p>}
    <div className="repair-toolbar">
      <input ref={folderInput} type="file" webkitdirectory="" multiple hidden aria-label="게임 설치 폴더" onChange={selectFolder} />
      <button disabled={!supported || !ready || busy} onClick={() => folderInput.current.click()}>설치 폴더 선택 · 검사</button>
      <button disabled={!busy} onClick={() => scanController.current?.abort()}>검사 취소</button>
      <button disabled={!available || busy || !!manifest} onClick={loadManifest}>기준 정보 다시 불러오기</button>
    </div>
    <div className="repair-status" role="status" aria-live="polite"><p>{message}</p><progress aria-label="SHA-256 검사 진행률" max="100" value={progress} /><span>{manifest ? `검사 대상 ${targets.length}개 · ${(totalBytes / 1024 ** 3).toFixed(2)} GiB` : '기준 정보 확인 중'}{folderName ? ` · 선택 폴더: ${folderName}` : ''}</span><span className="repair-eta" aria-label="예상 남은 시간">{busy ? remainingTime : scanComplete ? '예상 남은 시간: 0초' : '예상 남은 시간: —'}</span></div>
    <div className="repair-download-toolbar">
      <a role="link" href={canDownload && issues.length ? archiveUrl : undefined} download="R2beat-repair.zip" aria-disabled={!canDownload || !issues.length} tabIndex={canDownload && issues.length ? undefined : -1}>문제 파일 일괄 받기</a>
    </div>
    <p className="repair-download-note">문제 파일을 ZIP으로 내려받습니다. 받은 ZIP은 게임 설치 폴더에 압축을 풀어주세요.</p>
    <section className="repair-results" aria-label="파일 검사 결과" aria-busy={busy}>
      <table><thead><tr><th>파일</th><th>상태</th><th>다운로드</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.name} className={row.status === 'ok' ? '' : 'repair-issue'}><td>{row.name}</td><td>{labels[row.status]}</td><td>{row.status !== 'ok' && <a role="link" href={canDownload ? repairFileUrl(manifest, row) : undefined} aria-disabled={!canDownload} tabIndex={canDownload ? undefined : -1} download={row.name}>파일 받기</a>}</td></tr>)}</tbody>
      </table>
      {!rows.length && <p className="repair-empty">{busy ? '검사 중입니다. 확인된 문제 파일부터 표시합니다.' : !result ? '폴더를 선택하면 검사 결과가 여기에 표시됩니다.' : !scanComplete ? '검사가 완료되지 않았습니다. 폴더를 다시 선택해 검사해주세요.' : '문제가 발견되지 않았습니다.'}</p>}
    </section>
  </main>
}
