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

import React, { useCallback, useContext, useRef, useState } from 'react';

import { Navigate, useLocation } from 'react-router-dom';

import { Sidebar } from './sidebar.jsx';
import { Breadcrumbs } from './breadcrumbs.jsx';

import { Logo } from '../components/brand.jsx';

import { ErrorNotice } from '../components/feedback.jsx';

/** Private application shell with navigation and sign-out. */
export function Layout() {
  const location = useLocation();
  const dashboardPage = ['/', '/dashboard'].includes(location.pathname);
  const recordPage =
    location.pathname === '/profile' ||
    location.pathname.startsWith('/records/') ||
    /^\/(incidents|tasks|knowledge)\/fields\/?$/.test(location.pathname) ||
    /^\/knowledge\/bases\/[a-f0-9]{24}\/?$/.test(location.pathname) ||
    /^\/(incidents|tasks|knowledge|services|collections|monitors|groups|integrations|workspace|on-call)\/(?!new(?:\/|$)|fields(?:\/|$)|articles(?:\/|$)|ai(?:\/|$))[^/]+\/?$/.test(
      location.pathname,
    );
  const formPage = /\/(new|invite|password|settings|ai)(?:\/|$)/.test(location.pathname);
  const recordLayout = recordPage || formPage;
  const listPage = [
    '/dashboard/reports',
    '/settings/audit',
    '/services',
    '/collections',
    '/monitors',
    '/incidents',
    '/tasks',
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
  return (
    <RecordNavigationProvider
      owner={user ? `${user.id}:${user.role}` : null}
      key={user ? `${user.id}:${user.role}` : 'session'}
    >
      <div
        data-app-shell
        data-nav-collapsed={collapsed}
        className={`min-h-screen ${collapsed ? 'md:pl-20' : 'md:pl-72'}`}
      >
        <Sidebar
          user={user}
          logout={logout}
          busy={busy || sessionLoading}
          collapsed={collapsed}
          setCollapsed={changeCollapsed}
          renderBrand={(compact) => <Logo compact={compact} />}
        />
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
          <div className={`record-sticky-header${dashboardPage ? ' dashboard-header' : ''}`}>
            {!dashboardPage && <Breadcrumbs resolveNames={!sessionLoading} />}
            <div ref={setRecordHeader} />
          </div>
          <ErrorNotice>{error}</ErrorNotice>
          <RecordNavigationBar />
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
                      : 'page-scroll-area space-y-6'
                }
              />
            </BreadcrumbTitleContext.Provider>
          </RecordRailContext.Provider>
        </main>
      </div>
    </RecordNavigationProvider>
  );
}
