import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleHelp, X } from 'lucide-react'
import { useLocation } from 'react-router-dom'

const PAGE_HELP = {
  songs: {
    title: '곡 목록 도움말',
    steps: [
      {
        title: '곡 검색 메뉴',
        body: '곡 목록은 알투비트 아카이브의 기본 화면이에요. 전체 음악을 검색하고, 난이도와 BPM 같은 정보를 비교한 뒤 곡 상세 카탈로그로 들어갈 수 있어요.',
        target: '.search, .mob-search',
      },
      {
        title: '페이지 메뉴 한눈에 보기',
        body: '왼쪽 메뉴나 모바일 상단 메뉴로 주요 기능을 오갈 수 있어요.',
        bullets: [
          '곡 목록: 현재 서비스 중인 전체 음악의 검색, 필터, 카탈로그 제공',
          '그룹: 그룹을 생성하여 그룹원들끼리 성과와 기록을 공유',
          '카테고리: 좋아하는 노래를 카테고리에 저장 가능, 카테고리 상호 공유 가능',
          '과거 피망곡: 피망 서비스 시절 곡 검색 가능',
          '피드백: 버그 및 기능 제안',
        ],
        target: '.page-nav, .mob-pnav',
      },
      {
        title: '카테고리와 빠른 필터',
        body: '별, 달, 해 채널과 신곡, 변속곡, 즐겨찾기 같은 빠른 필터를 조합해서 곡 목록을 좁힐 수 있어요.',
        target: '.side, .mob-chips',
      },
      {
        title: '곡 목록 읽기',
        body: '난이도, BPM, 콤보, 시간 정보를 비교하고 컬럼 제목을 클릭해 정렬할 수 있어요.',
        target: '.table-wrap, .mob-list-wrap',
      },
      {
        title: '개인 카테고리 저장',
        body: '곡명에 마우스를 올리면 개인 카테고리에 저장하는 버튼이 나타나요. 한 곡은 여러 카테고리에 저장할 수 있어요.',
        target: '.pcat-row-btn, .title-cell',
      },
    ],
  },
  groups: {
    title: '그룹 도움말',
    steps: [
      {
        title: '그룹 만들기와 가입',
        body: '새 그룹을 만들거나 받은 가입 코드로 그룹에 참여할 수 있어요.',
        target: '.grp-btn.primary, .grp-mob-actions',
      },
      {
        title: '내 그룹 목록',
        body: '가입한 그룹은 카드로 표시되고, 카드를 클릭하면 그룹 상세와 멤버 기록을 볼 수 있어요.',
        target: '.grp-grid, .grp-mob-list',
      },
      {
        title: '가입 신청',
        body: '승인이 필요한 그룹은 신청 상태가 남고, 관리자가 수락하면 그룹에 들어갈 수 있어요.',
        target: '.grp-card, .grp-mob-card',
      },
    ],
  },
  groupDetail: {
    title: '그룹 상세 도움말',
    steps: [
      {
        title: '그룹 정보와 코드',
        body: '그룹 설명, 멤버 수, 가입 코드를 확인하고 필요한 경우 코드를 복사하거나 재발급할 수 있어요.',
        target: '.gd-hero',
      },
      {
        title: '탭 전환',
        body: '리더보드, 멤버, 가입 신청, 관리 탭을 전환하면서 그룹 운영에 필요한 기능을 볼 수 있어요.',
        target: '.gd-tabs',
      },
      {
        title: '그룹 리더보드',
        body: '그룹 멤버들의 판정 기록을 기준으로 순위를 비교할 수 있어요.',
        target: '.gd-lb, .gd-lb-mob',
      },
    ],
  },
  personalCategories: {
    title: '음악 카테고리 도움말',
    steps: [
      {
        title: '카테고리 탭',
        body: '내 카테고리, 공개 카테고리, 구독한 카테고리를 탭으로 나눠 볼 수 있어요.',
        target: '.pcat-tabs, .mob-chips',
      },
      {
        title: '카테고리 만들기',
        body: '로그인 후 카테고리 이름과 공개 여부를 정해서 새 음악 카테고리를 만들 수 있어요.',
        target: '.grp-btn.primary, .pcat-mobile-create',
      },
      {
        title: '공유와 열기',
        body: '카테고리 카드에서 링크를 복사해 공유하거나 바로 열 수 있어요. 링크를 받은 사람은 비공개 카테고리도 볼 수 있어요.',
        target: '.grp-grid, .pcat-mobile-body',
      },
    ],
  },
  personalCategoryDetail: {
    title: '카테고리 상세 도움말',
    steps: [
      {
        title: '구독과 공유',
        body: '링크 복사로 카테고리를 공유하고, 다른 사람이 만든 카테고리는 구독해서 계속 볼 수 있어요.',
        target: '.pcat-detail-mobile-head, .topbar',
      },
      {
        title: '카테고리 안에서 필터링',
        body: '저장된 곡도 곡 목록처럼 별, 달, 해, 신곡, 변속곡, 즐겨찾기와 난이도/BPM 필터로 좁힐 수 있어요.',
        target: '.pcat-mobile-filters, .side',
      },
      {
        title: '곡 열기와 삭제',
        body: '곡을 클릭하면 상세 화면을 열 수 있고, editor 권한 이상이면 이 카테고리에서 곡을 삭제할 수 있어요.',
        target: '.table-wrap, .mob-list-wrap',
      },
      {
        title: '데스크톱 관리 기능',
        body: '데스크톱에서는 카테고리 이름, 공개 여부, 구독 사용자 권한을 관리할 수 있어요.',
        target: '.pcat-editor-panel, .pcat-song-delete, .mob-delete-btn',
      },
    ],
  },
  personalSubscribers: {
    title: '구독 사용자 관리 도움말',
    steps: [
      {
        title: '구독자 확인',
        body: '이 카테고리를 구독한 사용자를 확인하고 현재 권한을 볼 수 있어요.',
        target: '.pcat-subscriber-mobile-body, .main',
      },
      {
        title: '권한 변경',
        body: '소유자는 구독자를 viewer 또는 editor로 바꿀 수 있어요. editor는 카테고리의 곡을 수정할 수 있습니다.',
        target: '.pcat-subscriber-mobile-body, .main',
      },
      {
        title: '구독자 삭제',
        body: '더 이상 접근을 허용하지 않을 사용자는 목록에서 삭제할 수 있어요.',
        target: '.pcat-subscriber-mobile-body, .main',
      },
    ],
  },
  pmang: {
    title: '과거 피망곡 도움말',
    steps: [
      {
        title: '피망곡 검색',
        body: '과거 피망곡을 곡명이나 아티스트로 검색할 수 있어요.',
        target: '.search, .mob-search',
      },
      {
        title: '채널과 빠른 필터',
        body: '별, 달, 해 채널과 즐겨찾기, 음악 없음 같은 필터로 목록을 정리할 수 있어요.',
        target: '.side, .mob-chips',
      },
      {
        title: '곡 상세',
        body: '곡을 클릭하면 과거 피망곡 상세를 열고 댓글, 기록, 영상 정보를 확인할 수 있어요.',
        target: '.table-wrap, .mob-list-wrap',
      },
    ],
  },
  feedback: {
    title: '피드백 도움말',
    steps: [
      {
        title: '버그와 제안',
        body: '버그 신고와 기능 제안을 탭으로 나눠 작성하고 확인할 수 있어요.',
        target: '.fb-tabs, .fb-mob-status',
      },
      {
        title: '새 피드백 작성',
        body: '제목과 내용을 입력해 새 피드백을 남기고, 버그는 관련 곡과 심각도를 함께 적을 수 있어요.',
        target: '.fb-card, .fb-mob-cta',
      },
      {
        title: '목록 필터와 검색',
        body: '상태 필터와 검색으로 필요한 피드백을 빠르게 찾아요.',
        target: '.fb-filter-row, .fb-input',
      },
      {
        title: '공감하기',
        body: '다른 사용자의 제안이나 신고가 중요하다고 생각되면 공감으로 우선순위를 표현할 수 있어요.',
        target: '.fb-list, .fb-mob-list',
      },
    ],
  },
  fallback: {
    title: '도움말',
    steps: [
      {
        title: '페이지별 도움말',
        body: 'F1을 누르거나 도움말 버튼을 클릭하면 현재 페이지에서 사용할 수 있는 기능을 단계별로 볼 수 있어요.',
        target: '.topbar, .mob-top',
      },
      {
        title: '이동과 종료',
        body: '다음, 이전으로 설명을 넘기고 스킵 또는 Esc로 언제든 닫을 수 있어요.',
      },
    ],
  },
}

export function HelpButton({ className = '' }) {
  return (
    <button
      className={`help-topbar-btn${className ? ` ${className}` : ''}`}
      onClick={() => window.dispatchEvent(new Event('r2-help-open'))}
      title="도움말 (F1)"
      aria-label="도움말 열기"
      type="button"
    >
      <CircleHelp size={16} />
      <span>도움말</span>
    </button>
  )
}

function getHelpKey(pathname) {
  if (pathname === '/') return 'songs'
  if (pathname === '/groups') return 'groups'
  if (pathname.startsWith('/groups/')) return 'groupDetail'
  if (pathname === '/personal-categories') return 'personalCategories'
  if (/^\/personal-categories\/[^/]+\/subscribers/.test(pathname)) return 'personalSubscribers'
  if (pathname.startsWith('/personal-categories/')) return 'personalCategoryDetail'
  if (pathname === '/pmang-songs') return 'pmang'
  if (pathname === '/feedback') return 'feedback'
  return 'fallback'
}

function findTarget(selectorText) {
  if (!selectorText) return null
  const selectors = selectorText.split(',').map(s => s.trim()).filter(Boolean)
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) return el
    } catch {
      // 잘못되었거나 아직 표시되지 않은 선택자는 건너뛴다.
    }
  }
  return null
}

function getSpotlightRect(el) {
  if (!el) return null
  const rect = el.getBoundingClientRect()
  const pad = 8
  return {
    left: Math.max(8, rect.left - pad),
    top: Math.max(8, rect.top - pad),
    width: Math.min(window.innerWidth - 16, rect.width + pad * 2),
    height: Math.min(window.innerHeight - 16, rect.height + pad * 2),
  }
}

function getCardPosition(rect) {
  if (!rect) return null
  const margin = 16
  const cardWidth = 360
  const cardHeight = 260
  const rightSpace = window.innerWidth - rect.left - rect.width
  const leftSpace = rect.left
  let left
  if (rightSpace >= cardWidth + margin * 2) {
    left = rect.left + rect.width + margin
  } else if (leftSpace >= cardWidth + margin * 2) {
    left = rect.left - cardWidth - margin
  } else {
    left = Math.max(margin, Math.min(window.innerWidth - cardWidth - margin, (window.innerWidth - cardWidth) / 2))
  }
  const top = Math.max(margin, Math.min(window.innerHeight - cardHeight - margin, rect.top))
  return { left, top }
}

export default function HelpTour() {
  const location = useLocation()
  const page = PAGE_HELP[getHelpKey(location.pathname)] ?? PAGE_HELP.fallback
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [spotlight, setSpotlight] = useState(null)

  const steps = page.steps
  const step = steps[index] ?? steps[0]
  const isFirst = index === 0
  const isLast = index === steps.length - 1

  const openHelp = useCallback(() => {
    setIndex(0)
    setOpen(true)
  }, [])

  const closeHelp = useCallback(() => setOpen(false), [])

  const refreshSpotlight = useCallback(() => {
    if (!open || !step) {
      setSpotlight(null)
      return
    }
    const target = findTarget(step.target)
    setSpotlight(getSpotlightRect(target))
  }, [open, step])

  useEffect(() => {
    setIndex(0)
    setSpotlight(null)
  }, [location.pathname])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'F1') {
        e.preventDefault()
        openHelp()
        return
      }
      if (!open) return
      if (e.key === 'Escape') {
        e.preventDefault()
        closeHelp()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setIndex(i => Math.min(steps.length - 1, i + 1))
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setIndex(i => Math.max(0, i - 1))
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeHelp, open, openHelp, steps.length])

  useEffect(() => {
    window.addEventListener('r2-help-open', openHelp)
    return () => window.removeEventListener('r2-help-open', openHelp)
  }, [openHelp])

  useEffect(() => {
    refreshSpotlight()
    if (!open) return
    const onRefresh = () => refreshSpotlight()
    window.addEventListener('resize', onRefresh)
    window.addEventListener('scroll', onRefresh, true)
    return () => {
      window.removeEventListener('resize', onRefresh)
      window.removeEventListener('scroll', onRefresh, true)
    }
  }, [open, index, refreshSpotlight])

  const cardPosition = useMemo(() => getCardPosition(spotlight), [spotlight])
  const cardStyle = cardPosition
    ? { '--help-card-left': `${cardPosition.left}px`, '--help-card-top': `${cardPosition.top}px` }
    : undefined

  return (
    <>
      {open && (
        <div className="help-layer" role="dialog" aria-modal="true" aria-label={page.title}>
          <div className="help-dim" onClick={closeHelp} />
          {spotlight && (
            <div
              className="help-spotlight"
              style={{
                left: spotlight.left,
                top: spotlight.top,
                width: spotlight.width,
                height: spotlight.height,
              }}
            />
          )}
          <section className={`help-card${cardPosition ? ' anchored' : ''}`} style={cardStyle}>
            <div className="help-card-head">
              <div>
                <div className="help-eyebrow">{page.title}</div>
                <div className="help-progress">
                  {index + 1} / {steps.length}
                </div>
              </div>
              <button className="help-close" onClick={closeHelp} aria-label="도움말 닫기">
                <X size={16} />
              </button>
            </div>

            <h3>{step.title}</h3>
            <p>{step.body}</p>
            {step.bullets && (
              <ul className="help-bullets">
                {step.bullets.map(item => <li key={item}>{item}</li>)}
              </ul>
            )}

            <div className="help-dots" aria-hidden="true">
              {steps.map((_, i) => (
                <span key={i} className={i === index ? 'on' : ''} />
              ))}
            </div>

            <div className="help-actions">
              <button className="help-skip" onClick={closeHelp}>스킵</button>
              <div className="help-nav-actions">
                <button className="help-nav" onClick={() => setIndex(i => Math.max(0, i - 1))} disabled={isFirst}>
                  이전
                </button>
                <button
                  className="help-nav primary"
                  onClick={() => {
                    if (isLast) closeHelp()
                    else setIndex(i => Math.min(steps.length - 1, i + 1))
                  }}
                >
                  {isLast ? '완료' : '다음'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  )
}
