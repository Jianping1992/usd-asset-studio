import { Box, Boxes, ChartNoAxesCombined, CircleDot, ClipboardCheck, Cpu, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const navigation = [
  { to: '/dashboard', label: '运行看板', eyebrow: 'OVERVIEW', icon: ChartNoAxesCombined },
  { to: '/assets', label: '资产库', eyebrow: 'ASSET LIBRARY', icon: Box },
  { to: '/review', label: '审核中心', eyebrow: 'REVIEW FLOW', icon: ClipboardCheck },
  { to: '/composer', label: '场景组合', eyebrow: 'SCENE COMPOSER', icon: Boxes },
];

const pageMeta: Record<string, { title: string; description: string }> = {
  '/dashboard': { title: '运行看板', description: '具身仿真资产全局态势' },
  '/assets': { title: '资产库', description: 'USD / USDZ 资产管理与预览' },
  '/review': { title: '审核中心', description: '资产准入状态与审核备注' },
  '/composer': { title: '场景组合', description: '多资产 WebGL 布局与 Transform' },
};

export function AppShell() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const meta = pageMeta[location.pathname] ?? pageMeta['/dashboard'];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Cpu size={21} /></div>
          <div>
            <strong>USD ASSET</strong>
            <span>STUDIO / 01</span>
          </div>
          <button className="icon-button sidebar-close" aria-label="关闭导航" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="system-chip">
          <span className="pulse-dot" />
          <div>
            <small>LOCAL PIPELINE</small>
            <strong>SIMULATION READY</strong>
          </div>
        </div>

        <nav className="nav-list" aria-label="主要导航">
          {navigation.map(({ to, label, eyebrow, icon: Icon }, index) => (
            <NavLink key={to} to={to} onClick={() => setMobileOpen(false)}>
              <span className="nav-index">0{index + 1}</span>
              <Icon size={19} strokeWidth={1.8} />
              <span>
                <small>{eyebrow}</small>
                <strong>{label}</strong>
              </span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div><CircleDot size={14} /> OpenUSD 26.05 / WASM</div>
          <span>COOP · COEP ISOLATED</span>
        </div>
      </aside>

      {mobileOpen && <button className="sidebar-backdrop" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}

      <div className="main-column">
        <header className="topbar">
          <div className="topbar-title">
            <button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setMobileOpen(true)}>
              <Menu size={20} />
            </button>
            <div>
              <span>{meta.description}</span>
              <h1>{meta.title}</h1>
            </div>
          </div>
          <div className="topbar-meta">
            <span className="runtime-state"><i /> DATA SERVICE ONLINE</span>
            <time>2026.08.23</time>
          </div>
        </header>
        <main className="page-content"><Outlet /></main>
      </div>
    </div>
  );
}
