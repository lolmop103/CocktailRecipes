import { Navigate, Route, Routes } from 'react-router-dom';
import { RecipesPage } from './features/Recipes/RecipesPage.js';

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/cocktails" replace />} />
      <Route path="/cocktails" element={<RecipesPage tab="cocktail" />} />
      <Route path="/mocktails" element={<RecipesPage tab="mocktail" />} />
      {/* Unknown paths fall back to the default view rather than a blank page. */}
      <Route path="*" element={<Navigate to="/cocktails" replace />} />
    </Routes>
  );
};
