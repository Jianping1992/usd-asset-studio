import { Component, type ErrorInfo, type ReactNode, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Toast } from './components/ui/Toast';
import { AssetLibraryPage } from './pages/AssetLibraryPage';
import { DashboardPage } from './pages/DashboardPage';
import { ReviewCenterPage } from './pages/ReviewCenterPage';
import { SceneComposerPage } from './pages/SceneComposerPage';
import { useStudioStore } from './state/studioStore';

class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application boundary caught an error', error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="fatal-state">
          <span className="eyebrow">APPLICATION ERROR</span>
          <h1>界面遇到异常</h1>
          <p>数据仍保存在本地服务中。刷新页面可重新初始化前端状态。</p>
          <button className="button button-primary" onClick={() => window.location.reload()}>
            重新加载
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export function App() {
  const bootstrap = useStudioStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <AppErrorBoundary>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="assets" element={<AssetLibraryPage />} />
          <Route path="review" element={<ReviewCenterPage />} />
          <Route path="composer" element={<SceneComposerPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
      <Toast />
    </AppErrorBoundary>
  );
}
