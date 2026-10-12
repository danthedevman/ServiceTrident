import { PageTitle } from '../../components/page-title.jsx';
import { RecordHeader } from '../../components/record-actions.jsx';
import { PlusIcon } from '@heroicons/react/24/outline';
import { api } from '../../data/api.js';
import { writeApi } from '../../data/query-client.js';
import { StateBadge } from '../../components/state-badge.jsx';
import { IntegrationEditor } from './editor.jsx';
import { IntegrationCatalog } from './catalog.jsx';
import { providers, emailPresets } from '../../../../shared/integrations/providers.js';
import { RecordWorkspace, RecordMetadata } from '../../components/record-workspace.jsx';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { displayValue } from '../../lib/display-value.js';
import React, { useContext, useState } from 'react';
import { AuthContext } from '../../auth/auth-context.js';
import { useResource } from '../../data/use-resource.js';
import { DataTable } from '../../components/data-table.jsx';
import { RecordTabs, RelatedCountsContext } from '../../components/record-tabs.jsx';
import { RefreshButton } from '../../components/icon-button.jsx';
import { Notice } from '../../components/forms/fields.jsx';
import { newId } from '../../lib/identifiers.js';
import { useSave } from '../../data/use-save.js';
import { ReferenceValues } from '../../components/reference-value.jsx';

/** Admin integration settings and durable delivery history; secret values never return to the browser. */
export function IntegrationsPage({ form = false }) {
  const { id } = useParams(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const { user, loading: accountLoading } = useContext(AuthContext),
    admin = user?.role === 'admin';
  const config = useResource(admin ? '/integrations' : null),
    services = useResource('/services'),
    save = useSave();
  const [formVersion, setFormVersion] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const resetForm = () => {
    setEditingId(null);
    setFormVersion((value) => value + 1);
  };
  if (accountLoading) return null;
  if (!admin)
    return (
      <div className="space-y-6">
        <PageTitle>Integrations</PageTitle>
        <p>Workspace admin access is required.</p>
      </div>
    );
  const edit = (item) => navigate(item.id ? `/integrations/${item.id}/edit` : '/integrations/new');
  const item = config.data?.integrations.find((row) => row.id === id);
  if (form || id) {
    if (!config.data || !services.data)
      return (
        <p role="status" className="sr-only">
          Loading integration…
        </p>
      );
    if (id && !item) return <p role="alert">Integration not found.</p>;
    const preset = emailPresets.find((provider) => provider.id === params.get('provider'));
    const initial = {
      ...(item || {
        id: newId(),
        name: '',
        type: providers.some((p) => p.id === params.get('provider'))
          ? params.get('provider')
          : 'email',
        enabled: true,
        recovery: true,
        onCall: true,
        serviceIds: [],
      }),
      recipients: Array.isArray(item?.recipients) ? item.recipients.join(', ') : '',
      revision: config.data.revision,
      url:
        !item && params.get('provider') === 'pagerduty'
          ? 'https://events.pagerduty.com/v2/enqueue'
          : item?.instanceUrl || '',
      authType: item?.authType || 'basic',
      clientId: item?.clientId || '',
      clientSecret: '',
      scope: item?.scope || '',
      preset: !item ? preset?.id : undefined,
      username: '',
      password: '',
      smtpHost: !item && preset ? preset.smtpHost : '',
      smtpFrom: '',
      smtpUser: !item && preset ? preset.smtpUser : '',
      smtpPassword: '',
      smtpPort: 587,
      existing: !!item,
    };
    const editor = (
      <IntegrationEditor
        key={`${id || 'new'}-${formVersion}`}
        initial={initial}
        services={services.data.services}
        close={id ? resetForm : () => navigate('/integrations')}
        onSaved={(savedId) => {
          resetForm();
          navigate(`/integrations/${savedId}`, { state: { createdRecord: !id } });
        }}
        onDeleted={() => navigate('/integrations')}
      />
    );
    return id ? (
      <RecordWorkspace
        item={item}
        kind="integrations"
        onEdit={editingId !== id ? () => setEditingId(id) : undefined}
        sidebar={<RecordMetadata item={item} />}
      >
        {editingId === id ? (
          editor
        ) : (
          <section className="record-details">
            <dl className="grid gap-5 sm:grid-cols-2">
              {[
                ['Name', item.name],
                [
                  'Provider',
                  providers.find((provider) => provider.id === item.type)?.name || item.type,
                ],
                ...(item.type === 'servicenow'
                  ? [
                      ['Instance Root URL', item.instanceUrl || 'Not configured'],
                      [
                        'Authentication',
                        item.authType === 'oauth'
                          ? 'OAuth Client Credentials'
                          : 'Basic Authentication',
                      ],
                    ]
                  : []),
                ['Delivery', item.enabled ? 'Enabled' : 'Disabled'],
                ['Recovery notifications', item.recovery ? 'Enabled' : 'Disabled'],
                ['On-call recipients', item.onCall ? 'Enabled' : 'Disabled'],
                ['Recipients', item.recipients?.join(', ') || 'None'],
                [
                  'Services',
                  <ReferenceValues
                    key="services"
                    type="services"
                    ids={item.serviceIds}
                    getLabel={(serviceId) =>
                      services.data.services.find((service) => service.id === serviceId)?.name ||
                      'Unavailable service'
                    }
                    empty="All services"
                  />,
                ],
                [
                  'Credentials',
                  item.configured || item.smtpConfigured ? 'Configured' : 'Not configured',
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </RecordWorkspace>
    ) : (
      editor
    );
  }

  const actions = (
    <button
      disabled={!config.data}
      className="btn-primary"
      onClick={() => navigate('/integrations/new')}
    >
      <PlusIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
      Create
    </button>
  );
  return (
    <div className="list-page integrations-page">
      <RecordHeader>
        <div className="flex items-center justify-end gap-3">
          <PageTitle>Integrations</PageTitle>
          <div className="flex items-center gap-2">
            <Link className="btn-secondary" to="/integrations/ai">
              AI Provider
            </Link>
            <RefreshButton
              label="Refresh Integrations"
              busy={config.pending}
              onClick={config.refresh}
            />
            {actions}
          </div>
        </div>
      </RecordHeader>
      <Notice error={config.error || save.error} />
      <RelatedCountsContext.Provider value={{ kind: 'integrations', id: 'all' }}>
        <RecordTabs
          related
          lazy
          label="Integration Views"
          tabs={[
            {
              id: 'catalog',
              count: providers.length,
              label: 'App Catalog',
              content: (
                <IntegrationCatalog
                  integrations={config.data?.integrations}
                  loading={!config.data}
                />
              ),
            },
            {
              id: 'integrations',
              label: 'Configured Apps',
              content: (
                <DataTable
                  fullPage
                  loading={!config.data}
                  title="Configured Apps"
                  onRefresh={config.refresh}
                  onDeleteRow={async (row) => {
                    const current = await api('/integrations');
                    await writeApi(`/integrations/${row.id}`, {
                      method: 'DELETE',
                      body: { revision: current.revision },
                    });
                  }}
                  source="integrations"
                  filename="integrations.csv"
                  rowKey={(r) => r.id}
                  rows={config.data?.integrations ?? []}
                  columns={[
                    { key: 'name', label: 'Name', value: (r) => r.name },
                    { key: 'type', label: 'Provider', value: (r) => displayValue(r.type) },
                    { key: 'destination', label: 'Destination', value: (r) => r.destination },
                    {
                      key: 'enabled',
                      label: 'Enabled',
                      value: (r) => (r.enabled ? 'Yes' : 'No'),
                      render: (r) => <StateBadge status={r.enabled ? 'enabled' : 'disabled'} />,
                    },
                    {
                      key: 'actions',
                      label: 'Actions',
                      sortable: false,
                      value: () => '',
                      render: (r) => (
                        <button className="btn-secondary" onClick={() => edit(r)}>
                          Configure
                        </button>
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              id: 'deliveries',
              label: 'Logs',
              content: (
                <DataTable
                  fullPage
                  title="Logs"
                  source="deliveries"
                  filename="integration-deliveries.csv"
                  rowKey={(r) => r.id}
                  dateColumn="createdAt"
                  defaultSort="createdAt:desc"
                  columns={[
                    { key: 'createdAt', label: 'Created', value: (r) => r.createdAt },
                    {
                      key: 'integrationName',
                      label: 'Integration',
                      value: (r) => r.integrationName,
                    },
                    { key: 'event', label: 'Event', value: (r) => displayValue(r.event) },
                    {
                      key: 'status',
                      label: 'Status',
                      value: (r) => displayValue(r.status),
                      render: (r) => <StateBadge status={r.status} />,
                    },
                    { key: 'attempts', label: 'Attempts', value: (r) => r.attempts },
                    { key: 'externalId', label: 'External incident', value: (r) => r.externalId },
                    { key: 'error', label: 'Details', value: (r) => r.error },
                    {
                      key: 'actions',
                      label: 'Actions',
                      sortable: false,
                      value: () => '',
                      render: (r) =>
                        r.status === 'failed' ? (
                          <button
                            disabled={save.busy}
                            className="btn-secondary"
                            onClick={() => save.run(`/deliveries/${r.id}/retry`, 'POST', {})}
                          >
                            Retry
                          </button>
                        ) : null,
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </RelatedCountsContext.Provider>
    </div>
  );
}
