/**
 * Unit tests for WsMessageComposer component.
 *
 * Tested scenarios:
 *  1.  Pressing Enter with text calls onSend(text).
 *  2.  Pressing Enter with empty/whitespace-only text does not call onSend.
 *  3.  Pressing Shift+Enter does not call onSend (inserts newline instead).
 *  4.  Clicking the Send button with text calls onSend(text).
 *  5.  Clicking Send with empty input does not call onSend.
 *  6.  Input is cleared after a successful send (Enter).
 *  7.  Input is cleared after a successful send (button click).
 *  8.  When disabled=true, Send button is disabled.
 *  9.  When disabled=true, textarea is disabled.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WsMessageComposer from '../../../components/common/WsMessageComposer';

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderComposer(onSend = vi.fn(), disabled = false) {
    return render(<WsMessageComposer onSend={onSend} disabled={disabled} />);
}

function getTextarea() {
    return screen.getByPlaceholderText('Type a message and press Enter to send…');
}

function getSendButton() {
    return screen.getByRole('button', { name: /send/i });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WsMessageComposer', () => {
    it('pressing Enter with text calls onSend(text)', () => {
        const onSend = vi.fn();
        renderComposer(onSend);

        fireEvent.change(getTextarea(), { target: { value: 'hello' } });
        fireEvent.keyDown(getTextarea(), { key: 'Enter', shiftKey: false });

        expect(onSend).toHaveBeenCalledTimes(1);
        expect(onSend).toHaveBeenCalledWith('hello');
    });

    it('pressing Enter with empty text does not call onSend', () => {
        const onSend = vi.fn();
        renderComposer(onSend);

        fireEvent.keyDown(getTextarea(), { key: 'Enter', shiftKey: false });
        expect(onSend).not.toHaveBeenCalled();
    });

    it('pressing Enter with whitespace-only text does not call onSend', () => {
        const onSend = vi.fn();
        renderComposer(onSend);

        fireEvent.change(getTextarea(), { target: { value: '   ' } });
        fireEvent.keyDown(getTextarea(), { key: 'Enter', shiftKey: false });

        expect(onSend).not.toHaveBeenCalled();
    });

    it('pressing Shift+Enter does not call onSend', () => {
        const onSend = vi.fn();
        renderComposer(onSend);

        fireEvent.change(getTextarea(), { target: { value: 'line one' } });
        fireEvent.keyDown(getTextarea(), { key: 'Enter', shiftKey: true });

        expect(onSend).not.toHaveBeenCalled();
    });

    it('clicking the Send button with text calls onSend(text)', () => {
        const onSend = vi.fn();
        renderComposer(onSend);

        fireEvent.change(getTextarea(), { target: { value: 'via button' } });
        fireEvent.click(getSendButton());

        expect(onSend).toHaveBeenCalledTimes(1);
        expect(onSend).toHaveBeenCalledWith('via button');
    });

    it('clicking Send with empty input does not call onSend', () => {
        const onSend = vi.fn();
        renderComposer(onSend);

        // The button is disabled when input is empty, but verify the guard anyway
        fireEvent.click(getSendButton());
        expect(onSend).not.toHaveBeenCalled();
    });

    it('input is cleared after a successful send via Enter', () => {
        renderComposer();

        const textarea = getTextarea() as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'to clear' } });
        expect(textarea.value).toBe('to clear');

        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
        expect(textarea.value).toBe('');
    });

    it('input is cleared after a successful send via button click', () => {
        renderComposer();

        const textarea = getTextarea() as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'to clear via btn' } });
        fireEvent.click(getSendButton());
        expect(textarea.value).toBe('');
    });

    it('Send button is disabled when disabled=true', () => {
        renderComposer(vi.fn(), true);
        expect(getSendButton()).toBeDisabled();
    });

    it('textarea is disabled when disabled=true', () => {
        renderComposer(vi.fn(), true);
        expect(getTextarea()).toBeDisabled();
    });
});
