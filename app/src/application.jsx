import { PinnedPage } from './features/records/pinned.jsx';
import { OperationalReporting } from './features/dashboard/operational-reporting.jsx';
import { QuickStartPage } from './features/dashboard/quick-start.jsx';
import { AutomationSettings, ProbeSettings } from './features/settings/operational-automation.jsx';
import { AlertGroupingSettings } from './features/settings/alert-grouping.jsx';
import { EventAlertDetail } from './features/monitors/alert-detail.jsx';
import { NotificationsPage } from './shell/notifications.jsx';
import { RcaList, RcaPage } from './features/work/rcas.jsx';
import { TableRecordPage } from './features/records/table-record.jsx';
import { IdentityProvidersPage } from './features/settings/identity-providers.jsx';
import { ServiceAccountsPage } from './features/settings/service-accounts.jsx';
import { KnowledgeBasesPage, KnowledgeBasePage } from './features/work/knowledge-bases.jsx';
import { HelpPage } from './features/help/help.jsx';
import { Toasts } from './components/toasts.jsx';
import { AuditPage } from './features/settings/audit.jsx';
import { SettingsPage } from './features/settings/settings.jsx';

import { WorkPage, WorkDetail, WorkCreatePage, WorkEditPage } from './features/work/work.jsx';
import { GroupsPage } from './features/workspace/groups.jsx';
import { AdminOnly, IncidentCreatorOnly, ResponderOnly } from './auth/role-gates.jsx';
import { IncidentsPage, IncidentPage } from './features/incidents/incidents.jsx';
import { IncidentBuilderPage } from './features/forms/incident-builder.jsx';
import { WorkspacePage, JoinPage } from './features/workspace/workspace.jsx';
import { OnCallPage } from './features/workspace/on-call.jsx';
import { IntegrationsPage } from './features/integrations/integrations.jsx';
import { AIProviderPage } from './features/ai/ai.jsx';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './data/query-client.js';

import { ScrollToTop } from './shell/scroll-to-top.jsx';
import { AuthContext } from './auth/auth-context.js';

import React, { useContext } from 'react';

import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';

import { Dashboard } from './features/dashboard/dashboard.jsx';
import { DashboardReport } from './features/dashboard/report.jsx';

import { CatalogPage } from './features/services/list.jsx';
import { CatalogFormPage } from './features/services/form.jsx';
import { CatalogDetailPage } from './features/services/detail.jsx';

import { StatusSettings } from './features/status/settings.jsx';

import { ThemeProvider } from './preferences/theme.jsx';

import { AuthProvider } from './auth/provider.jsx';
import { AuthPage } from './auth/login-page.jsx';
import { ProfilePage } from './auth/profile-page.jsx';
import { Layout } from './shell/layout.jsx';
import { MonitorList } from './features/monitors/list.jsx';
import { EditMonitor } from './features/monitors/form.jsx';
import { MonitorForm } from './features/monitors/form.jsx';
import { EventsPage, AlertsPage } from './features/monitors/events.jsx';
import { MonitorDetail } from './features/monitors/detail.jsx';

import { EventDetail } from './features/monitors/event-detail.jsx';

import { StatusPage } from './features/status/page.jsx';
import { PublicStatusPage } from './features/status/page.jsx';
/** End users land in their incident portal; operational roles keep the dashboard. */
export function HomePage() {
  const { user } = useContext(AuthContext);
  return user?.role === 'user' ? <Navigate to="/incidents" replace /> : <Dashboard />;
}

/** Services open directly; monitors are managed from each saved service. */
export function ServicesPage() {
  return <CatalogPage key="services" />;
}

/** Route table for authentication, monitors, history, and the status overview. */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <Toasts />
          <ScrollToTop />
          <AuthProvider>
            <a className="skip-link" href="#main">
              Skip to content
            </a>
            <Routes>
              <Route path="/status/public/:token" element={<PublicStatusPage />} />
              <Route path="/login" element={<AuthPage key="login" />} />
              <Route path="/register" element={<AuthPage key="register" register />} />
              <Route path="/join/:token" element={<JoinPage />} />
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="pinned" element={<PinnedPage />} />
                <Route path="notifications" element={<NotificationsPage />} />
                <Route path="events" element={<EventsPage />} />
                <Route path="alerts" element={<AlertsPage />} />
                <Route path="events/:eventId" element={<EventDetail />} />
                <Route path="alerts/:id" element={<EventAlertDetail />} />
                <Route path="dashboard/reports" element={<DashboardReport />} />
                <Route path="help" element={<HelpPage />} />
                <Route path="projects" element={<Navigate replace to="/tasks" />} />
                <Route path="projects/overview" element={<Navigate replace to="/tasks" />} />
                <Route path="projects/milestones" element={<Navigate replace to="/tasks" />} />
                <Route path="projects/activity" element={<Navigate replace to="/tasks" />} />
                <Route path="projects/:id" element={<Navigate replace to="/tasks" />} />
                <Route path="project-milestones/:id" element={<Navigate replace to="/tasks" />} />
                <Route path="tasks" element={<WorkPage key="tasks" />} />
                <Route
                  path="tasks/:id/edit"
                  element={
                    <ResponderOnly page>
                      <WorkEditPage />
                    </ResponderOnly>
                  }
                />
                <Route
                  path="knowledge/:id/edit"
                  element={
                    <ResponderOnly page>
                      <WorkEditPage kind="knowledge" />
                    </ResponderOnly>
                  }
                />
                <Route
                  path="incidents/:id/edit"
                  element={
                    <ResponderOnly page>
                      <IncidentPage edit />
                    </ResponderOnly>
                  }
                />
                <Route
                  path="groups/new"
                  element={
                    <AdminOnly page>
                      <GroupsPage form />
                    </AdminOnly>
                  }
                />
                <Route
                  path="groups/:id/edit"
                  element={
                    <AdminOnly page>
                      <GroupsPage form />
                    </AdminOnly>
                  }
                />
                <Route path="groups/:id" element={<GroupsPage />} />
                <Route
                  path="integrations/new"
                  element={
                    <AdminOnly page>
                      <IntegrationsPage form />
                    </AdminOnly>
                  }
                />
                <Route
                  path="integrations/:id/edit"
                  element={
                    <AdminOnly page>
                      <IntegrationsPage form />
                    </AdminOnly>
                  }
                />
                <Route
                  path="integrations/:id"
                  element={
                    <AdminOnly page>
                      <IntegrationsPage />
                    </AdminOnly>
                  }
                />
                <Route
                  path="workspace/:id"
                  element={
                    <AdminOnly page>
                      <WorkspacePage />
                    </AdminOnly>
                  }
                />
                <Route path="on-call/:id" element={<OnCallPage />} />
                <Route
                  path="workspace/new"
                  element={
                    <AdminOnly page>
                      <WorkspacePage form="create" />
                    </AdminOnly>
                  }
                />
                <Route path="workspace/invite" element={<Navigate replace to="/workspace/new" />} />
                <Route
                  path="workspace/:id/password"
                  element={
                    <AdminOnly page>
                      <WorkspacePage form="password" />
                    </AdminOnly>
                  }
                />
                <Route
                  path="workspace/:id/edit"
                  element={
                    <AdminOnly page>
                      <WorkspacePage form="edit" />
                    </AdminOnly>
                  }
                />
                <Route
                  path="on-call/new"
                  element={
                    <AdminOnly page>
                      <OnCallPage form />
                    </AdminOnly>
                  }
                />
                <Route
                  path="on-call/:id/edit"
                  element={
                    <AdminOnly page>
                      <OnCallPage form />
                    </AdminOnly>
                  }
                />
                <Route
                  path="status/settings"
                  element={
                    <AdminOnly page>
                      <StatusSettings page />
                    </AdminOnly>
                  }
                />

                <Route path="rcas/fields" element={<IncidentBuilderPage kind="rcas" />} />
                <Route path="tasks/fields" element={<IncidentBuilderPage kind="tasks" />} />
                <Route path="knowledge/fields" element={<IncidentBuilderPage kind="knowledge" />} />
                <Route
                  path="tasks/new"
                  element={
                    <ResponderOnly page>
                      <WorkCreatePage />
                    </ResponderOnly>
                  }
                />
                <Route
                  path="knowledge/new"
                  element={
                    <ResponderOnly page>
                      <WorkCreatePage kind="knowledge" />
                    </ResponderOnly>
                  }
                />
                <Route path="tasks/:id" element={<WorkDetail key="task" />} />
                <Route path="knowledge" element={<KnowledgeBasesPage />} />
                <Route
                  path="knowledge/bases/new"
                  element={
                    <ResponderOnly>
                      <KnowledgeBasePage create />
                    </ResponderOnly>
                  }
                />
                <Route path="knowledge/bases/:id" element={<KnowledgeBasePage />} />
                <Route
                  path="knowledge/articles"
                  element={<WorkPage key="knowledge" kind="knowledge" />}
                />
                <Route
                  path="knowledge/:id"
                  element={<WorkDetail key="article" kind="knowledge" />}
                />
                <Route path="groups" element={<GroupsPage />} />
                <Route
                  path="rcas"
                  element={
                    <div className="list-page">
                      <RcaList />
                    </div>
                  }
                />
                <Route
                  path="rcas/new"
                  element={
                    <ResponderOnly page>
                      <RcaPage create />
                    </ResponderOnly>
                  }
                />
                <Route path="rcas/:id" element={<RcaPage />} />
                <Route path="incidents" element={<IncidentsPage />} />
                <Route
                  path="incidents/new"
                  element={
                    <IncidentCreatorOnly>
                      <IncidentPage />
                    </IncidentCreatorOnly>
                  }
                />
                <Route path="incidents/fields" element={<IncidentBuilderPage />} />
                <Route path="incidents/:id" element={<IncidentPage />} />
                <Route
                  path="quick-start"
                  element={
                    <AdminOnly page>
                      <QuickStartPage />
                    </AdminOnly>
                  }
                />
                <Route path="operational-reporting" element={<OperationalReporting />} />
                <Route path="on-call" element={<OnCallPage />} />
                <Route
                  path="event-rules"
                  element={
                    <AdminOnly page>
                      <AutomationSettings kind="eventRules" />
                    </AdminOnly>
                  }
                />
                <Route
                  path="escalation-policies"
                  element={
                    <AdminOnly page>
                      <AutomationSettings kind="escalationPolicies" />
                    </AdminOnly>
                  }
                />
                <Route
                  path="maintenance-windows"
                  element={
                    <AdminOnly page>
                      <AutomationSettings kind="maintenanceWindows" />
                    </AdminOnly>
                  }
                />
                <Route
                  path="probe-agents"
                  element={
                    <AdminOnly page>
                      <ProbeSettings />
                    </AdminOnly>
                  }
                />
                <Route
                  path="alert-grouping"
                  element={
                    <AdminOnly page>
                      <AlertGroupingSettings />
                    </AdminOnly>
                  }
                />
                <Route path="integrations" element={<IntegrationsPage />} />
                <Route path="integrations/ai" element={<AIProviderPage />} />
                <Route path="workspace" element={<WorkspacePage />} />
                <Route path="monitors" element={<MonitorList />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route
                  path="settings/audit"
                  element={
                    <AdminOnly page>
                      <AuditPage />
                    </AdminOnly>
                  }
                />
                <Route
                  path="settings/identity-providers"
                  element={
                    <AdminOnly page>
                      <IdentityProvidersPage />
                    </AdminOnly>
                  }
                />
                <Route path="records/:kind/:id" element={<TableRecordPage />} />
                <Route
                  path="settings/service-accounts"
                  element={
                    <AdminOnly page>
                      <ServiceAccountsPage />
                    </AdminOnly>
                  }
                />
                <Route
                  path="settings/service-accounts/:id"
                  element={
                    <AdminOnly page>
                      <ServiceAccountsPage />
                    </AdminOnly>
                  }
                />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="dashboard" element={<Navigate to="/" replace />} />
                <Route
                  path="monitors/new"
                  element={
                    <AdminOnly page>
                      <MonitorForm />
                    </AdminOnly>
                  }
                />
                <Route
                  path="monitors/:id/edit"
                  element={
                    <AdminOnly page>
                      <EditMonitor />
                    </AdminOnly>
                  }
                />
                <Route path="monitors/:id/events/:eventId" element={<EventDetail />} />
                <Route path="monitors/:id" element={<MonitorDetail />} />
                <Route
                  path="services/new"
                  element={
                    <AdminOnly page>
                      <CatalogFormPage key="new-service" />
                    </AdminOnly>
                  }
                />
                <Route
                  path="services/:id/edit"
                  element={
                    <AdminOnly page>
                      <CatalogFormPage key="edit-service" />
                    </AdminOnly>
                  }
                />
                <Route
                  path="collections/new"
                  element={
                    <AdminOnly page>
                      <CatalogFormPage kind="collections" key="new-collection" />
                    </AdminOnly>
                  }
                />
                <Route
                  path="collections/:id/edit"
                  element={
                    <AdminOnly page>
                      <CatalogFormPage kind="collections" key="edit-collection" />
                    </AdminOnly>
                  }
                />
                <Route path="services" element={<ServicesPage />} />
                <Route path="services/:id" element={<CatalogDetailPage />} />
                <Route path="collections/:id" element={<CatalogDetailPage kind="collections" />} />
                <Route
                  path="collections"
                  element={<CatalogPage key="collections" kind="collections" />}
                />
                <Route path="status" element={<StatusPage />} />
                <Route
                  path="*"
                  element={
                    <div className="panel p-10 text-center">
                      <h1 className="text-xl font-semibold">Page Not Found</h1>
                      <Link to="/monitors" className="btn-primary mt-5">
                        Back to monitors
                      </Link>
                    </div>
                  }
                />
              </Route>
            </Routes>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
