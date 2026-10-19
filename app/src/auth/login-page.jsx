import { WorkspaceSignIn } from './workspace-sign-in.jsx';
import { writeApi } from '../data/query-client.js';

import { AuthContext } from './auth-context.js';
import React, { useContext, useState, useEffect } from 'react';

import { Link, Navigate, useLocation } from 'react-router-dom';

import { ValidatedForm } from '../components/forms/validated-form.jsx';

import { ThemeToggle } from '../preferences/theme.jsx';
import { Logo } from '../components/brand.jsx';

import { ErrorNotice } from '../components/feedback.jsx';

/** Account creation and sign-in with distinct URLs and isolated form state.
 * @param {{register?: boolean}} props
 */
export function AuthPage({ register = false }) {
  const { user, setUser } = useContext(AuthContext);
  const location = useLocation();
  const [workspaceLogin, setWorkspaceLogin] = useState(
    () =>
      new URLSearchParams(location.search).has('workspace') ||
      new URLSearchParams(location.search).has('ssoError'),
  );
  useEffect(() => {
    document.title = `${register ? 'Create account' : 'Sign in'} · ServiceTrident`;
  }, [register]);
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
    <main id="main" className="flex min-h-dvh items-center justify-center px-5 py-16">
      <div className="absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(1rem,env(safe-area-inset-top))]">
        <ThemeToggle />
      </div>
      <section className="panel w-full max-w-[400px] p-7 sm:p-9">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <h1 className="text-center text-xl font-semibold">
          {register ? 'Create account' : 'Sign in'}
        </h1>

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
              placeholder={register ? 'At least 12 characters' : undefined}
            />
          </label>
          <button className="btn-primary w-full" disabled={busy} aria-busy={busy}>
            {register ? 'Create Account' : 'Sign in'}
          </button>
        </ValidatedForm>
        {!register &&
          (workspaceLogin ? (
            <WorkspaceSignIn />
          ) : (
            <button
              type="button"
              className="mt-5 w-full text-center text-sm text-blue-700 hover:underline dark:text-blue-300"
              onClick={() => setWorkspaceLogin(true)}
            >
              Sign in with your organization
            </button>
          ))}
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
