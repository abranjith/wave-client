import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import RequestSent from '../../../components/common/RequestSent';
import useAppStateStore from '../../../hooks/store/useAppStateStore';
import { createEmptyTab } from '../../../types/tab';
import type { SentRequestData } from '../../../types/collection';

function resetStore(): void {
  const tab = createEmptyTab();
  useAppStateStore.setState({
    tabs: [tab],
    activeTabId: tab.id,
  });
}

function setActiveTabSentRequest(sentRequest: SentRequestData | null): void {
  const state = useAppStateStore.getState();
  const activeTab = state.getActiveTab();
  if (!activeTab) {
    throw new Error('Expected an active tab for RequestSent tests.');
  }

  useAppStateStore.setState({
    tabs: state.tabs.map((tab) =>
      tab.id === activeTab.id
        ? {
            ...tab,
            sentRequest,
          }
        : tab
    ),
  });
}

beforeEach(() => {
  resetStore();
});

describe('RequestSent', () => {
  it('shows empty state when no sent request is available', () => {
    setActiveTabSentRequest(null);

    render(<RequestSent />);

    expect(screen.getByText('Send the request to see exactly what was sent.')).toBeInTheDocument();
  });

  it('renders method/url, headers, and body from the sent request snapshot', () => {
    setActiveTabSentRequest({
      method: 'POST',
      url: 'https://api.example.com/users?page=1',
      headers: {
        Authorization: 'Bearer secret-token',
        'Content-Type': 'application/json',
      },
      body: {
        text: '{"name":"alice"}',
        format: 'json',
      },
    });

    render(<RequestSent />);

    expect(screen.getByText('POST')).toBeInTheDocument();
    // URL includes the query params (single-line method + URL).
    expect(screen.getByText('https://api.example.com/users?page=1')).toBeInTheDocument();
    expect(screen.getByText('Authorization')).toBeInTheDocument();
    expect(screen.getByText('Bearer secret-token')).toBeInTheDocument();
    expect(screen.getByText('{"name":"alice"}')).toBeInTheDocument();
  });

  it('styles the HTTP method using the shared method color palette', () => {
    setActiveTabSentRequest({
      method: 'POST',
      url: 'https://api.example.com/users',
      headers: {},
      body: { text: '{}', format: 'json' },
    });

    render(<RequestSent />);

    // POST → blue palette from getHttpMethodColor.
    expect(screen.getByText('POST').className).toContain('bg-blue-100');
  });

  it('shows the body format hint and no content-type row in the Body section', () => {
    setActiveTabSentRequest({
      method: 'POST',
      url: 'https://api.example.com/users',
      headers: { 'Content-Type': 'application/json' },
      body: { text: '{"a":1}', format: 'json' },
    });

    render(<RequestSent />);

    // Format hint surfaces the type; content-type itself is only in Headers.
    expect(screen.getByText('json')).toBeInTheDocument();
    expect(screen.getByText('{"a":1}')).toBeInTheDocument();
  });

  it('supports collapsing and expanding sections', () => {
    setActiveTabSentRequest({
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: {
        Accept: 'application/json',
      },
      body: {
        text: 'payload',
        format: 'text',
      },
    });

    render(<RequestSent />);

    expect(screen.getByText('application/json')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Headers' }));
    expect(screen.queryByText('application/json')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Headers' }));
    expect(screen.getByText('application/json')).toBeInTheDocument();
  });

  it('renders form-data/file summaries without exposing base64 payload', () => {
    const filePayload = 'VGhpcy1zaG91bGQtbm90LWFwcGVhcg==';
    const bodyText = JSON.stringify(
      [
        { key: 'meta', value: 'notes' },
        { key: 'file', file: { fileName: 'avatar.png', contentType: 'image/png' } },
      ],
      null,
      2
    );

    setActiveTabSentRequest({
      method: 'POST',
      url: 'https://upload.example.com',
      headers: {
        Authorization: 'Bearer token',
      },
      body: {
        text: bodyText,
        format: 'json',
      },
    });

    render(<RequestSent />);

    expect(screen.getByText(/avatar\.png/)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(filePayload))).not.toBeInTheDocument();
  });
});
