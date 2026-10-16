import { useId, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
            {loginErrorMessage(login.error)}
          </p>
        )}
        <button type="submit" className="btn-add-recipe" disabled={login.isPending}>
          Log in
        </button>
      </form>
    </main>
  );
};
