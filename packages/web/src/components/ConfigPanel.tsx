import React from 'react';
import { SunIcon, MoonIcon, LibraryIcon, HistoryIcon, ShieldCheckIcon, SettingsIcon, LightbulbIcon, GitBranchIcon, FlaskConicalIcon, Sparkles } from 'lucide-react';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  SecondaryButton,
  CollectionsPane,
  EnvironmentsPane,
  HistoryPane,
  StorePane,
  FlowsPane,
  TestLabPane,
  type Environment,
  type CollectionRequest,
  type Flow,
  type TestSuite,
} from '@wave-client/core';
import { useTheme } from '../App';

interface ConfigPanelProps {
  onRequestSelect: (request: CollectionRequest) => void;
  onEnvSelect: (environment: Environment) => void;
  onStoreSelect: (storeType: 'cookie' | 'auth' | 'proxy' | 'cert' | 'validation') => void;
  onFlowSelect: (flow: Flow) => void;
  onFlowRun?: (flow: Flow) => void;
  onTestSuiteSelect?: (suite: TestSuite) => void;
  onTestSuiteRun?: (suite: TestSuite) => void;
  onSettingsSelect: () => void;
  onImportCollection: (fileName: string, fileContent: string, collectionType: string) => void;
  onExportCollection: (collectionName: string, exportFormat: string) => void;
  onImportEnvironments: (fileName: string, fileContent: string) => void;
  onExportEnvironments: () => void;
  onRetryCollections?: () => void;
  onRetryHistory?: () => void;
  onRetryEnvironments?: () => void;
  onRetryFlows?: () => void;
  onRetryTestSuites?: () => void;
  onActiveTabChange?: (tab: string) => void;
}

const TABS = [
  { key: 'collections', label: 'Collections', icon: <LibraryIcon size={20} /> },
  { key: 'flows', label: 'Flows', icon: <GitBranchIcon size={20} /> },
  { key: 'testlab', label: 'Test Lab', icon: <FlaskConicalIcon size={20} /> },
  { key: 'arena', label: 'Wave Arena', icon: <Sparkles size={20} /> },
  { key: 'history', label: 'History', icon: <HistoryIcon size={20} /> },
  { key: 'environments', label: 'Environments', icon: <SunIcon size={20} /> },
  { key: 'store', label: 'Wave Store', icon: <ShieldCheckIcon size={20} /> },
];

const ConfigPanel: React.FC<ConfigPanelProps> = ({
  onRequestSelect,
  onEnvSelect,
  onStoreSelect,
  onFlowSelect,
  onFlowRun,
  onTestSuiteSelect,
  onTestSuiteRun,
  onSettingsSelect,
  onImportCollection,
  onExportCollection,
  onImportEnvironments,
  onExportEnvironments,
  onRetryCollections,
  onRetryHistory,
  onRetryEnvironments,
  onRetryFlows,
  onRetryTestSuites,
  onActiveTabChange,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = React.useState('collections');

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    onActiveTabChange?.(value);
  };

    const handleThemeToggle = () => {
      console.log('Theme toggle clicked! Current theme:', theme);
      toggleTheme();
    };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        orientation="vertical"
        className="w-full h-full flex flex-row overflow-hidden"
      >
        <div className="flex flex-col gap-2 bg-transparent py-4 px-2 w-16 flex-shrink-0 border-r border-slate-200 dark:border-slate-700">
          <TabsList className="flex flex-col gap-2 bg-transparent py-0 px-0 w-full flex-shrink-0">
            {TABS.map((tab) => (
              <TooltipProvider delayDuration={500} key={tab.key}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-full">
                      <TabsTrigger
                        value={tab.key}
                        className="flex items-center justify-center w-full h-12 text-slate-600 hover:bg-slate-100 hover:text-slate-900 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-600 data-[state=active]:border-l-2 data-[state=active]:border-blue-500 rounded-md transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:data-[state=active]:bg-blue-900/20 dark:data-[state=active]:text-blue-400"
                      >
                        {tab.icon}
                      </TabsTrigger>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="px-2 py-1 text-xs">
                    {tab.label}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </TabsList>
          {/* Settings Button at the bottom */}
          <div className="mt-auto pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
            <SecondaryButton
              variant="ghost"
              onClick={onSettingsSelect}
              icon={<SettingsIcon size={20} />}
              tooltip="Settings"
              className="flex items-center justify-center w-full h-12 text-slate-600 hover:bg-slate-100 hover:text-blue-600 rounded-md transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400"
            />
            <button
                onClick={handleThemeToggle}
              className="flex items-center justify-center w-full h-12 text-slate-600 hover:bg-slate-100 hover:text-blue-600 rounded-md transition-colors dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-blue-400 p-0"
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <LightbulbIcon size={20} /> : <MoonIcon size={20} />}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <TabsContent value="collections" className="h-full overflow-hidden">
            <CollectionsPane
              onRequestSelect={onRequestSelect}
              onImportCollection={onImportCollection}
              onExportCollection={onExportCollection}
              onRetry={onRetryCollections}
            />
          </TabsContent>
          <TabsContent value="flows" className="h-full overflow-hidden">
            <FlowsPane
              onFlowSelect={onFlowSelect}
              onFlowRun={onFlowRun}
              onRetry={onRetryFlows}
            />
          </TabsContent>
          <TabsContent value="testlab" className="h-full overflow-hidden">
            {onTestSuiteSelect && (
              <TestLabPane
                onTestSuiteSelect={onTestSuiteSelect}
                onTestSuiteRun={onTestSuiteRun}
                onRetry={onRetryTestSuites}
              />
            )}
          </TabsContent>
          <TabsContent value="arena" className="h-full overflow-hidden">
            {/* Arena renders in the main right panel for full-width layout */}
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <Sparkles size={32} className="text-blue-500 mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Wave Arena is open in the main panel
              </p>
            </div>
          </TabsContent>
          <TabsContent value="history" className="h-full overflow-hidden">
            <HistoryPane onRequestSelect={onRequestSelect} onRetry={onRetryHistory} />
          </TabsContent>
          <TabsContent value="environments" className="h-full overflow-hidden">
            <EnvironmentsPane
              onEnvSelect={onEnvSelect}
              onImportEnvironments={onImportEnvironments}
              onExportEnvironments={onExportEnvironments}
              onRetry={onRetryEnvironments}
            />
          </TabsContent>
          <TabsContent value="store" className="h-full overflow-hidden">
            <StorePane onStoreSelect={onStoreSelect} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default ConfigPanel;
