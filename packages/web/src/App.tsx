/**
 * Wave Client Web Application
 *
 * Main entry point for the standalone web version.
 * Uses the web platform adapter with server-based persistence.
 */

import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import ConfigPanel from './components/ConfigPanel';
import RequestEditor from './components/RequestEditor';
import {
  AdapterProvider,
  EnvironmentGrid,
  CookieStoreGrid,
  AuthStoreGrid,
  ProxyStoreGrid,
  CertStoreGrid,
  ValidationStoreGrid,
  SettingsWizard,
  Banner,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  FlowCanvas,
  useAppStateStore,
  formDataToCollectionRequest,
  useStorageAdapter,
  useHttpAdapter,
  useFileAdapter,
  useNotificationAdapter,
  useAdapterEvent,
  type Environment,
  type Cookie,
  type Proxy,
  type Cert,
  type Auth,
  type GlobalValidationRule,
  type HttpRequestConfig,
  type BannerEvent,
  type RequestFormData,
  type Flow,
} from '@wave-client/core';
import { createWebAdapter, checkServerHealth } from './adapters';

// Create the web adapter instance
const webAdapter = createWebAdapter();

// Theme Context
interface ThemeContextType {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeContext.Provider');
  }
  return context;
};

/**
 * Server connection status component
 */
function ServerStatus() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      const healthy = await checkServerHealth();
      setIsConnected(healthy);
    };

    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  if (isConnected === null) {
    return null;
  }

  if (!isConnected) {
    return (
      <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50">
        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
        <span className="text-sm font-medium">
          Server disconnected. Run: <code className="bg-red-600 px-1 rounded">pnpm dev:server</code>
        </span>
      </div>
    );
  }

  return null;
}

/**
 * Main Wave Client UI component
 */
function WaveClientUI() {
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | null>(null);
  const [selectedStore, setSelectedStore] = useState<
    'cookie' | 'auth' | 'proxy' | 'cert' | 'validation' | null
  >(null);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Adapter hooks
  const storage = useStorageAdapter();
  const http = useHttpAdapter();
  const file = useFileAdapter();
  const notification = useNotificationAdapter();

  // Store selectors
  const setIsCollectionsLoading = useAppStateStore((state) => state.setIsCollectionsLoading);
  const setCollections = useAppStateStore((state) => state.setCollections);
  const updateCollection = useAppStateStore((state) => state.updateCollection);
  const addCollection = useAppStateStore((state) => state.addCollection);
  const setCollectionLoadError = useAppStateStore((state) => state.setCollectionLoadError);
  const setIsEnvironmentsLoading = useAppStateStore((state) => state.setIsEnvironmentsLoading);
  const setEnvironments = useAppStateStore((state) => state.setEnvironments);
  const setEnvironmentLoadError = useAppStateStore((state) => state.setEnvironmentLoadError);
  const loadRequestIntoTab = useAppStateStore((state) => state.loadRequestIntoTab);
  const handleHttpResponse = useAppStateStore((state) => state.handleHttpResponse);
  const buildHttpRequest = useAppStateStore((state) => (state as any).buildHttpRequest);
  const setTabProcessingState = useAppStateStore((state) => (state as any).setTabProcessingState);
  const updateEnvironment = useAppStateStore((state) => state.updateEnvironment);
  const setErrorMessage = useAppStateStore((state) => state.setErrorMessage);
  const setCookies = useAppStateStore((state) => state.setCookies);
  const setAuths = useAppStateStore((state) => state.setAuths);
  const setProxies = useAppStateStore((state) => state.setProxies);
  const setCerts = useAppStateStore((state) => state.setCerts);
  const setValidationRules = useAppStateStore((state) => state.setValidationRules);
  const settings = useAppStateStore((state) => state.settings);
  const setSettings = useAppStateStore((state) => state.setSettings);
  const getParsedRequest = useAppStateStore((state) => state.getParsedRequest);
  const setIsHistoryLoading = useAppStateStore((state) => state.setIsHistoryLoading);
  const setHistory = useAppStateStore((state) => state.setHistory);
  const setHistoryLoadError = useAppStateStore((state) => state.setHistoryLoadError);
  const environments = useAppStateStore((state) => state.environments);
  const collections = useAppStateStore((state) => state.collections);
  const auths = useAppStateStore((state) => state.auths);
  const banner = useAppStateStore((state) => state.banner);
  const clearBanner = useAppStateStore((state) => state.clearBanner);
  const setBannerSuccess = useAppStateStore((state) => state.setBannerSuccess);
  const setBannerError = useAppStateStore((state) => state.setBannerError);
  const setBannerInfo = useAppStateStore((state) => state.setBannerInfo);
  const setBannerWarning = useAppStateStore((state) => state.setBannerWarning);
  const updateTabMetadata = useAppStateStore((state) => state.updateTabMetadata);
  // Flows state
  const flows = useAppStateStore((state) => state.flows);
  const setFlows = useAppStateStore((state) => state.setFlows);
  const setIsFlowsLoading = useAppStateStore((state) => state.setIsFlowsLoading);
  const setFlowsLoadError = useAppStateStore((state) => state.setFlowsLoadError);
  const updateFlow = useAppStateStore((state) => state.updateFlow);

  const pendingSaveInfo = useRef<{
    tabId: string;
    collectionName: string | undefined;
    folderPath: string[];
    requestName: string;
  } | null>(null);

  // Subscribe to adapter push events for banners
  useAdapterEvent('banner', (event: BannerEvent) => {
    switch (event.type) {
      case 'success':
        setBannerSuccess(event.message, event.link, event.timeoutSeconds);
        break;
      case 'error':
        setBannerError(event.message, event.link, event.timeoutSeconds);
        break;
      case 'info':
        setBannerInfo(event.message, event.link, event.timeoutSeconds);
        break;
      case 'warning':
        setBannerWarning(event.message, event.link, event.timeoutSeconds);
        break;
    }
  });

  // Initialize data on mount
  useEffect(() => {
    async function initializeData() {
      // Load collections
      setIsCollectionsLoading(true);
      const collectionsResult = await storage.loadCollections();
      if (collectionsResult.isOk) {
        setCollections(collectionsResult.value);
      } else {
        setCollectionLoadError(collectionsResult.error);
      }
      setIsCollectionsLoading(false);

      // Load environments
      setIsEnvironmentsLoading(true);
      const environmentsResult = await storage.loadEnvironments();
      if (environmentsResult.isOk) {
        setEnvironments(environmentsResult.value);
      } else {
        setEnvironmentLoadError(environmentsResult.error);
      }
      setIsEnvironmentsLoading(false);

      // Load history
      setIsHistoryLoading(true);
      const historyResult = await storage.loadHistory();
      if (historyResult.isOk) {
        setHistory(historyResult.value);
      } else {
        setHistoryLoadError(historyResult.error);
      }
      setIsHistoryLoading(false);

      // Load cookies (no loading state for these)
      const cookiesResult = await storage.loadCookies();
      if (cookiesResult.isOk) {
        setCookies(cookiesResult.value);
      }

      // Load auths
      const authsResult = await storage.loadAuths();
      if (authsResult.isOk) {
        setAuths(authsResult.value);
      }

      // Load proxies
      const proxiesResult = await storage.loadProxies();
      if (proxiesResult.isOk) {
        setProxies(proxiesResult.value);
      }

      // Load certs
      const certsResult = await storage.loadCerts();
      if (certsResult.isOk) {
        setCerts(certsResult.value);
      }

      // Load validation rules
      const validationRulesResult = await storage.loadValidationRules();
      if (validationRulesResult.isOk) {
        setValidationRules(validationRulesResult.value as any);
      }

      // Load settings
      const settingsResult = await storage.loadSettings();
      if (settingsResult.isOk) {
        setSettings(settingsResult.value as any);
      }

      // Load flows
      setIsFlowsLoading(true);
      const flowsResult = await storage.loadFlows();
      if (flowsResult.isOk) {
        setFlows(flowsResult.value);
      } else {
        setFlowsLoadError(flowsResult.error);
      }
      setIsFlowsLoading(false);
    }

    initializeData();
  }, [storage]);

  const handleRetryCollections = async () => {
    setIsCollectionsLoading(true);
    const collectionsResult = await storage.loadCollections();
    if (collectionsResult.isOk) {
      setCollections(collectionsResult.value);
    } else {
      setCollectionLoadError(collectionsResult.error);
    }
    setIsCollectionsLoading(false);
  };

  const handleRetryHistory = async () => {
    setIsHistoryLoading(true);
    const historyResult = await storage.loadHistory();
    if (historyResult.isOk) {
      setHistory(historyResult.value);
    } else {
      setHistoryLoadError(historyResult.error);
    }
    setIsHistoryLoading(false);
  };

  const handleRetryFlows = async () => {
    setIsFlowsLoading(true);
    const flowsResult = await storage.loadFlows();
    if (flowsResult.isOk) {
      setFlows(flowsResult.value);
    } else {
      setFlowsLoadError(flowsResult.error);
    }
    setIsFlowsLoading(false);
  };

  const handleRetryEnvironments = async () => {
    setIsEnvironmentsLoading(true);
    const environmentsResult = await storage.loadEnvironments();
    if (environmentsResult.isOk) {
      setEnvironments(environmentsResult.value);
    } else {
      setEnvironmentLoadError(environmentsResult.error);
    }
    setIsEnvironmentsLoading(false);
  };

  const handleRequestSelect = (request: RequestFormData) => {
    loadRequestIntoTab(request);
    setSelectedEnvironment(null);
    setSelectedStore(null);
    setSelectedFlow(null);
  };

  const handleEnvironmentSelect = (environment: Environment) => {
    setSelectedEnvironment(environment);
    setSelectedStore(null);
    setSelectedFlow(null);
  };

  const handleStoreSelect = (storeType: 'cookie' | 'auth' | 'proxy' | 'cert' | 'validation') => {
    setSelectedStore(storeType);
    setSelectedEnvironment(null);
    setSelectedFlow(null);
  };

  const handleFlowSelect = (flow: Flow) => {
    setSelectedFlow(flow);
    setSelectedEnvironment(null);
    setSelectedStore(null);
  };

const handleFlowSave = useCallback(async (flow: Flow) => {
    const result = await storage.saveFlow(flow);
    if (result.isOk) {
      const savedFlow = result.value;
      setSelectedFlow(savedFlow);
      // Update flows in the store
      const existingFlow = flows.find(f => f.id === savedFlow.id);
      if (existingFlow) {
        updateFlow(savedFlow.id, savedFlow);
      } else {
        // Reload all flows if it's a new flow
        const flowsResult = await storage.loadFlows();
        if (flowsResult.isOk) {
          setFlows(flowsResult.value);
        }
      }
      notification.showNotification('success', 'Flow saved');
    } else {
      notification.showNotification('error', result.error);
    }
  }, [storage, notification, flows, updateFlow, setFlows]);

  const handleBackFromEnvironment = () => {
    setSelectedEnvironment(null);
  };

  const handleBackFromStore = () => {
    setSelectedStore(null);
  };

  // Handle sending request for a specific tab
  const handleSendRequest = async (tabId: string) => {
    const parsedRequest = getParsedRequest(tabId);

    // Save to history
    await storage.saveRequestToHistory(parsedRequest);

    // Build HTTP request using core slice helper
    setTabProcessingState(tabId, true);
    const buildResult = await buildHttpRequest(environments, auths, tabId);

    if (!buildResult.success) {
      setErrorMessage(buildResult.error, tabId);
      setTabProcessingState(tabId, false);
      return;
    }

    // Execute request via HTTP adapter
    const httpConfig: HttpRequestConfig = {
      id: buildResult.tabId,
      method: buildResult.request.method,
      url: buildResult.request.url,
      headers: buildResult.request.headers,
      params: buildResult.request.params || [],
      body: buildResult.request.body,
      auth: buildResult.request.auth,
      envVars: buildResult.request.envVars || {},
      proxy: buildResult.request.proxy,
      cert: buildResult.request.cert,
      timeout: buildResult.request.timeout,
      validation: buildResult.validation,
    };

    const response = await http.executeRequest(httpConfig);

    if (response.isOk) {
      handleHttpResponse(tabId, response.value);

      // Update cookies if the response includes new cookies
      if (response.value.cookies && response.value.cookies.length > 0) {
        const cookiesResult = await storage.loadCookies();
        if (cookiesResult.isOk) {
          setCookies(cookiesResult.value);
        }
      }
    } else {
      setErrorMessage(response.error, tabId);
      setTabProcessingState(tabId, false);
    }
  };

  const handleSaveRequest = async (
    request: RequestFormData,
    saveToCollectionName: string | undefined,
    folderPath: string[] = [],
    tabId?: string
  ) => {
    if (tabId) {
      pendingSaveInfo.current = {
        tabId,
        collectionName: saveToCollectionName,
        folderPath,
        requestName: request.name,
      };
    }

    const collectionRequest = formDataToCollectionRequest(request);
    const currentCollections = useAppStateStore.getState().collections;
    const existingCollection =
      saveToCollectionName &&
      currentCollections.find((collection) => collection.info.name === saveToCollectionName);

    if (existingCollection) {
      // Check for duplicate request name in the target folder
      let items = existingCollection.item;
      for (const folder of folderPath) {
        const folderItem = items.find((item) => item.name === folder && item.item);
        if (folderItem && folderItem.item) {
          items = folderItem.item;
        }
      }
      const duplicateRequest = items.find((item) => item.name === request.name && item.request);
      if (duplicateRequest) {
        setErrorMessage(
          `Request with name "${request.name}" already exists in the selected location.`
        );
        return;
      }
    }

    const collectionFileName = existingCollection
      ? existingCollection.filename
      : request.sourceRef.collectionFilename;
    const itemPath = folderPath.length > 0 ? folderPath : request.sourceRef.itemPath;

    if (!collectionFileName) {
      notification.showNotification('error', 'Invalid collection filename');
      return;
    }

    // Wrap the collection request as a CollectionItem
    const collectionItem: any = {
      id: request.id || crypto.randomUUID(),
      name: request.name,
      request: collectionRequest,
    };

    const result = await storage.saveRequestToCollection(
      collectionFileName,
      itemPath,
      collectionItem
    );

    if (result.isOk) {
      const collection = result.value;
      const existingColl = currentCollections.find((c) => c.info.name === collection.info.name);
      if (existingColl) {
        updateCollection(collection.info.name, collection);
      } else {
        addCollection(collection);
      }

      // Update tab metadata if this was a save from a tab
      if (pendingSaveInfo.current && pendingSaveInfo.current.tabId === tabId) {
        const saveInfo = pendingSaveInfo.current;
        updateTabMetadata(saveInfo.tabId, {
          folderPath: [
            collection.info.name,
            ...(saveInfo.folderPath || []),
            saveInfo.requestName,
          ],
          name: saveInfo.requestName,
        });
        pendingSaveInfo.current = null;
      }

      notification.showNotification('success', 'Request saved successfully');
    } else {
      notification.showNotification('error', result.error);
    }
  };

  const handleDownloadResponse = async (data: string) => {
    // Use file adapter to download
    await file.writeFile('response.json', data);
  };

  const handleSaveEnvironment = async (environment: Environment) => {
    const result = await storage.saveEnvironment(environment);
    if (result.isOk) {
      updateEnvironment(environment.id, environment);
      notification.showNotification('success', 'Environment saved successfully');
    } else {
      notification.showNotification('error', result.error);
    }
  };

  const handleSaveCookies = async (cookies: Cookie[]) => {
    const result = await storage.saveCookies(cookies);
    if (result.isOk) {
      setCookies(cookies);
      notification.showNotification('success', 'Cookies saved successfully');
    } else {
      notification.showNotification('error', result.error);
    }
  };

  const handleSaveAuths = async (auths: Auth[]) => {
    const result = await storage.saveAuths(auths);
    if (result.isOk) {
      setAuths(auths);
      notification.showNotification('success', 'Auth configurations saved successfully');
    } else {
      notification.showNotification('error', result.error);
    }
  };

  const handleSaveProxies = async (proxies: Proxy[]) => {
    const result = await storage.saveProxies(proxies);
    if (result.isOk) {
      setProxies(proxies);
      notification.showNotification('success', 'Proxy configurations saved successfully');
    } else {
      notification.showNotification('error', result.error);
    }
  };

  const handleSaveCerts = async (certs: Cert[]) => {
    const result = await storage.saveCerts(certs);
    if (result.isOk) {
      setCerts(certs);
      notification.showNotification('success', 'Certificate configurations saved successfully');
    } else {
      notification.showNotification('error', result.error);
    }
  };

  const handleSaveValidationRules = async (rules: GlobalValidationRule[]) => {
    const result = await storage.saveValidationRules(rules as any);
    if (result.isOk) {
      setValidationRules(rules as any);
      notification.showNotification('success', 'Validation rules saved successfully');
    } else {
      notification.showNotification('error', result.error);
    }
  };

  const handleImportCollection = async (
    fileName: string,
    fileContent: string,
    _collectionType: string
  ) => {
    const result = await storage.importCollection(fileName, fileContent);
    if (result.isOk) {
      // Reload collections
      const collectionsResult = await storage.loadCollections();
      if (collectionsResult.isOk) {
        setCollections(collectionsResult.value);
      }
      notification.showNotification('success', 'Collection imported successfully');
    } else {
      notification.showNotification('error', result.error);
    }
  };

  const handleExportCollection = async (collectionName: string, _exportFormat: string) => {
    const currentCollections = useAppStateStore.getState().collections;
    const collection = currentCollections.find((c) => c.info.name === collectionName);

    if (!collection || !collection.filename) {
      notification.showNotification('error', 'Collection not found');
      return;
    }

    const result = await storage.exportCollection(collection.filename);
    if (result.isOk) {
      notification.showNotification('success', `Collection exported: ${result.value.fileName}`);
    } else {
      if (result.error !== 'Export cancelled by user') {
        notification.showNotification('error', result.error);
      }
    }
  };

  const handleImportEnvironments = async (_fileName: string, fileContent: string) => {
    const result = await storage.importEnvironments(fileContent);
    if (result.isOk) {
      setEnvironments(result.value);
      notification.showNotification('success', 'Environments imported successfully');
    } else {
      notification.showNotification('error', result.error);
    }
  };

  const handleExportEnvironments = async () => {
    const result = await storage.exportEnvironments();
    if (result.isOk) {
      notification.showNotification('success', `Environments exported: ${result.value.fileName}`);
    } else {
      if (result.error !== 'Export cancelled by user') {
        notification.showNotification('error', result.error);
      }
    }
  };

  const handleSettingsSelect = () => {
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = async (updatedSettings: Parameters<typeof setSettings>[0]) => {
    const result = await storage.saveSettings(updatedSettings as any);
    if (result.isOk) {
      setSettings(updatedSettings);
      notification.showNotification('success', 'Settings saved successfully');
      setIsSettingsOpen(false);
    } else {
      notification.showNotification('error', result.error);
    }
  };

  return (
    <div
      className="min-h-screen h-screen w-screen bg-background text-foreground grid relative transition-colors"
      style={{
        display: 'grid',
        gridTemplateColumns: '400px 1fr',
        gridTemplateRows: '1fr',
        gridTemplateAreas:
          selectedEnvironment || selectedStore || selectedFlow ? `"config environment"` : `"config editor"`,
        height: '100vh',
      }}
    >
      {/* Global Banner - Fixed at top, centered, overlayed */}
      {banner.message && banner.messageType && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-auto max-w-2xl min-w-96 shadow-2xl rounded-lg overflow-hidden bg-white dark:bg-slate-800">
          <Banner
            message={banner.message}
            messageType={banner.messageType}
            link={banner.link}
            timeoutSeconds={banner.timeoutSeconds}
            onClose={clearBanner}
          />
        </div>
      )}

      {/* Server Status Indicator */}
      <ServerStatus />

      {/* Left Sidebar with Tabs */}
      <div style={{ gridArea: 'config' }} className="overflow-hidden">
        <ConfigPanel
          onRequestSelect={handleRequestSelect}
          onEnvSelect={handleEnvironmentSelect}
          onStoreSelect={handleStoreSelect}
          onSettingsSelect={handleSettingsSelect}
          onImportCollection={handleImportCollection}
          onExportCollection={handleExportCollection}
          onImportEnvironments={handleImportEnvironments}
          onExportEnvironments={handleExportEnvironments}
          onRetryCollections={handleRetryCollections}
          onRetryHistory={handleRetryHistory}
          onRetryEnvironments={handleRetryEnvironments}
          onRetryFlows={handleRetryFlows}
          onFlowSelect={handleFlowSelect}
        />
      </div>

      {selectedFlow ? (
        /* Flow Canvas - Full Height */
        <div style={{ gridArea: 'environment' }} className="overflow-hidden">
          <FlowCanvas
            flow={selectedFlow}
            collections={collections}
            environments={environments}
            auths={auths}
            onFlowChange={setSelectedFlow}
            onSave={handleFlowSave}
          />
        </div>
      ) : selectedEnvironment ? (
        /* Environment Grid - Full Height */
        <div style={{ gridArea: 'environment' }} className="overflow-hidden">
          <EnvironmentGrid
            environment={selectedEnvironment}
            onBack={handleBackFromEnvironment}
            onSaveEnvironment={handleSaveEnvironment}
          />
        </div>
      ) : selectedStore ? (
        /* Store Grid - Full Height */
        <div style={{ gridArea: 'environment' }} className="overflow-hidden">
          {selectedStore === 'cookie' ? (
            <CookieStoreGrid onBack={handleBackFromStore} onSaveCookies={handleSaveCookies} />
          ) : selectedStore === 'auth' ? (
            <AuthStoreGrid onBack={handleBackFromStore} onSaveAuths={handleSaveAuths} />
          ) : selectedStore === 'proxy' ? (
            <ProxyStoreGrid onBack={handleBackFromStore} onSaveProxies={handleSaveProxies} />
          ) : selectedStore === 'validation' ? (
            <ValidationStoreGrid
              onBack={handleBackFromStore}
              onSaveValidationRules={handleSaveValidationRules}
            />
          ) : (
            <CertStoreGrid onBack={handleBackFromStore} onSaveCerts={handleSaveCerts} />
          )}
        </div>
      ) : (
        /* Request Editor with Tabs */
        <div style={{ gridArea: 'editor' }} className="overflow-hidden">
          <RequestEditor
            onSendRequest={handleSendRequest}
            onSaveRequest={handleSaveRequest}
            onDownloadResponse={handleDownloadResponse}
          />
        </div>
      )}

      {/* Settings Modal */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
              Settings
            </DialogTitle>
          </DialogHeader>
          <SettingsWizard
            settings={settings}
            onSave={handleSaveSettings}
            onCancel={() => setIsSettingsOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Main App component with adapter provider
 */
function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  useEffect(() => {
    // Ensure we start in light mode and do not inherit browser/system theme
    // Force a clean light default (avoid inheriting browser/system dark)
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');
    const root = document.getElementById('root');
    root?.classList.remove('dark');
  }, []);

  useEffect(() => {
    const isDark = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    document.body.classList.toggle('dark', isDark);
    const root = document.getElementById('root');
    root?.classList.toggle('dark', isDark);
  }, [theme]);

  return (
    <AdapterProvider adapter={webAdapter}>
      <ThemeContext.Provider value={{ theme, toggleTheme }}>
        <WaveClientUI />
      </ThemeContext.Provider>
    </AdapterProvider>
  );
}

export default App;
