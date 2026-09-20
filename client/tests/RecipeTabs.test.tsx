import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecipeTabs } from '../src/features/Recipes/components/RecipeTabs.js';
import { UnitToggle } from '../src/features/Recipes/components/UnitToggle.js';

function renderTabs(activeTab: 'cocktail' | 'mocktail' = 'cocktail') {
  const onChange = vi.fn();
  render(<RecipeTabs activeTab={activeTab} panelId="panel-1" onChange={onChange} />);
  return { onChange, tabs: screen.getAllByRole('tab') };
}

describe('RecipeTabs', () => {
  it('marks_activeTab_asSelected', () => {
    const { tabs } = renderTabs('mocktail');

    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('usesRovingTabindex_soTablistIsOneTabStop', () => {
    const { tabs } = renderTabs('cocktail');

    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
  });

  it('associates_everyTab_withThePanel', () => {
    const { tabs } = renderTabs();

    for (const tab of tabs) {
      expect(tab).toHaveAttribute('aria-controls', 'panel-1');
    }
  });

  it('changesTab_onClick', () => {
    const { onChange, tabs } = renderTabs('cocktail');

    fireEvent.click(tabs[1] as HTMLElement);

    expect(onChange).toHaveBeenCalledWith('mocktail');
  });

  it('movesToNextTab_onArrowRight', () => {
    const { onChange, tabs } = renderTabs('cocktail');

    fireEvent.keyDown(tabs[0] as HTMLElement, { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('mocktail');
  });

  it('wrapsToLastTab_onArrowLeftFromFirst', () => {
    const { onChange, tabs } = renderTabs('cocktail');

    fireEvent.keyDown(tabs[0] as HTMLElement, { key: 'ArrowLeft' });

    expect(onChange).toHaveBeenCalledWith('mocktail');
  });

  it('ignores_unrelatedKeys', () => {
    const { onChange, tabs } = renderTabs('cocktail');

    fireEvent.keyDown(tabs[0] as HTMLElement, { key: 'a' });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('UnitToggle', () => {
  it('reflects_currentUnit_viaAriaPressed', () => {
    render(<UnitToggle unit="oz" onToggle={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'ml' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'oz' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles_whenInactiveOptionClicked', () => {
    const onToggle = vi.fn();
    render(<UnitToggle unit="ml" onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: 'oz' }));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('doesNotToggle_whenActiveOptionClicked', () => {
    const onToggle = vi.fn();
    render(<UnitToggle unit="ml" onToggle={onToggle} />);

    fireEvent.click(screen.getByRole('button', { name: 'ml' }));

    expect(onToggle).not.toHaveBeenCalled();
  });
});
