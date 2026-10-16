import { Link } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { AuthHeaderButton } from './features/Auth/components/AuthHeaderButton.js';
import { SessionExpiredBanner } from './features/Auth/components/SessionExpiredBanner.js';
import { AppRoutes } from './routes.js';

export const App = () => {
  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <Link to="/cocktails">🍹 Cocktail Recipes</Link>
        </h1>
        <AuthHeaderButton />
      </header>
      <SessionExpiredBanner />
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </div>
  );
};
