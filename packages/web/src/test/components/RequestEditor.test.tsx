import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import RequestEditor from '../../components/RequestEditor';

const mockCoreState = vi.hoisted(() => ({
  activeTab: {
    id: 'tab-1',
    name: 'Request Tab',
    method: 'GET',
    url: 'https://api.example.com/users',
    folderPath: [],
    errorMessage: '',
    isRequestProcessing: false,
    responseData: null,
    activeRequestSection: 'Params',
    activeResponseSection: 'Body',
    protocol: 'http',
    authId: null,
    environmentId: null,
    isDirty: true,
    sentRequest: null,
  } as Record<string, unknown>,
  activeTabId: 'tab-1',
  setActiveRequestSection: vi.fn(),
  cancelRequest: vi.fn(async () => ({ isOk: true })),
  showNotification: vi.fn(),
}));

vi.mock('@wave-client/core', async () => {

  const passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;

  return {
    PrimaryButton: ({ onClick, children, text, tooltip, disabled }: { onClick?: () => void; children?: React.ReactNode; text?: string; tooltip?: string; disabled?: boolean }) => (
      <button onClick={onClick} aria-label={tooltip} disabled={disabled}>{text || tooltip || children}</button>
    ),
    StyledInput: ({ value, onChange, placeholder }: { value: string; onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) => (
      <input value={value} onChange={onChange} placeholder={placeholder} />
    ),
    RequestParams: () => <div>params-content</div>,
    RequestHeaders: () => <div>headers-content</div>,
    RequestBody: () => <div>body-content</div>,
    RequestValidation: () => <div>validation-content</div>,
    RequestSent: () => (
      <div data-testid="request-sent">{String((mockCoreState.activeTab as Record<string, unknown>).sentRequest ? ((mockCoreState.activeTab as Record<string, unknown>).sentRequest as Record<string, unknown>).url : '')}</div>
    ),
    ResponseBody: () => <div>response-body</div>,
    ResponseValidation: () => <div>response-validation</div>,
    Banner: () => null,
    TabsBar: () => null,
    RequestSaveWizard: () => null,
    Select: passthrough,
    SelectContent: passthrough,
    SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
    SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
    Breadcrumb: passthrough,
    BreadcrumbItem: passthrough,
    BreadcrumbLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    BreadcrumbList: passthrough,
    BreadcrumbPage: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    BreadcrumbSeparator: () => <span>/</span>,
    ProtocolSelector: () => <div>protocol-selector</div>,
    ConnectionControls: () => <div>connection-controls</div>,
    WsOutputArea: () => <div>ws-output</div>,
    SseOutputArea: () => <div>sse-output</div>,
    TAB_CONSTANTS: {
      DEFAULT_NAME: 'Untitled Request',
    },
    renderParameterizedText: (value: string) => value,
    getResponseLanguage: () => undefined,
    useWsConnection: () => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
      sendMessage: vi.fn(),
    }),
    useSseConnection: () => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    useHttpAdapter: () => ({
      executeRequest: vi.fn(),
      cancelRequest: mockCoreState.cancelRequest,
    }),
    useNotificationAdapter: () => ({
      showNotification: mockCoreState.showNotification,
    }),
    useSaveShortcut: () => ({ onKeyDown: vi.fn() }),
    getRequestTabsForProtocol: (protocol: 'http' | 'ws' | 'sse') => {
      if (protocol === 'ws') {
        return ['Params', 'Headers'];
      }
      if (protocol === 'sse') {
        return ['Params', 'Headers', 'Body'];
      }
      return ['Params', 'Headers', 'Body', 'Validation', 'Sent'];
    },
    useAppStateStore: (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        getActiveTab: () => mockCoreState.activeTab,
        activeTabId: mockCoreState.activeTabId,
        updateMethod: vi.fn(),
        updateUrl: vi.fn(),
        setActiveTab: vi.fn(),
        setActiveRequestSection: mockCoreState.setActiveRequestSection,
        setActiveResponseSection: vi.fn(),
        setTabEnvironment: vi.fn(),
        setTabAuth: vi.fn(),
        setErrorMessage: vi.fn(),
        getCollectionRequest: vi.fn(() => ({
          id: 'tab-1',
          name: 'Request Tab',
          method: 'GET',
          url: 'https://api.example.com/users',
        })),
        getActiveEnvVariableKeys: vi.fn(() => []),
        environments: [],
        auths: [],
      }),
  };
});

describe('web RequestEditor Sent tab rendering', () => {
  const defaultProps = {
    onSendRequest: vi.fn(),
    onSaveRequest: vi.fn(),
    onDownloadResponse: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCoreState.activeTab = {
      id: 'tab-1',
      name: 'Request Tab',
      method: 'GET',
      url: 'https://api.example.com/users',
      folderPath: [],
      errorMessage: '',
      isRequestProcessing: false,
      responseData: null,
      activeRequestSection: 'Params',
      activeResponseSection: 'Body',
      protocol: 'http',
      authId: null,
      environmentId: null,
      isDirty: true,
      sentRequest: null,
    };
    mockCoreState.activeTabId = 'tab-1';
  });

  it('renders Sent tab content for HTTP when Sent is selected and sentRequest exists', () => {
    mockCoreState.activeTab = {
      ...mockCoreState.activeTab,
      protocol: 'http',
      activeRequestSection: 'Sent',
      sentRequest: {
        method: 'GET',
        url: 'https://api.example.com/users?limit=10',
        headers: {
          Authorization: 'Bearer token',
        },
      },
    };

    render(<RequestEditor {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Sent' })).toBeInTheDocument();
    expect(screen.getByTestId('request-sent')).toHaveTextContent('https://api.example.com/users?limit=10');
  });

  it('does not render Sent tab for WebSocket tabs', () => {
    mockCoreState.activeTab = {
      ...mockCoreState.activeTab,
      protocol: 'ws',
      activeRequestSection: 'Params',
      sentRequest: null,
    };

    render(<RequestEditor {...defaultProps} />);

    expect(screen.queryByRole('button', { name: 'Sent' })).not.toBeInTheDocument();
  });

  it('hides the Sent tab for HTTP tabs until a request has been sent', () => {
    mockCoreState.activeTab = {
      ...mockCoreState.activeTab,
      protocol: 'http',
      activeRequestSection: 'Params',
      sentRequest: null,
    };

    render(<RequestEditor {...defaultProps} />);

    expect(screen.queryByRole('button', { name: 'Sent' })).not.toBeInTheDocument();
    // The other request tabs remain visible.
    expect(screen.getByRole('button', { name: 'Params' })).toBeInTheDocument();
  });

  it('collapses and expands the request section using the chevron toggle', () => {
    render(<RequestEditor {...defaultProps} />);

    expect(screen.getByText('params-content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse request section' }));
    expect(screen.queryByText('params-content')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Expand request section' }));
    expect(screen.getByText('params-content')).toBeInTheDocument();
  });
});

describe('web RequestEditor Send/Cancel toggle', () => {
  const defaultProps = {
    onSendRequest: vi.fn(),
    onSaveRequest: vi.fn(),
    onDownloadResponse: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCoreState.cancelRequest = vi.fn(async () => ({ isOk: true }));
    mockCoreState.activeTab = {
      id: 'tab-1',
      name: 'Request Tab',
      method: 'GET',
      url: 'https://api.example.com/users',
      folderPath: [],
      errorMessage: '',
      isRequestProcessing: false,
      responseData: null,
      activeRequestSection: 'Params',
      activeResponseSection: 'Body',
      protocol: 'http',
      authId: null,
      environmentId: null,
      isDirty: true,
      sentRequest: null,
    };
    mockCoreState.activeTabId = 'tab-1';
  });

  it('shows Send (not Cancel) when idle', () => {
    render(<RequestEditor {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('shows Cancel (not Send) while the request is processing', () => {
    mockCoreState.activeTab = { ...mockCoreState.activeTab, isRequestProcessing: true };

    render(<RequestEditor {...defaultProps} />);

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
  });

  it('clicking Cancel calls cancelRequest with the active tab id exactly once', () => {
    mockCoreState.activeTab = { ...mockCoreState.activeTab, isRequestProcessing: true };

    render(<RequestEditor {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockCoreState.cancelRequest).toHaveBeenCalledTimes(1);
    expect(mockCoreState.cancelRequest).toHaveBeenCalledWith('tab-1');
    expect(defaultProps.onSendRequest).not.toHaveBeenCalled();
  });

  it('renders a distinct "Request cancelled" state for a status 0 / Cancelled response', () => {
    mockCoreState.activeTab = {
      ...mockCoreState.activeTab,
      isRequestProcessing: false,
      responseData: {
        id: 'tab-1',
        status: 0,
        statusText: 'Cancelled',
        elapsedTime: 12,
        size: 0,
        body: '',
        headers: {},
        isEncoded: false,
      },
    };

    render(<RequestEditor {...defaultProps} />);

    expect(screen.getByText('Request cancelled')).toBeInTheDocument();
    // After the cancelled response lands, the Send button is available again.
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});
