import { useId, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '@/lib/http.js';
import { useCountdown } from './hooks/useCountdown.js';
import { useLogin } from './hooks/useSession.js';
import { loginErrorMessage, safeReturnTo } from './loginForm.js';

/** The admin login. Lazy-loaded: visitors who only browse never download it. */
export const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const login = useLogin();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const id = useId();
  const retryAfter = login.error instanceof ApiError ? login.error.retryAfterSeconds : undefined;
  const remaining = useCountdown(retryAfter, login.error);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate(
      { username, password },
      {
        onSuccess: () => {
          void navigate(safeReturnTo(searchParams.get('returnTo')), { replace: true });
        },
      },
    );
  };

  return (
    <main className="login-page">
      <h2>Admin login</h2>
      <form className="login-form" onSubmit={handleSubmit}>
        <label htmlFor={`${id}-username`}>Username</label>
        <input
          id={`${id}-username`}
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <label htmlFor={`${id}-password`}>Password</label>
        <input
          id={`${id}-password`}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {login.isError && (
          <p role="alert" className="login-form__error">
            {remaining > 0 ? (
              <>
                <span className="login-form__announce">{loginErrorMessage(login.error)}</span>
                <span aria-hidden="true">Too many attempts — try again in {remaining} s</span>
              </>
            ) : (
              loginErrorMessage(login.error)
            )}
          </p>
        )}
        <button
          type="submit"
          className="btn-add-recipe"
          disabled={login.isPending || remaining > 0}
        >
          Log in
        </button>
      </form>
    </main>
  );
};
