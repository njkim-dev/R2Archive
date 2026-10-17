import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { inspectInstallation, repairFileUrl, repairTargets } from '../utils/gameRepair'
import '../styles/game-repair.css'

const labels = { ok: '일치', missing: '누락', size: '불일치', hash: '불일치', unreadable: '읽기 실패' }

export default function GameRepairPage() {
  const [params] = useSearchParams()
  const mode = params.get('mode')
  if (mode === 'launch' || mode === 'music') return <RepairInspection key={mode} mode={mode} />
  return <main className="repair-page repair-choice-page">
    <header className="repair-heading"><Link to="/">← 처음으로</Link><h1>게임 설치 파일 검사 및 복구</h1><p>어떤 문제가 발생하나요?</p></header>
    <nav className="repair-choices" aria-label="복구 유형 선택">
      <Link to="?mode=launch">게임 실행이 안 되시나요?</Link>
      <Link to="?mode=music">특정 노래가 튕기시나요?</Link>
    </nav>
  </main>
}

function RepairInspection({ mode }) {
  const downloadController = useRef(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadMessage, setDownloadMessage] = useState('검사 후 문제 파일을 ZIP 하나로 받을 수 있습니다. 받은 ZIP은 게임 설치 폴더에 압축을 풀어주세요.')
  const [manifest, setManifest] = useState(null)
  const [folderName, setFolderName] = useState('')
  const folderInput = useRef(null)
  const scanController = useRef(null)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('복구 기준 정보를 불러오고 있습니다.')
  const [onlyIssues, setOnlyIssues] = useState(true)
  const supported = 'webkitdirectory' in document.createElement('input')

  async function loadManifest() {
    try {
      const response = await fetch('/api/game-repair/manifest', { cache: 'no-store' })
      if (!response.ok) throw new Error('복구 기준 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
      const data = await response.json()
      if (!data.snapshot || !Array.isArray(data.files) || !data.files.length) throw new Error('복구 기준 정보가 올바르지 않습니다.')
      setManifest(data)
      setMessage('게임을 종료한 뒤 설치 폴더를 선택해주세요.')
    } catch (error) { setMessage(error.message) }
  }
  useEffect(() => {
    loadManifest()
    return () => { scanController.current?.abort(); downloadController.current?.abort() }
  }, [])

  async function scan(selected) {
    setResult(null)
    const checked = await inspectInstallation(selected, manifest, ({ completed, total, file, bytes: read, size }) => {
      setProgress((completed + (size ? read / size : 0)) / total * 100)
      setMessage(`SHA-256 검사 중 · ${completed}/${total} · ${file}${size ? ` (${Math.floor(read / size * 100)}%)` : ''}`)
    }, { signal: scanController.current.signal, mode })
    setFolderName(checked.folder)
    setResult(checked)
    setProgress(100)
    const issues = checked.rows.filter(row => row.status !== 'ok').length
    setMessage(issues ? `검사 완료 · 확인이 필요한 파일 ${issues}개. 개별 파일 또는 ZIP으로 내려받아 설치 폴더에 넣은 후 다시 검사해주세요.` : '검사 대상 파일의 SHA-256이 모두 일치합니다. 계속 종료된다면 보안 프로그램의 보호 기록과 게임 오류 로그를 확인해주세요.')
  }

  async function selectFolder(event) {
    const selected = Array.from(event.target.files || [])
    event.target.value = ''
    if (!selected.length) return
    scanController.current = new AbortController()
    setBusy(true)
    setProgress(0)
    setFolderName('')
    setMessage('SHA-256 검사를 시작합니다.')
    try { await scan(selected) }
    catch (error) {
      setProgress(0)
      setMessage(error.name === 'AbortError' ? '검사를 취소했습니다. 부분 검사 결과는 정상 판정에 사용하지 않습니다.' : `검사하지 못했습니다: ${error.message}`)
    }
    finally { setBusy(false) }
  }

  async function downloadArchive() {
    if (!issues.length || downloading || busy) return
    if (!window.showSaveFilePicker) {
      const link = document.createElement('a')
      link.href = archiveUrl
      link.download = 'R2beat-repair.zip'
      link.click()
      setDownloadMessage('브라우저 다운로드를 시작했습니다. 저장 위치는 브라우저 설정을 따릅니다. 받은 ZIP은 게임 설치 폴더에 압축을 풀어주세요.')
      return
    }
    const controller = new AbortController()
    downloadController.current = controller
    setDownloading(true)
    setDownloadMessage('ZIP을 저장할 위치를 선택해주세요.')
    let writable
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'R2beat-repair.zip',
        types: [{ description: 'ZIP 파일', accept: { 'application/zip': ['.zip'] } }],
      })
      controller.signal.throwIfAborted()
      writable = await handle.createWritable()
      controller.signal.throwIfAborted()
      setDownloadMessage('ZIP 다운로드를 시작합니다.')
      const response = await fetch(archiveUrl, { signal: controller.signal })
      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(typeof error.detail === 'string' ? error.detail : 'ZIP을 내려받지 못했습니다. 다시 검사한 후 시도해주세요.')
      }
      if (!response.body) throw new Error('다운로드 스트림을 열지 못했습니다.')
      let received = 0
      let lastUpdate = 0
      const progress = new TransformStream({ transform(chunk, output) {
        received += chunk.byteLength
        const now = performance.now()
        if (now - lastUpdate > 150) {
          setDownloadMessage(`ZIP 다운로드 중 · ${(received / 1024 ** 2).toFixed(1)} MB 받음`)
          lastUpdate = now
        }
        output.enqueue(chunk)
      } })
      await response.body.pipeThrough(progress).pipeTo(writable, { signal: controller.signal })
      writable = null
      setDownloadMessage('ZIP 저장을 완료했습니다. 게임을 종료한 뒤 설치 폴더에 압축을 풀고 다시 검사해주세요. 기존 파일은 먼저 백업해주세요.')
    } catch (error) {
      if (writable) await writable.abort().catch(() => {})
      setDownloadMessage(error.name === 'AbortError' ? 'ZIP 다운로드를 취소했습니다.' : `ZIP을 저장하지 못했습니다: ${error.message} 기본 다운로드를 이용하거나 다시 시도해주세요.`)
    } finally {
      downloadController.current = null
      setDownloading(false)
    }
  }

  const issues = result?.rows.filter(row => row.status !== 'ok') || []
  const archiveParams = new URLSearchParams()
  issues.forEach(row => archiveParams.append('name', row.name))
  const archiveUrl = manifest ? `/api/game-repair/archive/${encodeURIComponent(manifest.snapshot)}?${archiveParams}` : ''
  const targets = manifest ? repairTargets(manifest, mode) : []
  const totalBytes = targets.reduce((total, file) => total + file.size, 0)
  const rows = result?.rows.filter(row => !onlyIssues || row.status !== 'ok') || []
  return <main className="repair-page">
    <header className="repair-heading"><Link to="/game-repair">← 문제 유형 선택</Link><h1>게임 설치 파일 검사 및 복구</h1><p>{mode === 'music' ? '특정 노래가 튕기시나요? 음악 파일을 검사합니다.' : '알투비트의 주요 게임 파일을 검사합니다.'}</p></header>
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
      <button disabled={!supported || !manifest || busy || downloading} onClick={() => folderInput.current.click()}>설치 폴더 선택 · 검사</button>
      <button disabled={!busy} onClick={() => scanController.current?.abort()}>검사 취소</button>
      <button disabled={busy || downloading || !!manifest} onClick={loadManifest}>기준 정보 다시 불러오기</button>
      <label><input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} /> 문제 파일만</label>
    </div>
    <div className="repair-status" role="status" aria-live="polite"><p>{message}</p><progress aria-label="SHA-256 검사 진행률" max="100" value={progress} /><span>{manifest ? `검사 대상 ${targets.length}개 · ${(totalBytes / 1024 ** 3).toFixed(2)} GiB` : '기준 정보 확인 중'}{folderName ? ` · 선택 폴더: ${folderName}` : ''}</span></div>
    <div className="repair-download-toolbar">
      <button disabled={busy || downloading || !issues.length} onClick={downloadArchive}>문제 파일 일괄 받기 (ZIP)</button>
      <button disabled={!downloading} onClick={() => downloadController.current?.abort()}>다운로드 취소</button>
      <a href={!busy && !downloading && issues.length ? archiveUrl : undefined} download="R2beat-repair.zip" aria-disabled={busy || downloading || !issues.length}>기본 다운로드로 받기</a>
    </div>
    <p className="repair-download-status" role="status" aria-live="polite">{downloadMessage}</p>
    <section className="repair-results" aria-label="파일 검사 결과" aria-busy={busy}>
      <table><thead><tr><th>파일</th><th>상태</th><th>다운로드</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.name} className={row.status === 'ok' ? '' : 'repair-issue'}><td>{row.name}</td><td>{labels[row.status]}</td><td>{row.status !== 'ok' && <a href={repairFileUrl(manifest, row)} download={row.name}>파일 받기</a>}</td></tr>)}</tbody>
      </table>
      {!rows.length && <p className="repair-empty">{!result ? '폴더를 선택하면 검사 결과가 여기에 표시됩니다.' : onlyIssues ? '문제가 발견되지 않았습니다. 전체 파일은 ‘문제 파일만’을 해제해 확인하세요.' : '검사할 파일이 없습니다.'}</p>}
    </section>
  </main>
}
