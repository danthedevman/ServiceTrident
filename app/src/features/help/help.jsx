import { PageTitle } from '../../components/page-title.jsx';
import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PuzzlePieceIcon,
  QuestionMarkCircleIcon,
  RocketLaunchIcon,
  ServerStackIcon,
  SignalIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';
import { helpQuestions, helpTopics } from './topics.js';

const guides = {
  'getting-started': [
    RocketLaunchIcon,
    'Getting Started',
    'Set up your workspace and create your first service',
  ],
  services: [ServerStackIcon, 'Services', 'Organize ownership, collections, and dependencies'],
  rcas: [
    BookOpenIcon,
    'Root Cause Analyses and Alert Grouping',
    'Analyze incidents, track corrective work, and group related alerts',
  ],
  monitoring: [SignalIcon, 'Monitoring', 'Configure Endpoint Checks and Understand Results'],
  incidents: [
    ExclamationTriangleIcon,
    'Incident response',
    'Manage incidents, tasks, knowledge, and attachments',
  ],
  people: [CalendarDaysIcon, 'People and on-call', 'Manage access, profiles, and coverage'],
  'role-preview': [
    BookOpenIcon,
    'Impersonation and Role Preview',
    'Preview permissions and understand how actions affect your workspace',
  ],
  'service-accounts': [
    PuzzlePieceIcon,
    'Service Accounts and External API',
    'Create scoped credentials for external record creation',
  ],
  integrations: [PuzzlePieceIcon, 'Integrations', 'Connect communication and ticketing tools'],
  'status-page': [GlobeAltIcon, 'Status pages', 'Publish updates and configure subscriptions'],
  configuration: [
    Cog6ToothIcon,
    'Configuration',
    'Customize forms and work with tables and audit logs',
  ],
  hosting: [ServerStackIcon, 'Self-hosting', 'Run, maintain, and troubleshoot your deployment'],
};

/** Local guides provide shareable topic URLs and search only bundled documentation, never workspace records. */
export function HelpPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const topic = helpTopics.find((item) => item.id === params.get('topic'));
  const faq = params.get('topic') === 'questions';
  const query = search.trim().toLocaleLowerCase();
  const matches = helpTopics.filter((item) =>
    `${item.title} ${item.paragraphs.join(' ')}`.toLocaleLowerCase().includes(query),
  );
  const questions = helpQuestions.filter((item) =>
    item.join(' ').toLocaleLowerCase().includes(query),
  );
  const index = topic ? helpTopics.indexOf(topic) : -1;
  const clear = () => setSearch('');
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <PageTitle>Help</PageTitle>
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Search documentation</span>
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            className="!mt-0 !pl-10"
            placeholder="Search documentation"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <nav
          aria-label="Help topics"
          className="help-topic-nav flex gap-1 overflow-x-auto pb-2 lg:sticky lg:top-4 lg:flex-col"
        >
          <Link
            to="/help"
            onClick={clear}
            aria-current={!topic && !faq ? 'page' : undefined}
            className={`nav-link flex shrink-0 items-center gap-3 ${!topic && !faq ? 'active' : ''}`}
          >
            <BookOpenIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            Overview
          </Link>
          {helpTopics.map((item) => {
            const [Icon, title] = guides[item.id];
            return (
              <Link
                key={item.id}
                to={`/help?topic=${item.id}`}
                onClick={clear}
                aria-current={topic?.id === item.id ? 'page' : undefined}
                className={`nav-link flex shrink-0 items-center gap-3 ${topic?.id === item.id ? 'active' : ''}`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {title}
              </Link>
            );
          })}
          <Link
            to="/help?topic=questions"
            onClick={clear}
            aria-current={faq ? 'page' : undefined}
            className={`nav-link flex shrink-0 items-center gap-3 ${faq ? 'active' : ''}`}
          >
            <QuestionMarkCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
            Common questions
          </Link>
        </nav>
        <div className="min-w-0 space-y-6">
          {query ? (
            <>
              <h2 className="text-xl font-semibold">Search Results</h2>
              <p role="status" className="text-sm text-slate-500">
                {matches.length} guides and {questions.length} answers
              </p>
              <GuideCards topics={matches} onSelect={clear} />
              <Questions questions={questions} />
              {!matches.length && !questions.length && (
                <div className="panel p-6">
                  <p>No matching documentation</p>
                  <p className="mt-2 text-sm text-slate-500">
                    Try a topic such as monitors, email, roles, or status pages.
                  </p>
                  <button className="btn-secondary mt-4" onClick={clear}>
                    Clear search
                  </button>
                </div>
              )}
            </>
          ) : topic ? (
            <article className="panel space-y-6 p-5 sm:p-8">
              <h2 className="text-2xl font-semibold leading-tight">{topic.title}</h2>
              <div className="max-w-prose space-y-5">
                {topic.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="text-sm leading-7 text-slate-600 dark:text-slate-300"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
              {topic.screenshots?.map((screenshot) => (
                <figure key={screenshot.src} className="space-y-3">
                  <a
                    href={screenshot.src}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open screenshot: ${screenshot.alt} (opens in a new tab)`}
                    className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                  >
                    <img
                      src={screenshot.src}
                      alt={screenshot.alt}
                      width="1440"
                      height="960"
                      loading="lazy"
                      className="h-auto w-full rounded border border-slate-200 dark:border-slate-700"
                    />
                  </a>
                  {screenshot.caption && (
                    <figcaption className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                      {screenshot.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
              <nav
                aria-label="Adjacent guides"
                className="flex flex-wrap justify-between gap-4 border-t border-slate-200 pt-5 dark:border-slate-700"
              >
                <Link
                  className="inline-flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300"
                  to={index > 0 ? `/help?topic=${helpTopics[index - 1].id}` : '/help'}
                >
                  <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
                  {index > 0 ? guides[helpTopics[index - 1].id][1] : 'Overview'}
                </Link>
                <Link
                  className="inline-flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300"
                  to={
                    index < helpTopics.length - 1
                      ? `/help?topic=${helpTopics[index + 1].id}`
                      : '/help?topic=questions'
                  }
                >
                  {index < helpTopics.length - 1
                    ? guides[helpTopics[index + 1].id][1]
                    : 'Common Questions'}
                  <ArrowRightIcon className="h-4 w-4" aria-hidden="true" />
                </Link>
              </nav>
            </article>
          ) : faq ? (
            <>
              <h2 className="text-xl font-semibold">Common Questions</h2>
              <Questions questions={helpQuestions} />
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold">Browse Documentation</h2>
              <GuideCards topics={helpTopics} onSelect={clear} />
              <Link
                to="/help?topic=questions"
                className="panel flex items-center gap-4 p-5 hover:bg-blue-50 dark:hover:bg-slate-800"
              >
                <QuestionMarkCircleIcon
                  className="h-6 w-6 shrink-0 text-blue-700 dark:text-blue-300"
                  aria-hidden="true"
                />
                <span className="flex-1">
                  <span className="block font-semibold">Need a quick answer?</span>
                  <span className="mt-1 block text-sm text-slate-500 dark:text-slate-400">
                    Troubleshoot checks, access, and notifications
                  </span>
                </span>
                <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Topic cards share a full keyboard-focusable link and concise descriptions. */
function GuideCards({ topics, onSelect }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {topics.map((topic) => {
        const [Icon, title, description] = guides[topic.id];
        return (
          <Link
            key={topic.id}
            to={`/help?topic=${topic.id}`}
            onClick={onSelect}
            className="panel group flex flex-col items-start gap-3 p-5 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 dark:hover:bg-slate-800"
          >
            <span className="rounded-[4px] bg-blue-50 p-2 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
            <ArrowRightIcon
              className="mt-auto h-4 w-4 text-blue-700 dark:text-blue-300"
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </div>
  );
}

/** Native disclosures keep answers available without a long unbroken page. */
function Questions({ questions }) {
  return (
    <div className="space-y-3">
      {questions.map(([question, answer]) => (
        <details key={question} className="panel p-5">
          <summary className="cursor-pointer font-medium leading-6">{question}</summary>
          <p className="mt-3 max-w-prose text-sm leading-7 text-slate-600 dark:text-slate-300">
            {answer}
          </p>
        </details>
      ))}
    </div>
  );
}
