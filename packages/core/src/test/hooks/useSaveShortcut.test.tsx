import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useSaveShortcut } from '../../hooks/useSaveShortcut';

// ---------------------------------------------------------------------------
// Wrapper component: spreads the hook's onKeyDown onto a focusable div so we
// can fire keyboard events that bubble up to it just like real editor focus.
// ---------------------------------------------------------------------------

interface WrapperProps {
  onSave: () => void;
  enabled?: boolean;
}

function Wrapper({ onSave, enabled }: WrapperProps) {
  const { onKeyDown } = useSaveShortcut(onSave, { enabled });
  return (
    <div data-testid="container" onKeyDown={onKeyDown} tabIndex={0}>
      <input data-testid="input" />
    </div>
  );
}

// Helper: fire a keydown on the container element with chosen modifiers.
function fireKeyDown(
  element: HTMLElement,
  key: string,
  modifiers: Partial<KeyboardEventInit> = {}
) {
  fireEvent.keyDown(element, { key, ...modifiers });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSaveShortcut', () => {
  let onSave: Mock<() => void>;

  beforeEach(() => {
    onSave = vi.fn<() => void>();
  });

  it('calls onSave once on Ctrl+S', () => {
    const { getByTestId } = render(<Wrapper onSave={onSave} />);
    const container = getByTestId('container');
    fireKeyDown(container, 's', { ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('calls onSave once on Cmd+S (metaKey)', () => {
    const { getByTestId } = render(<Wrapper onSave={onSave} />);
    fireKeyDown(getByTestId('container'), 's', { metaKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('prevents default browser action on Ctrl+S', () => {
    const { getByTestId } = render(<Wrapper onSave={onSave} />);
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    getByTestId('container').dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('does not call onSave for plain S key (no modifier)', () => {
    const { getByTestId } = render(<Wrapper onSave={onSave} />);
    fireKeyDown(getByTestId('container'), 's');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not call onSave for Ctrl+Shift+S', () => {
    const { getByTestId } = render(<Wrapper onSave={onSave} />);
    fireKeyDown(getByTestId('container'), 's', { ctrlKey: true, shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not call onSave for Ctrl+Alt+S', () => {
    const { getByTestId } = render(<Wrapper onSave={onSave} />);
    fireKeyDown(getByTestId('container'), 's', { ctrlKey: true, altKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not call onSave when enabled is false', () => {
    const { getByTestId } = render(<Wrapper onSave={onSave} enabled={false} />);
    fireKeyDown(getByTestId('container'), 's', { ctrlKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not call onSave for uppercase S with Ctrl (Shift held)', () => {
    // Pressing Shift+S produces key 'S'. The spec excludes shiftKey, so this
    // must not fire — uppercase letter from Caps Lock or Shift is excluded.
    const { getByTestId } = render(<Wrapper onSave={onSave} />);
    fireKeyDown(getByTestId('container'), 'S', { ctrlKey: true, shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('normalizes uppercase S from caps lock (no shiftKey) via toLowerCase', () => {
    // Caps Lock can produce key 'S' without shiftKey — toLowerCase handles it.
    const { getByTestId } = render(<Wrapper onSave={onSave} />);
    fireKeyDown(getByTestId('container'), 'S', { ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('calls onSave when Ctrl+S fires from a child element (bubbles up)', () => {
    const { getByTestId } = render(<Wrapper onSave={onSave} />);
    // Fire from the inner input — should bubble to the container onKeyDown.
    fireKeyDown(getByTestId('input'), 's', { ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for unrelated keys', () => {
    const { getByTestId } = render(<Wrapper onSave={onSave} />);
    fireKeyDown(getByTestId('container'), 'a', { ctrlKey: true });
    fireKeyDown(getByTestId('container'), 'z', { ctrlKey: true });
    fireKeyDown(getByTestId('container'), 'Enter');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('defaults enabled to true when options are omitted', () => {
    // Render without passing options to exercise the default.
    function NoOptions({ onSave: save }: { onSave: () => void }) {
      const { onKeyDown } = useSaveShortcut(save);
      return <div data-testid="c" onKeyDown={onKeyDown} tabIndex={0} />;
    }
    const { getByTestId } = render(<NoOptions onSave={onSave} />);
    fireKeyDown(getByTestId('c'), 's', { ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('responds to updated onSave ref without re-attaching handler', () => {
    const firstSave = vi.fn<() => void>();
    const secondSave = vi.fn<() => void>();
    const { getByTestId, rerender } = render(<Wrapper onSave={firstSave} />);
    fireKeyDown(getByTestId('container'), 's', { ctrlKey: true });
    expect(firstSave).toHaveBeenCalledTimes(1);
    rerender(<Wrapper onSave={secondSave} />);
    fireKeyDown(getByTestId('container'), 's', { ctrlKey: true });
    expect(secondSave).toHaveBeenCalledTimes(1);
    expect(firstSave).toHaveBeenCalledTimes(1);
  });
});
