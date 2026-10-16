import { Link, useLocation } from 'react-router-dom';
import { useUnauthorizedNotice } from '../hooks/useUnauthorizedNotice.js';

/** Shown when a change was refused because the admin session has ended. */
export const SessionExpiredBanner = () => {
  const { expired, dismiss } = useUnauthorizedNotice();
  const location = useLocation();

  if (!expired) return null;

  const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
  return (
    <div className="session-banner" role="alert">
      <span>Your session has expired.</span>
      <Link to={`/login?returnTo=${returnTo}`}>Log in again</Link>
      <button type="button" className="session-banner__dismiss" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  );
};
