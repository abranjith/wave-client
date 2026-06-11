import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ResponseBody from '../../../components/common/ResponseBody';
import type { ResponseDownloadPayload } from '../../../types/collection';

function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

describe('ResponseBody', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T03:04:05.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits a typed download payload for JSON responses', () => {
    const body = textToBase64('{"ok":true}');
    const onDownloadResponse = vi.fn();

    render(
      <ResponseBody
        body={body}
        headers={{ 'content-type': 'application/json' }}
        statusCode={200}
        onDownloadResponse={onDownloadResponse}
      />
    );

    const actionButtons = screen.getAllByRole('button');
    fireEvent.click(actionButtons[1]);

    expect(onDownloadResponse).toHaveBeenCalledTimes(1);
    const payload = onDownloadResponse.mock.calls[0][0] as ResponseDownloadPayload;
    expect(payload.body).toBe(body);
    expect(payload.contentType).toBe('application/json');
    expect(payload.fileName).toMatch(/^response_.*\.json$/);
  });

  it('keeps binary response body untouched in the download payload', () => {
    const body = 'iVBORw0KGgoAAAANSUhEUg==';
    const onDownloadResponse = vi.fn();

    render(
      <ResponseBody
        body={body}
        headers={{ 'content-type': 'image/png' }}
        statusCode={200}
        onDownloadResponse={onDownloadResponse}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    expect(onDownloadResponse).toHaveBeenCalledTimes(1);
    const payload = onDownloadResponse.mock.calls[0][0] as ResponseDownloadPayload;
    expect(payload.body).toBe(body);
    expect(payload.contentType).toBe('image/png');
    expect(payload.fileName).toMatch(/^response_.*\.png$/);
  });

  it('normalizes non-encoded response bodies to base64 before download', () => {
    const plainBody = 'plain-text-body';
    const onDownloadResponse = vi.fn();

    render(
      <ResponseBody
        body={plainBody}
        headers={{ 'content-type': 'application/octet-stream' }}
        statusCode={200}
        isEncoded={false}
        onDownloadResponse={onDownloadResponse}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    expect(onDownloadResponse).toHaveBeenCalledTimes(1);
    const payload = onDownloadResponse.mock.calls[0][0] as ResponseDownloadPayload;
    expect(payload.body).toBe(textToBase64(plainBody));
    expect(payload.contentType).toBe('application/octet-stream');
  });
});
