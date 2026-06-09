import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ConfigPanel from '../../components/ConfigPanel';

const toggleThemeMock = vi.fn();

vi.mock('../../App', () => ({
  useTheme: () => ({
    theme: 'light' as const,
    toggleTheme: toggleThemeMock,
  }),
}));

vi.mock('@wave-client/core', async () => {
  const ReactModule = await import('react');

  interface TabsContextValue {
    value?: string;
    onValueChange?: (value: string) => void;
  }

  const TabsContext = ReactModule.createContext<TabsContextValue>({});

  const Tabs = ({ value, onValueChange, children, className }: any) => (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );

  const TabsList = ({ children, className }: any) => <div className={className}>{children}</div>;

  const TabsTrigger = ({
    value,
    onMouseDown,
    children,
    className,
    ...rest
  }: any) => {
    const context = ReactModule.useContext(TabsContext);
    const isActive = context.value === value;

    return (
      <button
        type="button"
        role="tab"
        data-state={isActive ? 'active' : 'inactive'}
        className={className}
        onMouseDown={(event) => {
          onMouseDown?.(event);
          if (!event.defaultPrevented) {
            context.onValueChange?.(value);
          }
        }}
        {...rest}
      >
        {children}
      </button>
    );
  };

  const TabsContent = ({ value, children, className }: any) => {
    const context = ReactModule.useContext(TabsContext);
    if (context.value !== value) {
      return null;
    }
    return <div className={className}>{children}</div>;
  };

  const passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;

  return {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Tooltip: passthrough,
    TooltipProvider: passthrough,
    TooltipTrigger: passthrough,
    TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SecondaryButton: ({ onClick, tooltip }: { onClick?: () => void; tooltip?: string }) => (
      <button type="button" onClick={onClick} aria-label={tooltip || 'secondary-button'}>
        secondary-button
      </button>
    ),
    DocsLinkButton: () => <button type="button">docs-link</button>,
    CollectionsPane: () => <div>collections-pane</div>,
    EnvironmentsPane: () => <div>environments-pane</div>,
    HistoryPane: () => <div>history-pane</div>,
    StorePane: () => <div>store-pane</div>,
    FlowsPane: () => <div>flows-pane</div>,
    TestLabPane: () => <div>testlab-pane</div>,
  };
});

describe('ConfigPanel tab toggle behavior', () => {
  const onActiveTabChange = vi.fn();

  const props = {
    onRequestSelect: vi.fn(),
    onEnvSelect: vi.fn(),
    onStoreSelect: vi.fn(),
    onFlowSelect: vi.fn(),
    onFlowRun: vi.fn(),
    onTestSuiteSelect: vi.fn(),
    onSettingsSelect: vi.fn(),
    onImportCollection: vi.fn(),
    onExportCollection: vi.fn(),
    onImportEnvironments: vi.fn(),
    onExportEnvironments: vi.fn(),
    onRetryCollections: vi.fn(),
    onRetryHistory: vi.fn(),
    onRetryEnvironments: vi.fn(),
    onRetryFlows: vi.fn(),
    onRetryTestSuites: vi.fn(),
    onActiveTabChange,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggles active tab content closed and reopens it on second click', () => {
    render(<ConfigPanel {...props} />);

    expect(screen.getByText('collections-pane')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Collections' }));
    expect(onActiveTabChange).toHaveBeenCalledWith('');
    expect(screen.queryByText('collections-pane')).not.toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Collections' }));
    expect(onActiveTabChange).toHaveBeenCalledWith('collections');
    expect(screen.getByText('collections-pane')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Environments' }));
    expect(onActiveTabChange).toHaveBeenCalledWith('environments');
    expect(screen.getByText('environments-pane')).toBeInTheDocument();
  });
});
