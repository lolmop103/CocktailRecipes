import { Link, useLocation } from 'react-router-dom';
import { useLogout, useLogoutAll, useSession } from '../hooks/useSession.js';

/** "Log in" for visitors, "Log out" and "Log out everywhere" for the admin. */
export const AuthHeaderButton = () => {
  const { isAdmin, isPending } = useSession();
  const logout = useLogout();
  const logoutAll = useLogoutAll();
  const location = useLocation();

  if (isPending) return null;

  if (isAdmin) {
    return (
      <>
        <button type="button" className="auth-button" onClick={() => logout.mutate()}>
          Log out
        </button>
        <button type="button" className="auth-button" onClick={() => logoutAll.mutate()}>
          Log out everywhere
        </button>
      </>
    );
  }

  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
  return (
    <Link className="auth-button" to={`/login?returnTo=${returnTo}`}>
      Log in
    </Link>
  );
};
