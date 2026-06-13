/**
 * Unit tests for AuthWizard.
 *
 * Covers:
 *  - Dead-config removal: no base64Encode field, no manual Digest params
 *  - Digest auth produces only { username, password } + base fields
 *  - API Key / Basic produce no base64Encode
 *  - OAuth2 Refresh requires clientAuthMethod
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AuthWizard from '../../../components/common/AuthWizard';
import { AuthType } from '../../../hooks/store/createAuthSlice';
import type { Auth, DigestAuth, ApiKeyAuth, BasicAuth, OAuth2RefreshAuth } from '../../../hooks/store/createAuthSlice';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../../components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (v: string) => void; children: React.ReactNode }) => (
    <div data-testid="select-root">{children}</div>
  ),
  SelectTrigger: ({ id, children }: { id?: string; children: React.ReactNode }) => (
    <button data-testid={id ? `select-trigger-${id}` : 'select-trigger'}>{children}</button>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ''}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ value, children, onClick }: { value: string; children: React.ReactNode; onClick?: () => void }) => (
    <button data-value={value} onClick={onClick}>{children}</button>
  ),
}));

vi.mock('../../../components/ui/PrimaryButton', () => ({
  PrimaryButton: ({ onClick, text }: { onClick: () => void; text?: string }) => (
    <button data-testid="primary-btn" onClick={onClick}>{text ?? 'Save'}</button>
  ),
}));

vi.mock('../../../components/ui/SecondaryButton', () => ({
  SecondaryButton: ({ onClick, text }: { onClick: () => void; text?: string }) => (
    <button data-testid="secondary-btn" onClick={onClick}>{text ?? 'Cancel'}</button>
  ),
}));

vi.mock('../../../components/ui/label', () => ({
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}));

vi.mock('../../../components/ui/input', () => ({
  Input: ({ id, value, onChange, placeholder, type }: {
    id?: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string; type?: string;
  }) => (
    <input id={id} value={value} onChange={onChange} placeholder={placeholder} type={type ?? 'text'} />
  ),
}));

// Stub Select with a functional version that allows value changes via custom events
vi.mock('../../../components/ui/select', () => {
  const SelectContext = React.createContext<{ onValueChange?: (v: string) => void }>({});

  const Select = ({ value, onValueChange, children }: { value: string; onValueChange?: (v: string) => void; children: React.ReactNode }) => (
    <SelectContext.Provider value={{ onValueChange }}>
      <div data-testid="select" data-value={value}>{children}</div>
    </SelectContext.Provider>
  );

  const SelectTrigger = ({ id, children }: { id?: string; children: React.ReactNode }) => (
    <div data-testid={id ? `select-trigger-${id}` : 'select-trigger'}>{children}</div>
  );

  const SelectValue = ({ placeholder }: { placeholder?: string }) => <span>{placeholder ?? ''}</span>;

  const SelectContent = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  );

  const SelectItem = ({ value, children }: { value: string; children: React.ReactNode }) => {
    const ctx = React.useContext(SelectContext);
    return (
      <button
        data-testid={`select-item-${value}`}
        onClick={() => ctx.onValueChange?.(value)}
      >
        {children}
      </button>
    );
  };

  return { Select, SelectTrigger, SelectValue, SelectContent, SelectItem };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const fillInput = (labelText: string | RegExp, value: string) => {
  const input = screen.getByLabelText(labelText);
  fireEvent.change(input, { target: { value } });
};

const clickSave = () => {
  fireEvent.click(screen.getByTestId('primary-btn'));
};

const renderWizard = (auth?: Auth, existingNames: string[] = []) => {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(
    <AuthWizard
      auth={auth}
      onSave={onSave}
      onCancel={onCancel}
      existingNames={existingNames}
    />
  );
  return { onSave, onCancel };
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthWizard — dead-config removal', () => {
  it('does not render a base64 encode checkbox', () => {
    renderWizard();
    expect(screen.queryByText(/base64 encode/i)).toBeNull();
    expect(screen.queryByLabelText(/base64/i)).toBeNull();
  });

  it('Digest type shows only username and password — no manual challenge params', () => {
    const digest: DigestAuth = {
      id: 'dig-1',
      name: 'Digest Test',
      type: AuthType.DIGEST,
      enabled: true,
      domainFilters: [],
      username: 'user',
      password: 'pass',
    };
    renderWizard(digest);

    // Username and password present
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();

    // Removed challenge params must not appear
    expect(screen.queryByLabelText(/realm/i)).toBeNull();
    expect(screen.queryByLabelText(/nonce/i)).toBeNull();
    expect(screen.queryByLabelText(/algorithm/i)).toBeNull();
    expect(screen.queryByText(/quality of protection/i)).toBeNull();
    expect(screen.queryByLabelText(/nonce count/i)).toBeNull();
    expect(screen.queryByLabelText(/client nonce/i)).toBeNull();
    expect(screen.queryByLabelText(/opaque/i)).toBeNull();
  });

  it('saves a Digest auth without any challenge param keys on the object', () => {
    const digest: DigestAuth = {
      id: 'dig-2',
      name: 'Digest Save',
      type: AuthType.DIGEST,
      enabled: true,
      domainFilters: [],
      username: 'alice',
      password: 'secret',
    };
    const { onSave } = renderWizard(digest);

    clickSave();

    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0][0] as DigestAuth;
    expect(saved.type).toBe(AuthType.DIGEST);
    expect(saved.username).toBe('alice');
    expect(saved.password).toBe('secret');

    // None of the removed fields should exist
    expect('realm' in saved).toBe(false);
    expect('nonce' in saved).toBe(false);
    expect('algorithm' in saved).toBe(false);
    expect('qop' in saved).toBe(false);
    expect('nc' in saved).toBe(false);
    expect('cnonce' in saved).toBe(false);
    expect('opaque' in saved).toBe(false);
    expect('base64Encode' in saved).toBe(false);
  });

  it('saves an API Key auth without a base64Encode key', () => {
    const apiKey: ApiKeyAuth = {
      id: 'ak-1',
      name: 'My API Key',
      type: AuthType.API_KEY,
      enabled: true,
      domainFilters: [],
      key: 'X-API-Key',
      value: 'my-secret',
      sendIn: 'header',
    };
    const { onSave } = renderWizard(apiKey);
    clickSave();

    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0][0] as ApiKeyAuth;
    expect('base64Encode' in saved).toBe(false);
  });

  it('saves a Basic auth without a base64Encode key', () => {
    const basic: BasicAuth = {
      id: 'b-1',
      name: 'Basic Auth',
      type: AuthType.BASIC,
      enabled: true,
      domainFilters: [],
      username: 'bob',
      password: 'hunter2',
    };
    const { onSave } = renderWizard(basic);
    clickSave();

    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0][0] as BasicAuth;
    expect('base64Encode' in saved).toBe(false);
  });
});

describe('AuthWizard — OAuth2 Refresh clientAuthMethod', () => {
  it('saves OAuth2 Refresh with clientAuthMethod when set', () => {
    const oauth2: OAuth2RefreshAuth = {
      id: 'o2-1',
      name: 'OAuth2 Refresh',
      type: AuthType.OAUTH2_REFRESH,
      enabled: true,
      domainFilters: [],
      tokenUrl: 'https://auth.example.com/token',
      clientId: 'my-client',
      refreshToken: 'rt-abc',
      clientAuthMethod: 'basic',
    };
    const { onSave } = renderWizard(oauth2);
    clickSave();

    expect(onSave).toHaveBeenCalledOnce();
    const saved = onSave.mock.calls[0][0] as OAuth2RefreshAuth;
    expect(saved.clientAuthMethod).toBe('basic');
    expect('accessToken' in saved).toBe(false);
    expect('tokenExpiresAt' in saved).toBe(false);
  });
});
