import { WorkspaceSignIn } from './workspace-sign-in.jsx';
import { writeApi } from '../data/query-client.js';

import { AuthContext } from './auth-context.js';
import { ArrowRightIcon, ServerStackIcon, BoltIcon } from '@heroicons/react/24/outline';
import React, { useContext, useState } from 'react';

import { Link, Navigate } from 'react-router-dom';

import { ValidatedForm } from '../components/forms/validated-form.jsx';

import { ThemeToggle } from '../preferences/theme.jsx';
import { Logo } from '../components/brand.jsx';

import { ErrorNotice } from '../components/feedback.jsx';

/** Account creation and sign-in with distinct URLs and isolated form state.
 * @param {{register?: boolean}} props
 */
export function AuthPage({ register = false }) {
  const { user, setUser } = useContext(AuthContext);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const submit = async (event, reportErrors) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const data = await writeApi(`/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        body: {
          email: form.get('email'),
          password: form.get('password'),
          ...(register ? { displayName: form.get('displayName') } : {}),
        },
      });
      setUser(data.user);
    } catch (error) {
      setError(error.message);
      reportErrors?.(error.fields);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main
      id="main"
      className="mx-auto grid min-h-screen max-w-5xl items-center gap-14 px-6 pb-14 pt-20 md:grid-cols-2"
    >
      <div className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))]">
        <ThemeToggle />
      </div>
      <section>
        <Logo />
        <h1 className="mt-14 text-5xl font-semibold leading-[1.12] tracking-tight text-slate-900 dark:text-slate-100">
          Detect, Respond,
          <br />
          <span className="text-blue-700 dark:text-blue-400">Resolve</span>
        </h1>

        <div className="mt-10 flex gap-6 text-sm text-slate-500 dark:text-slate-400">
          <span>
            <ServerStackIcon className="inline h-4 w-4" aria-hidden="true" /> Service health
          </span>
          <span>
            <BoltIcon className="inline h-4 w-4" aria-hidden="true" /> Incident response
          </span>
        </div>
      </section>
      <section className="panel p-7 sm:p-10">
        <h2 className="text-2xl font-semibold tracking-tight">
          {register ? 'Create Your Account' : 'Sign in'}
        </h2>

        <ValidatedForm
          key={register ? 'register' : 'login'}
          kind={register ? 'register' : 'auth'}
          onSubmit={submit}
          className="auth-form mt-7 space-y-5"
        >
          <ErrorNotice>{error}</ErrorNotice>
          {register && (
            <label className="field-label">
              Name *<input name="displayName" required maxLength={80} autoComplete="name" />
            </label>
          )}
          <label className="field-label">
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
            />
          </label>
          <label className="field-label">
            Password
            <input
              name="password"
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              minLength={12}
              maxLength={128}
              required
              placeholder="At least 12 characters"
            />
          </label>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : register ? 'Create Account' : 'Sign in'}
            <ArrowRightIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </ValidatedForm>
        {!register && <WorkspaceSignIn />}
        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          {register ? 'Already have an account?' : 'New here?'}{' '}
          <Link
            className="font-semibold text-blue-700 dark:text-blue-400 hover:underline"
            to={register ? '/login' : '/register'}
          >
            {register ? 'Sign in' : 'Create an Account'}
          </Link>
        </p>
      </section>
    </main>
  );
}
