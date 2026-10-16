import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RecipesPage } from './features/Recipes/RecipesPage.js';

// Only the admin ever opens the login page, so visitors never download it.
const LoginPage = lazy(() =>
  import('./features/Auth/LoginPage.js').then((m) => ({ default: m.LoginPage })),
);

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/cocktails" replace />} />
      <Route path="/cocktails" element={<RecipesPage tab="cocktail" />} />
      <Route path="/mocktails" element={<RecipesPage tab="mocktail" />} />
      <Route
        path="/login"
        element={
          <Suspense fallback={<p className="status-msg">Loading…</p>}>
            <LoginPage />
          </Suspense>
        }
      />
      {/* Unknown paths fall back to the default view rather than a blank page. */}
      <Route path="*" element={<Navigate to="/cocktails" replace />} />
    </Routes>
  );
};
