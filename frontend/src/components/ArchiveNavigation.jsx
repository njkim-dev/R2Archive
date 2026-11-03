import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, Home, LogIn, LogOut, Menu, MessageCircle, Music2, Pencil, ShieldCheck, ShoppingBag, UserRound, Wrench, X } from 'lucide-react'
import useStore from '../store/useStore'
import { archiveSection, navigationTarget } from '../utils/archiveNavigation'
import PageNavigation from './PageNavigation'
import ServerSwitcher from './ServerSwitcher'
import { lockShopScroll } from './shop/shopModalScroll'
import { rememberShopReturn } from '../utils/shopUrl'

const titles = { music: '음악', shop: '상점', home: '마이홈', repair: '게임 복구', feedback: '피드백', admin: '관리자 도구' }
const primary = [['music', Music2], ['shop', ShoppingBag], ['home', Home]]

function useNativeDialog() {
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    const update = () => setBlocked(!!document.querySelector('dialog[open]'))
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] })
    return () => observer.disconnect()
  }, [])
  return blocked
}

export function ArchiveBrand() {
  return <a className="archive-brand" href="https://r2archive.com/?refresh=home" aria-label="R2 Archive 메인 홈페이지"><span className="archive-brand-mark">R2</span><span>ARCHIVE<small>알투비트 아카이브</small></span></a>
}

function NavigationItem({ section, active, onNavigate, children, className = '' }) {
  const { user, authLoaded, closeModal } = useStore(), navigate = useNavigate()
  const target = navigationTarget(section)
  const proceed = () => { closeModal(); onNavigate?.() }
  const content = <>{children}</>
  if (section === 'home') return <span className="archive-navigation-anchor" data-tooltip={authLoaded && !user ? '로그인하세요' : undefined} tabIndex={authLoaded && !user ? 0 : undefined}><button className={className} type="button" aria-current={active ? 'page' : undefined} disabled={!authLoaded || !user} onClick={() => { proceed(); if (target.href) window.location.href = target.href; else navigate(target.to) }}>{content}</button></span>
  return target.href ? <a href={target.href} className={className} aria-current={active ? 'page' : undefined} onClick={proceed}>{content}</a> : <Link to={target.to} className={className} aria-current={active ? 'page' : undefined} onClick={proceed}>{content}</Link>
}

export function ArchivePrimaryNavigation({ section, onNavigate, className = '' }) {
  return <nav className={`archive-primary-nav ${className}`} aria-label="주요 페이지">{primary.map(([key, Icon]) => <NavigationItem key={key} section={key} active={section === key || section === 'admin' && key === 'shop'} onNavigate={onNavigate} className="archive-primary-item"><Icon size={18} aria-hidden="true" /><span>{titles[key]}</span></NavigationItem>)}</nav>
}

function ArchiveAccount({ onNavigate }) {
  const { authLoaded, user, openLogin, openMyPage, openOnboarding, logout } = useStore()
  const location = useLocation()
  const login = () => {
    onNavigate?.()
    if (/^\/(shop|myhome)(\/|$)/.test(location.pathname)) rememberShopReturn(location.pathname + location.search + location.hash)
    openLogin()
  }
  return <div className="archive-account">
    {user ? <><button className="archive-account-open user-chip-open" type="button" aria-label="마이페이지" data-tooltip={user.nickname || '마이페이지'} onClick={() => { onNavigate?.(); openMyPage() }}><span className="archive-account-avatar">{user.nickname?.[0] || <UserRound size={16} />}</span><span>{user.nickname || '내 계정'}<small>로그인됨</small></span></button><button type="button" className="archive-account-icon" aria-label="프로필 수정" data-tooltip="프로필 수정" onClick={() => { onNavigate?.(); openOnboarding() }}><Pencil size={15} /></button><button type="button" className="archive-account-icon" aria-label="로그아웃" data-tooltip="로그아웃" onClick={() => { onNavigate?.(); logout() }}><LogOut size={16} /></button></> : <button className="archive-login login-btn" disabled={!authLoaded} onClick={login}><LogIn size={17} />{authLoaded ? '로그인' : '계정 확인 중'}</button>}
  </div>
}

function ArchiveNavigationFooter({ section, onNavigate }) {
  const { adminLoaded, isAdmin } = useStore()
  return <footer className="archive-navigation-footer"><NavigationItem section="repair" active={section === 'repair'} onNavigate={onNavigate} className="archive-footer-item"><Wrench size={17} />게임 복구</NavigationItem><NavigationItem section="feedback" active={section === 'feedback'} onNavigate={onNavigate} className="archive-footer-item"><MessageCircle size={17} />피드백</NavigationItem><div className="archive-admin-slot">{adminLoaded && isAdmin && <NavigationItem section="admin" active={section === 'admin'} onNavigate={onNavigate} className="archive-footer-item"><ShieldCheck size={17} />관리자 도구</NavigationItem>}</div><ArchiveAccount onNavigate={onNavigate} /></footer>
}

export function ArchiveSidebar({ children, className = '', section: override, inactive = false }) {
  const location = useLocation(), blocked = useNativeDialog(), section = override || archiveSection(location.pathname)
  return <aside className={`side archive-sidebar ${className}`} aria-label="사이트 탐색" aria-hidden={blocked || inactive || undefined} inert={blocked || inactive ? '' : undefined}><ArchiveBrand /><ArchivePrimaryNavigation section={section} /><div className="archive-sidebar-context">{children}</div><ArchiveNavigationFooter section={section} /></aside>
}

export function ArchiveMobileNavigation({ context, section: override }) {
  const location = useLocation(), section = override || archiveSection(location.pathname), [open, setOpen] = useState(false), dialog = useRef(null), opener = useRef(null), blocked = useNativeDialog()
  useEffect(() => { setOpen(false) }, [location.pathname, location.search])
  useLayoutEffect(() => {
    if (!open) return
    const node = dialog.current, release = lockShopScroll()
    node.showModal()
    return () => { node.close(); release(); setTimeout(() => opener.current?.focus(), 0) }
  }, [open])
  const close = () => setOpen(false)
  return <><header className="archive-mobile-header" aria-hidden={blocked || undefined} inert={blocked ? '' : undefined}><button type="button" aria-label="전체 메뉴 열기" onClick={event => { opener.current = event.currentTarget; setOpen(true) }}><Menu size={21} /></button><a href="https://r2archive.com/?refresh=home">R2 ARCHIVE</a><div className="archive-mobile-account"><ArchiveAccount /></div></header><div className="archive-mobile-bottom" aria-hidden={blocked || undefined} inert={blocked ? '' : undefined}><ArchivePrimaryNavigation section={section} /><button className="archive-more" type="button" onClick={event => { opener.current = event.currentTarget; setOpen(true) }}><Menu size={20} /><span>전체 메뉴</span></button></div><dialog ref={dialog} className="archive-menu-dialog" aria-label="전체 메뉴" onCancel={event => { event.preventDefault(); close() }} onClick={event => { const box = event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right)) close() }}><div className="archive-menu-heading"><ArchiveBrand /><button aria-label="전체 메뉴 닫기" type="button" onClick={close}><X size={21} /></button></div><ArchivePrimaryNavigation section={section} onNavigate={close} /><div className="archive-menu-context" onClick={event => { if (event.target.closest('a,button')) close() }}>{context || (section === 'music' ? <><ServerSwitcher /><PageNavigation onNavigate={close} /></> : null)}</div><ArchiveNavigationFooter section={section} onNavigate={close} /></dialog></>
}

export function ArchivePageLayout({ children, context, section = 'shop', className = '', headerTools, inactive = false }) {
  return <div className={`archive-page-layout ${className}`}><ArchiveSidebar section={section} inactive={inactive}>{context}</ArchiveSidebar><ArchiveMobileNavigation section={section} context={context} /><div className="archive-page-content"><header className="archive-page-topbar shop-header" aria-hidden={inactive || undefined} inert={inactive ? '' : undefined}><div className="archive-breadcrumb"><a href="https://r2archive.com/?refresh=home">R2 ARCHIVE</a><ChevronRight size={14} /><span>{titles[section]}</span></div><div className="shop-header-actions">{headerTools}</div></header>{children}</div></div>
}
