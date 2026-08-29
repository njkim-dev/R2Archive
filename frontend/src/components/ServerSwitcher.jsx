import { SERVER_LINKS, SERVER_MODE } from '../utils/serverMode'
import { makeSearchRestoreState, saveCurrentListState, withRestoreListParam } from '../utils/listState'
import useStore from '../store/useStore'

export default function ServerSwitcher({ className = '' }) {
  const go = (mode) => {
    if (mode === SERVER_MODE) return
    const state = useStore.getState()
    saveCurrentListState(state)
    window.location.href = withRestoreListParam(SERVER_LINKS[mode], makeSearchRestoreState(state))
  }

  const rootClass = ['server-switcher', className].filter(Boolean).join(' ')

  return (
    <div className={rootClass} role="group" aria-label="서버 선택">
      <button
        type="button"
        className={SERVER_MODE === 'kr' ? 'active' : ''}
        aria-pressed={SERVER_MODE === 'kr'}
        onClick={() => go('kr')}
      >
        한국 서버
      </button>
      <button
        type="button"
        className={SERVER_MODE === 'xyx' ? 'active' : ''}
        aria-pressed={SERVER_MODE === 'xyx'}
        onClick={() => go('xyx')}
      >
        중국 서버
      </button>
    </div>
  )
}
