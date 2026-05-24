import { SERVER_LINKS, SERVER_MODE } from '../utils/serverMode'
import { saveCurrentListState, withRestoreListParam } from '../utils/listState'
import useStore from '../store/useStore'

export default function ServerSwitcher({ className = '' }) {
  const go = (mode) => {
    if (mode === SERVER_MODE) return
    saveCurrentListState(useStore.getState())
    window.location.href = withRestoreListParam(SERVER_LINKS[mode])
  }

  const rootClass = ['server-switcher', className].filter(Boolean).join(' ')

  return (
    <div className={rootClass} aria-label="서버 선택">
      <button
        type="button"
        className={SERVER_MODE === 'kr' ? 'active' : ''}
        onClick={() => go('kr')}
      >
        한국 서버
      </button>
      <button
        type="button"
        className={SERVER_MODE === 'xyx' ? 'active' : ''}
        onClick={() => go('xyx')}
      >
        중국 서버
      </button>
    </div>
  )
}
