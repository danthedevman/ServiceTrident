import { CreateButton } from '../../components/create-button.jsx';
import React, { useState } from 'react';
import { PuzzlePieceIcon } from '@heroicons/react/24/outline';
import { providers, emailPresets } from '../../../../shared/integrations/providers.js';

const categories = ['All', 'Email', 'Chat', 'On-call', 'Ticketing', 'Webhooks'];
const apps = [...providers, ...emailPresets];

/** Browse a finite, static adapter catalog; workspace records remain server paginated. */
export function IntegrationCatalog({ integrations = [], loading = false }) {
  const [category, setCategory] = useState('All');
  return (
    <div className="integration-catalog">
      <nav aria-label="Integration categories" className="integration-categories">
        {categories.map((name) => (
          <button
            type="button"
            key={name}
            aria-pressed={category === name}
            className="integration-category"
            onClick={() => setCategory(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      <section aria-label={`${category} integrations`} className="min-w-0 space-y-5 p-6">
        <h2 className="text-lg font-semibold">
          {category === 'All' ? 'All Integrations' : category}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {apps
            .filter((provider) => category === 'All' || provider.category === category)
            .map((provider) => {
              const preset = emailPresets.some((item) => item.id === provider.id);
              const count = integrations.filter((item) =>
                preset
                  ? item.type === 'email' &&
                    (provider.id === 'sendgrid'
                      ? item.destination === 'smtp.sendgrid.net'
                      : /^email-smtp\..+\.amazonaws\.com$/.test(item.destination))
                  : item.type === provider.id,
              ).length;
              return (
                <article key={provider.id} className="panel flex flex-col items-start gap-3 p-5">
                  <PuzzlePieceIcon
                    className="h-7 w-7 text-blue-700 dark:text-blue-400"
                    aria-hidden="true"
                  />
                  <h3 className="font-semibold">{provider.name}</h3>
                  <p className="flex-1 text-sm leading-6 text-slate-600 dark:text-slate-400">
                    {provider.description}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {loading ? '' : count ? `${count} configured` : 'Not configured'}
                  </p>
                  <CreateButton
                    className="btn-secondary"
                    aria-label={`Configure ${provider.name}`}
                    to={`/integrations/new?provider=${provider.id}`}
                  >
                    Create
                  </CreateButton>
                </article>
              );
            })}
        </div>
      </section>
    </div>
  );
}
