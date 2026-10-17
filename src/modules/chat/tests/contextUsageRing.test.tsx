import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import '@/modules/i18n';
import TokenUsageSummary from '@/modules/chat/composer/TokenUsageSummary';

const USAGE = { used: 150_000, total: 200_000, inputTokens: 140_000, outputTokens: 10_000 };

describe('the context usage ring', () => {
  it('shows the percentage and opens a popover with the numbers and details', () => {
    const onDetails = vi.fn();
    render(<TokenUsageSummary usage={USAGE} onClick={onDetails} />);

    const trigger = screen.getByRole('button', { name: 'Context usage' });
    expect(trigger.textContent).toContain('75%');
    expect(trigger.getAttribute('title')).toBe('150K / 200K (75%)');
    expect(screen.getByTestId('context-ring-fill').getAttribute('class')).toContain('text-amber-500');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Token details' }));
    expect(onDetails).toHaveBeenCalledTimes(1);
  });

  it('compacts with the typed instructions', () => {
    const onCompact = vi.fn();
    render(<TokenUsageSummary usage={USAGE} onCompact={onCompact} canCompact />);

    fireEvent.click(screen.getByRole('button', { name: 'Context usage' }));
    fireEvent.change(screen.getByLabelText('Instructions (optional)'), { target: { value: '  keep the API notes ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compact' }));

    expect(onCompact).toHaveBeenCalledWith('keep the API notes');
  });

  it('cannot compact while a turn runs, and says so while compacting', () => {
    const onCompact = vi.fn();
    const { rerender } = render(<TokenUsageSummary usage={USAGE} onCompact={onCompact} canCompact={false} />);

    fireEvent.click(screen.getByRole('button', { name: 'Context usage' }));
    expect((screen.getByRole('button', { name: 'Compact' }) as HTMLButtonElement).disabled).toBe(true);

    rerender(<TokenUsageSummary usage={USAGE} onCompact={onCompact} canCompact={false} isCompacting />);
    expect((screen.getByRole('button', { name: 'Compacting…' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('falls back to the token count when the window is unknown', () => {
    render(<TokenUsageSummary usage={{ used: 1_500 }} />);

    const trigger = screen.getByRole('button', { name: 'Context usage' });
    expect(trigger.textContent).toContain('1.5K');
    expect(screen.queryByTestId('context-ring-fill')).toBeNull();
  });

  it('offers no Compact action when the chat cannot compact', () => {
    render(<TokenUsageSummary usage={USAGE} />);

    fireEvent.click(screen.getByRole('button', { name: 'Context usage' }));
    expect(screen.queryByRole('button', { name: 'Compact' })).toBeNull();
  });
});
