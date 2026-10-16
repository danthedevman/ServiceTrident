import { Notifications } from './notifications.jsx';
import { RecordRailContext } from '../components/record-actions.jsx';
import {
  RecordNavigationProvider,
  clearRecordTabs,
  RecordNavigationBar,
  RecordTabOutlet,
} from '../components/record-navigation.jsx';
import { BreadcrumbTitleContext } from '../components/page-title.jsx';
import { useUiPreferences } from '../preferences/ui-preferences.jsx';

import { RolePreview } from '../auth/role-preview.jsx';

import { writeApi } from '../data/query-client.js';

import { AuthContext } from '../auth/auth-context.js';

import React, { useCallback, useContext, useRef, useState, useSyncExternalStore } from 'react';

import { Navigate, useLocation } from 'react-router-dom';

import { Sidebar } from './sidebar.jsx';
import { Breadcrumbs } from './breadcrumbs.jsx';

import { FloatingAIChat } from '../features/ai/chat.jsx';
import { Logo } from '../components/brand.jsx';

import { ErrorNotice } from '../components/feedback.jsx';

const mobileToolbarQuery = () => window.matchMedia('(max-width: 767px)').matches;
const subscribeToolbarViewport = (listener) => {
  const query = window.matchMedia('(max-width: 767px)');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};

/** Private application shell with navigation and sign-out. */
export function Layout() {
  const location = useLocation();
  const mobileToolbar = useSyncExternalStore(
    subscribeToolbarViewport,
    mobileToolbarQuery,
    () => false,
  );
  const [tabHeight, setTabHeight] = useState(0);
  const [navigationActions, setNavigationActions] = useState(null);
  const dashboardPage = ['/', '/dashboard'].includes(location.pathname);
  const recordPage =
    location.pathname === '/profile' ||
    location.pathname.startsWith('/records/') ||
    /^\/(events|alerts)\/[a-f0-9]{24}\/?$/.test(location.pathname) ||
    /^\/monitors\/[a-f0-9]{24}\/events\/[a-f0-9]{24}\/?$/.test(location.pathname) ||
    /^\/(incidents|tasks|rcas|knowledge)\/fields\/?$/.test(location.pathname) ||
    /^\/knowledge\/bases\/[a-f0-9]{24}\/?$/.test(location.pathname) ||
    /^\/(incidents|tasks|rcas|knowledge|services|collections|monitors|groups|integrations|workspace|on-call)\/(?!new(?:\/|$)|fields(?:\/|$)|articles(?:\/|$)|ai(?:\/|$))[^/]+\/?$/.test(
      location.pathname,
    );
  const formPage = /\/(new|invite|password|settings|ai)(?:\/|$)/.test(location.pathname);
  const recordLayout = recordPage || formPage;
  const listPage = [
    '/dashboard/reports',
    '/events',
    '/alerts',
    '/settings/audit',
    '/services',
    '/collections',
    '/monitors',
    '/incidents',
    '/tasks',
    '/rcas',
    '/knowledge',
    '/knowledge/articles',
    '/groups',
    '/workspace',
    '/integrations',
  ].includes(location.pathname.replace(/\/$/, ''));
  const { user, setUser, loading: sessionLoading } = useContext(AuthContext);
  const rails = useRef(new Set());
  const [hasRail, setHasRail] = useState(false);
  const registerRail = useCallback((id, present) => {
    if (present) rails.current.add(id);
    else rails.current.delete(id);
    setHasRail(rails.current.size > 0);
  }, []);
  const [recordHeader, setRecordHeader] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { leftCollapsed: collapsed, rightCollapsed, setPreference } = useUiPreferences();
  const changeCollapsed = (value) => setPreference('leftCollapsed', value);
  if (!sessionLoading && !user) return <Navigate to="/login" replace />;
  const logout = async () => {
    setBusy(true);
    try {
      await writeApi('/auth/logout', { method: 'POST', body: {} });
      clearRecordTabs();
      setUser(null);
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  };
  const toolbarActions = (
    <div className="topnav-actions">
      <div ref={setNavigationActions} className="topnav-global-actions" />
      {!sessionLoading && user && <Notifications key={`${user.id}:${user.role}`} />}
    </div>
  );
  return (
    <RecordNavigationProvider
      owner={user ? `${user.id}:${user.role}` : null}
      key={user ? `${user.id}:${user.role}` : 'session'}
    >
      <div
        data-app-shell
        style={{ '--record-tabs-height': `${tabHeight}px` }}
        data-nav-collapsed={collapsed}
        data-record-tabs-visible={recordLayout && tabHeight > 0 ? true : undefined}
        className={`min-h-screen ${collapsed ? 'md:pl-16' : 'md:pl-72'}`}
      >
        <Sidebar
          toolbarTarget={navigationActions}
          mobileActions={mobileToolbar ? toolbarActions : null}
          user={user}
          logout={logout}
          busy={busy || sessionLoading}
          collapsed={collapsed}
          setCollapsed={changeCollapsed}
          renderBrand={(compact) => <Logo compact={compact} />}
        />
        <header className="app-topbar" aria-label="Application toolbar">
          <RecordNavigationBar onHeightChange={setTabHeight} />
          {!mobileToolbar && toolbarActions}
        </header>
        <main
          id="main"
          data-record-collapsed={
            recordLayout && (recordPage || hasRail) ? rightCollapsed : undefined
          }
          className={
            listPage ? 'list-main' : recordLayout ? 'record-main mx-auto max-w-none' : 'page-main'
          }
        >
          <RolePreview banner />
          <div
            className={`record-sticky-header${dashboardPage ? ' dashboard-header' : ''}${recordLayout && tabHeight > 0 ? ' record-header-with-tabs' : ''}`}
          >
            {!dashboardPage && <Breadcrumbs resolveNames={!sessionLoading} />}
            <div ref={setRecordHeader} className="record-header-actions" />
          </div>
          <ErrorNotice>{error}</ErrorNotice>
          <RecordRailContext.Provider value={registerRail}>
            <BreadcrumbTitleContext.Provider value={!dashboardPage}>
              <RecordTabOutlet
                header={recordHeader}
                enabled={!sessionLoading && !!user}
                recordLayout={recordLayout}
                className={
                  listPage
                    ? 'list-outlet'
                    : recordLayout
                      ? 'record-scroll-area space-y-6'
                      : `page-scroll-area space-y-6${dashboardPage ? ' dashboard-scroll-area' : ''}`
                }
              />
            </BreadcrumbTitleContext.Provider>
          </RecordRailContext.Provider>
        </main>
        {!sessionLoading && user && <FloatingAIChat key={`${user.id}:${user.role}`} />}
      </div>
    </RecordNavigationProvider>
  );
}
