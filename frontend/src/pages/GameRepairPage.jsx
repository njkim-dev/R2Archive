import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { inspectInstallation, repairFileUrl, repairTargets } from '../utils/gameRepair'
import '../styles/game-repair.css'

const labels = { ok: '일치', missing: '누락', size: '불일치', hash: '불일치', unreadable: '읽기 실패' }

export default function GameRepairPage() {
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
      setMessage('게임과 런처를 종료한 뒤 설치 폴더를 선택해주세요.')
    } catch (error) { setMessage(error.message) }
  }
  useEffect(() => {
    loadManifest()
    return () => scanController.current?.abort()
  }, [])

  async function scan(selected) {
    setResult(null)
    const checked = await inspectInstallation(selected, manifest, ({ completed, total, file, bytes: read, size }) => {
      setProgress((completed + (size ? read / size : 0)) / total * 100)
      setMessage(`SHA-256 검사 중 · ${completed}/${total} · ${file}${size ? ` (${Math.floor(read / size * 100)}%)` : ''}`)
    }, { signal: scanController.current.signal })
    setFolderName(checked.folder)
    setResult(checked)
    setProgress(100)
    const issues = checked.rows.filter(row => row.status !== 'ok').length
    setMessage(issues ? `검사 완료 · 확인이 필요한 파일 ${issues}개. ‘파일 받기’로 내려받아 설치 폴더에 넣은 후 다시 검사해주세요.` : '검사 대상 파일의 SHA-256이 모두 일치합니다. 계속 종료된다면 보안 프로그램의 보호 기록과 게임 오류 로그를 확인해주세요.')
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

  const targets = manifest ? repairTargets(manifest) : []
  const totalBytes = targets.reduce((total, file) => total + file.size, 0)
  const rows = result?.rows.filter(row => !onlyIssues || row.status !== 'ok') || []
  return <main className="repair-page">
    <header className="repair-heading"><Link to="/">← 처음으로</Link><h1>게임 설치 파일 검사 · 복구</h1><p>한국 VFUN 알투비트의 주요 게임 파일을 SHA-256으로 검사합니다.</p></header>
    <section className="repair-guide">
      <h2>게임과 런처를 종료하고 시작하세요</h2>
      <p>기본 설치 경로: <code>C:\VFUN\R2beat</code> · 경로를 모르면 게임 바로가기를 우클릭해 ‘파일 위치 열기’를 확인하세요.</p>
      <p>파일의 SHA-256을 정상 기준값과 비교합니다. 파일을 나눠 읽으며 디스크 속도에 따라 수 분 걸릴 수 있습니다. 파일 내용은 서버에 업로드하지 않습니다.</p>
      <p>문제 파일은 ‘파일 받기’로 다운로드한 뒤 설치 폴더에 직접 넣어주세요. 기존 파일을 교체한다면 먼저 별도 폴더에 백업해주세요.</p>
      <p>복구 후에도 파일이 사라지면 Windows 보안의 ‘보호 기록’을 확인해주세요. 내용이 같아도 PC 환경에 따른 실행 오류까지 확인하는 검사는 아닙니다.</p>
      <p>폴더 선택 창에 ‘업로드’라고 표시돼도 파일은 이 PC 안에서만 검사하며 서버로 전송하지 않습니다. 브라우저의 보안 설정을 변경할 필요가 없습니다.</p>
    </section>
    {!supported && <p className="repair-unsupported" role="alert">Windows의 Chrome 또는 Edge에서 열어주세요. 이 브라우저는 폴더 선택을 지원하지 않습니다.</p>}
    <div className="repair-toolbar">
      <input ref={folderInput} type="file" webkitdirectory="" multiple hidden aria-label="게임 설치 폴더" onChange={selectFolder} />
      <button disabled={!supported || !manifest || busy} onClick={() => folderInput.current.click()}>설치 폴더 선택 · 검사</button>
      <button disabled={!busy} onClick={() => scanController.current?.abort()}>검사 취소</button>
      <button disabled={busy || !!manifest} onClick={loadManifest}>기준 정보 다시 불러오기</button>
      <label><input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} /> 문제 파일만</label>
    </div>
    <div className="repair-status" role="status" aria-live="polite"><p>{message}</p><progress aria-label="SHA-256 검사 진행률" max="100" value={progress} /><span>{manifest ? `검사 대상 ${targets.length}개 · ${(totalBytes / 1024 ** 3).toFixed(2)} GiB` : '기준 정보 확인 중'}{folderName ? ` · 선택 폴더: ${folderName}` : ''}</span></div>
    <section className="repair-results" aria-label="파일 검사 결과" aria-busy={busy}>
      <table><thead><tr><th>파일</th><th>상태</th><th>다운로드</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.name} className={row.status === 'ok' ? '' : 'repair-issue'}><td>{row.name}</td><td>{labels[row.status]}</td><td>{row.status !== 'ok' && <a href={repairFileUrl(manifest, row)} download={row.name}>파일 받기</a>}</td></tr>)}</tbody>
      </table>
      {!rows.length && <p className="repair-empty">{!result ? '폴더를 선택하면 검사 결과가 여기에 표시됩니다.' : onlyIssues ? '문제가 발견되지 않았습니다. 전체 파일은 ‘문제 파일만’을 해제해 확인하세요.' : '검사할 파일이 없습니다.'}</p>}
    </section>
  </main>
}
