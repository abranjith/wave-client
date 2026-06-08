import { beforeEach, describe, expect, it, vi } from 'vitest';

interface MockDisposable {
  dispose: () => void;
}

interface MockUri {
  fsPath: string;
  path: string;
  toString: () => string;
}

interface MockWebview {
  html: string;
  options: Record<string, unknown>;
  cspSource: string;
  postMessage: ReturnType<typeof vi.fn>;
  onDidReceiveMessage: ReturnType<typeof vi.fn>;
  asWebviewUri: (uri: MockUri) => string;
}

interface MockWebviewHost {
  webview: MockWebview;
  onDidDispose: ReturnType<typeof vi.fn>;
  reveal: ReturnType<typeof vi.fn>;
  iconPath?: unknown;
}

interface MockWebviewView extends MockWebviewHost {
  viewType: string;
  visible: boolean;
  onDidChangeVisibility: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
}

interface MockExtensionContext {
  secrets: unknown;
  extensionUri: MockUri;
  subscriptions: Array<{ dispose?: () => void }>;
}

const createDisposable = (): MockDisposable => ({
  dispose: vi.fn(),
});

const createMockWebview = (): MockWebview => ({
  html: '',
  options: {},
  cspSource: 'vscode-resource',
  postMessage: vi.fn(),
  onDidReceiveMessage: vi.fn(() => createDisposable()),
  asWebviewUri: (uri: MockUri) => `webview:${uri.fsPath}`,
});

const createMockWebviewHost = (): MockWebviewHost => ({
  webview: createMockWebview(),
  onDidDispose: vi.fn(() => createDisposable()),
  reveal: vi.fn(),
});

const createMockWebviewView = (): MockWebviewView => ({
  ...createMockWebviewHost(),
  viewType: 'wave-client-view',
  visible: true,
  onDidChangeVisibility: vi.fn(() => createDisposable()),
  show: vi.fn(),
});

const createMockExtensionContext = (): MockExtensionContext => ({
  secrets: {},
  extensionUri: {
    fsPath: '/mock/extension',
    path: '/mock/extension',
    toString: () => 'file:///mock/extension',
  },
  subscriptions: [],
});

const createOutputChannelMock = vi.fn(() => ({
  appendLine: vi.fn(),
  dispose: vi.fn(),
}));
const createWebviewPanelMock = vi.fn<() => MockWebviewHost>(() => createMockWebviewHost());
const registerCommandMock = vi.fn();
const registerWebviewViewProviderMock = vi.fn();
const showErrorMessageMock = vi.fn();
const statMock = vi.fn(async () => undefined);

const joinPathMock = vi.fn((base: MockUri, ...parts: string[]): MockUri => {
  const basePath = base.path ?? base.fsPath;
  const normalized = `${basePath}/${parts.join('/')}`.replace(/\\/g, '/').replace(/\/+/g, '/');
  return {
    fsPath: normalized,
    path: normalized,
    toString: () => normalized,
  };
});

const initializeSecurityMock = vi.fn();
const handleMessageMock = vi.fn(async () => undefined);
const disposeHandlerMock = vi.fn();
const MessageHandlerMock = vi.fn(() => ({
  handleMessage: handleMessageMock,
  dispose: disposeHandlerMock,
}));

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: createOutputChannelMock,
    createWebviewPanel: createWebviewPanelMock,
    registerWebviewViewProvider: registerWebviewViewProviderMock,
    showErrorMessage: showErrorMessageMock,
  },
  commands: {
    registerCommand: registerCommandMock,
  },
  workspace: {
    fs: {
      stat: statMock,
    },
  },
  Uri: {
    joinPath: joinPathMock,
  },
  ViewColumn: {
    One: 1,
  },
}));

vi.mock('../services/SecurityService.js', () => ({
  securityService: {
    initialize: initializeSecurityMock,
  },
}));

vi.mock('../handlers/MessageHandler.js', () => ({
  MessageHandler: MessageHandlerMock,
}));

describe('extension activation and view wiring', () => {
  let registeredOpenCommand: (() => Promise<void>) | undefined;
  let registeredViewProvider:
    | { resolveWebviewView: (webviewView: MockWebviewView) => Promise<void> }
    | undefined;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    registeredOpenCommand = undefined;
    registeredViewProvider = undefined;

    registerCommandMock.mockImplementation(
      (commandId: string, callback: () => Promise<void>) => {
        if (commandId === 'waveclient.open') {
          registeredOpenCommand = callback;
        }
        return createDisposable();
      }
    );

    registerWebviewViewProviderMock.mockImplementation(
      (
        viewId: string,
        provider: { resolveWebviewView: (webviewView: MockWebviewView) => Promise<void> }
      ) => {
        if (viewId === 'wave-client-view') {
          registeredViewProvider = provider;
        }
        return createDisposable();
      }
    );

    createWebviewPanelMock.mockImplementation(() => createMockWebviewHost());
    statMock.mockResolvedValue(undefined);
  });

  it('registers wave command and sidebar webview provider during activation', async () => {
    const { activate } = await import('../extension.js');

    activate(createMockExtensionContext() as unknown as Parameters<typeof activate>[0]);

    expect(initializeSecurityMock).toHaveBeenCalledTimes(1);
    expect(registerCommandMock).toHaveBeenCalledWith('waveclient.open', expect.any(Function));
    expect(registerWebviewViewProviderMock).toHaveBeenCalledWith(
      'wave-client-view',
      expect.any(Object),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    );
  });

  it('opens the full editor panel when waveclient.open command runs', async () => {
    const { activate } = await import('../extension.js');

    activate(createMockExtensionContext() as unknown as Parameters<typeof activate>[0]);
    expect(registeredOpenCommand).toBeDefined();

    await registeredOpenCommand!();

    // The command opens the full app as an editor-area panel (ViewColumn.One),
    // and wires the interactive MessageHandler to that panel.
    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
    expect(createWebviewPanelMock).toHaveBeenCalledWith(
      'waveClient',
      'Wave Client (Beta)',
      1,
      expect.objectContaining({ retainContextWhenHidden: true })
    );

    const panel = createWebviewPanelMock.mock.results[0]?.value as MockWebviewHost;
    expect(panel.webview.html).toContain('<div id="root"></div>');
    expect(MessageHandlerMock).toHaveBeenCalledWith(panel);
  });

  it('reuses the same panel instance on repeated waveclient.open calls', async () => {
    const { activate } = await import('../extension.js');

    activate(createMockExtensionContext() as unknown as Parameters<typeof activate>[0]);
    expect(registeredOpenCommand).toBeDefined();

    await registeredOpenCommand!();
    await registeredOpenCommand!();

    // Second invocation must reveal the existing panel, not create a new one.
    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
    const panel = createWebviewPanelMock.mock.results[0]?.value as MockWebviewHost;
    expect(panel.reveal).toHaveBeenCalledTimes(1);
    expect(panel.reveal).toHaveBeenCalledWith(1);
  });

  it('surfaces an error notification when opening the panel fails', async () => {
    // Missing webview assets make ensureWebviewAssets (and thus panel creation) throw.
    statMock.mockRejectedValueOnce(new Error('assets boom'));

    const { activate } = await import('../extension.js');

    activate(createMockExtensionContext() as unknown as Parameters<typeof activate>[0]);
    expect(registeredOpenCommand).toBeDefined();

    await registeredOpenCommand!();

    expect(createWebviewPanelMock).not.toHaveBeenCalled();
    expect(showErrorMessageMock).toHaveBeenCalledWith(
      expect.stringContaining('Wave Client failed to open')
    );
  });

  it('renders a launcher in the sidebar and auto-opens the full editor panel', async () => {
    const { activate } = await import('../extension.js');

    activate(createMockExtensionContext() as unknown as Parameters<typeof activate>[0]);
    expect(registeredViewProvider).toBeDefined();

    const webviewView = createMockWebviewView();
    await registeredViewProvider!.resolveWebviewView(webviewView);

    // Sidebar shows the lightweight launcher (button), not the full app (#root).
    expect(webviewView.webview.html).toContain('Open Wave Client');
    expect(webviewView.webview.html).not.toContain('<div id="root"></div>');

    // Resolving the sidebar auto-opens the full editor panel, and the
    // interactive MessageHandler is wired to that panel (not the sidebar view).
    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
    const panel = createWebviewPanelMock.mock.results[0]?.value as MockWebviewHost;
    expect(panel.webview.html).toContain('<div id="root"></div>');
    expect(MessageHandlerMock).toHaveBeenCalledWith(panel);
    expect(MessageHandlerMock).not.toHaveBeenCalledWith(webviewView);
  });

  it('opens the panel from the sidebar launcher button message', async () => {
    const { activate } = await import('../extension.js');

    activate(createMockExtensionContext() as unknown as Parameters<typeof activate>[0]);
    expect(registeredViewProvider).toBeDefined();

    const webviewView = createMockWebviewView();
    await registeredViewProvider!.resolveWebviewView(webviewView);

    // resolve auto-opens once; the launcher button should reuse the same panel.
    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);

    const messageCallback = webviewView.webview.onDidReceiveMessage.mock.calls[0]?.[0] as (
      message: unknown
    ) => Promise<void>;
    expect(messageCallback).toBeDefined();

    await messageCallback({ type: 'openWaveClient' });

    expect(createWebviewPanelMock).toHaveBeenCalledTimes(1);
    const panel = createWebviewPanelMock.mock.results[0]?.value as MockWebviewHost;
    expect(panel.reveal).toHaveBeenCalledWith(1);
  });
});
