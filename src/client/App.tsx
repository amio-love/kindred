import { Link, Route, Routes } from 'react-router-dom'
import HomePage from './pages/HomePage'
import ClaimPage from './pages/ClaimPage'
import StudioPage from './pages/StudioPage'
import ShareLandingPage from './pages/ShareLandingPage'
import MatchPage from './pages/MatchPage'
import DrawGamePage from './pages/DrawGamePage'

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark">Kindred</span>
            <span className="brand-sub">个人 Agent 筛同类</span>
          </Link>
          <nav className="nav-links" aria-label="主导航">
            <Link to="/studio" className="btn btn-subtle btn-sm">
              我的题库与相遇
            </Link>
            <a href="/skill.md" target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
              skill.md
            </a>
          </nav>
        </div>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/claim/:token" element={<ClaimPage />} />
          <Route path="/studio" element={<StudioPage />} />
          <Route path="/q/:shareCode" element={<ShareLandingPage />} />
          <Route path="/match/:pairingId" element={<MatchPage />} />
          <Route path="/draw/:gameId" element={<DrawGamePage />} />
        </Routes>
      </main>
    </div>
  )
}
