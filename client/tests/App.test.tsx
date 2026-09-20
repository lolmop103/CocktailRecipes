import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from './testUtils.js';

// Isolate App from the feature's network calls; routing itself is what is under test.
vi.mock('../src/features/Recipes/RecipesPage.js', () => ({
  RecipesPage: ({ tab }: { tab: string }) => <div data-testid="recipes-page">{tab}</div>,
}));

const { App } = await import('../src/App.js');

describe('App', () => {
  it('renders_heading_Cocktail', () => {
    renderWithProviders(<App />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cocktail');
  });

  it('routes_cocktailsPath_toTheCocktailTab', () => {
    renderWithProviders(<App />, { route: '/cocktails' });

    expect(screen.getByTestId('recipes-page')).toHaveTextContent('cocktail');
  });

  it('routes_mocktailsPath_toTheMocktailTab', () => {
    renderWithProviders(<App />, { route: '/mocktails' });

    expect(screen.getByTestId('recipes-page')).toHaveTextContent('mocktail');
  });

  it('redirects_root_toCocktails', () => {
    renderWithProviders(<App />, { route: '/' });

    expect(screen.getByTestId('recipes-page')).toHaveTextContent('cocktail');
  });

  it('redirects_unknownPath_toCocktails_ratherThanBlankPage', () => {
    renderWithProviders(<App />, { route: '/nonsense' });

    expect(screen.getByTestId('recipes-page')).toHaveTextContent('cocktail');
  });
});
