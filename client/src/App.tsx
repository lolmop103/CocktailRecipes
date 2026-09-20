import { Link } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { AppRoutes } from './routes.js';

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <Link to="/cocktails">🍹 Cocktail Recipes</Link>
        </h1>
      </header>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </div>
  );
}
