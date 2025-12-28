import React, { useState, useEffect, useRef } from 'react';
import ConfigPanel from './ConfigPanel';
import RequestEditor from './RequestEditor';
import {
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
  useAppStateStore,
  formDataToCollectionRequest,
  type Environment,
  type Cookie,
  type Proxy,
  type Cert,
  type Auth,
  type GlobalValidationRule,
  type AppSettings,
} from '@wave-client/core';
import type { RequestFormData } from '@wave-client/core';
import { getVSCodeApi } from './AppWithAdapter';

const App: React.FC = () => {
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | null>(null);
  const [selectedStore, setSelectedStore] = useState<'cookie' | 'auth' | 'proxy' | 'cert' | 'validation' | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const refreshCollections = useAppStateStore((state) => state.refreshCollections);
  const setCollections = useAppStateStore((state) => state.setCollections);
  const updateCollection = useAppStateStore((state) => state.updateCollection);
  const addCollection = useAppStateStore((state) => state.addCollection);
  const setCollectionLoadError = useAppStateStore((state) => state.setCollectionLoadError);
  const refreshEnvironments = useAppStateStore((state) => state.refreshEnvironments);
  const setEnvironments = useAppStateStore((state) => state.setEnvironments);
  const setEnvironmentLoadError = useAppStateStore((state) => state.setEnvironmentLoadError);
  const loadRequestIntoTab = useAppStateStore((state) => state.loadRequestIntoTab);
  const handleHttpResponse = useAppStateStore((state) => state.handleHttpResponse);
  const handleSendRequestAction = useAppStateStore((state) => state.handleSendRequest);
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
  const addHistory = useAppStateStore((state) => state.addHistory);
  const refreshHistory = useAppStateStore((state) => state.refreshHistory);
  const setHistory = useAppStateStore((state) => state.setHistory);
  const setHistoryLoadError = useAppStateStore((state) => state.setHistoryLoadError);
  const environments = useAppStateStore((state) => state.environments);
  const auths = useAppStateStore((state) => state.auths);
  const banner = useAppStateStore((state) => state.banner);
  const clearBanner = useAppStateStore((state) => state.clearBanner);
  const setBannerSuccess = useAppStateStore((state) => state.setBannerSuccess);
  const setBannerError = useAppStateStore((state) => state.setBannerError);
  const setBannerInfo = useAppStateStore((state) => state.setBannerInfo);
  const setBannerWarning = useAppStateStore((state) => state.setBannerWarning);
  const updateTabMetadata = useAppStateStore((state) => state.updateTabMetadata);
  const vsCodeRef = useRef<any>(null);
  const pendingSaveInfo = useRef<{ tabId: string, collectionName: string | undefined, folderPath: string[], requestName: string } | null>(null);

  // Initialize Collections and Environments
  useEffect(() => {
    // Use the shared VS Code API singleton (acquired in AppWithAdapter)
    if (!vsCodeRef.current) {
      vsCodeRef.current = getVSCodeApi();
    }
    if (vsCodeRef.current) {
      refreshEnvironments(vsCodeRef.current);
      refreshCollections(vsCodeRef.current);
      refreshHistory(vsCodeRef.current);
      vsCodeRef.current.postMessage({ type: 'loadCookies' });
      vsCodeRef.current.postMessage({ type: 'loadAuths' });
      vsCodeRef.current.postMessage({ type: 'loadProxies' });
      vsCodeRef.current.postMessage({ type: 'loadCerts' });
      vsCodeRef.current.postMessage({ type: 'loadValidationRules' });
      vsCodeRef.current.postMessage({ type: 'loadSettings' });
    }
  }, []);

  const handleRequestSelect = (request: RequestFormData) => {
    loadRequestIntoTab(request);
    setSelectedEnvironment(null); // Clear environment selection when selecting a request
    setSelectedStore(null); // Clear store selection when selecting a request
  };

  const handleEnvironmentSelect = (environment: Environment) => {
    setSelectedEnvironment(environment);
    setSelectedStore(null); // Clear store selection when selecting an environment
  };

  const handleStoreSelect = (storeType: 'cookie' | 'auth' | 'proxy' | 'cert' | 'validation') => {
    setSelectedStore(storeType);
    setSelectedEnvironment(null); // Clear environment selection when selecting a store
  };

  const handleBackFromEnvironment = () => {
    setSelectedEnvironment(null);
  };

  const handleBackFromStore = () => {
    setSelectedStore(null);
  };

  // Handle sending request for a specific tab
  const handleSendRequest = (tabId: string) => {
    if (vsCodeRef.current) {
      // Add to history using the tab's parsed request
      addHistory(getParsedRequest(tabId), vsCodeRef.current);
      // Set the tab's processing state and send the request
      // handleSendRequest in the store handles setting isProcessing and resolving env/auth
      handleSendRequestAction(vsCodeRef.current, environments, auths, tabId);
    } else {
      console.error('VS Code API is not available.');
    }
  };

  const handleSaveRequest = (request: RequestFormData, saveToCollectionName: string | undefined, folderPath: string[] = [], tabId?: string) => {
    if (tabId) {
      pendingSaveInfo.current = {
        tabId,
        collectionName: saveToCollectionName,
        folderPath,
        requestName: request.name
      };
    }

    const collectionRequest = formDataToCollectionRequest(request);
    //if saveToCollectionName exists in collections, we are updating an existing collection - use filename & collection name from there
    const currentCollections = useAppStateStore.getState().collections;
    const existingCollection = saveToCollectionName && currentCollections.find((collection) => collection.info.name === saveToCollectionName);
    
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
        setErrorMessage(`Request with name "${request.name}" already exists in the selected location.`);
        return;
      }
    }

    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveRequestToCollection',
        data: {
          requestContent: JSON.stringify(collectionRequest, null, 2),
          requestName: request.name,
          collectionFileName: existingCollection ? existingCollection.filename : request.sourceRef.collectionFilename,
          folderPath: folderPath.length > 0 ? folderPath : request.sourceRef.itemPath,
          newCollectionName: existingCollection ? undefined : saveToCollectionName,
        }
      });
    }
  }

  const handleSaveEnvironment = (environment: Environment) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveEnvironment',
        data: {
          environment: JSON.stringify(environment, null, 2)
        }
      });
    }
  };

  const handleSaveCookies = (cookies: Cookie[]) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveCookies',
        data: {
          cookies: JSON.stringify(cookies, null, 2)
        }
      });
    }
  };

  const handleSaveAuths = (auths: Auth[]) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveAuths',
        data: {
          auths: JSON.stringify(auths, null, 2)
        }
      });
    }
  };

  const handleSaveProxies = (proxies: Proxy[]) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveProxies',
        data: {
          proxies: JSON.stringify(proxies, null, 2)
        }
      });
    }
  };

  const handleSaveCerts = (certs: Cert[]) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveCerts',
        data: {
          certs: JSON.stringify(certs, null, 2)
        }
      });
    }
  };

  const handleSaveValidationRules = (rules: GlobalValidationRule[]) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveValidationRules',
        data: {
          rules
        }
      });
    }
  };

  const handleDownloadResponse = (data: string) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
          type: 'downloadResponse',
          data: data
        });
    }
  };

  const handleImportCollection = (fileName: string, fileContent: string, collectionType: string) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'importCollection',
        data: { fileName, fileContent, collectionType }
      });
    }
  };

  const handleExportCollection = (collectionName: string, exportFormat: string) => {
    const currentCollections = useAppStateStore.getState().collections;
    const collection = collectionName && currentCollections.find((c) => c.info.name === collectionName);
    if (vsCodeRef.current && collection) {
      vsCodeRef.current.postMessage({
        type: 'exportCollection',
        data: { fileName: collection.filename, exportFormat }
      });
    }
  };

  const handleImportEnvironments = (fileName: string, fileContent: string) => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'importEnvironments',
        data: { fileName, fileContent }
      });
    }
  };

  const handleExportEnvironments = () => {
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'exportEnvironments'
      });
    }
  };

  const handleSettingsSelect = () => {
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = (updatedSettings: AppSettings) => {
    setSettings(updatedSettings);
    if (vsCodeRef.current) {
      vsCodeRef.current.postMessage({
        type: 'saveSettings',
        data: {
          settings: JSON.stringify(updatedSettings, null, 2)
        }
      });
    }
    setIsSettingsOpen(false);
  };

  useEffect(() => {
    // Listen for messages from the VS Code extension
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'httpResponse') {
        // Use the response's id field to route to the correct tab
        const tabId = message.response?.id;
        if (tabId) {
          handleHttpResponse(tabId, message.response);
        } else {
          // Fallback: route to active tab if no id present
          const activeTabId = useAppStateStore.getState().activeTabId;
          handleHttpResponse(activeTabId, message.response);
        }
      } else if (message.type === 'collectionsLoaded') {
          setCollections(message.collections);
      } else if (message.type === 'collectionUpdated') {
        try {
          const collection = message.collection;
          //if collection does not exist, add it
          // Get current collections from the store to avoid stale closure
          const currentCollections = useAppStateStore.getState().collections;
          const existingCollection = currentCollections.find((c) => c.info.name === collection.info.name);
          
          // Handle pending save tab update
          if (pendingSaveInfo.current) {
            const { tabId, collectionName, folderPath, requestName } = pendingSaveInfo.current;
            // Check if this collection update corresponds to the pending save
            // If collectionName was provided (Save As), it must match
            // If not provided (Save), we assume it matches if the collection filename matches (but we don't have filename in pendingSave easily unless we looked it up)
            // Simpler: if we have a pending save, and we get a collection update, we assume it's related if the collection name matches what we expect.
            
            const targetCollectionName = collectionName || (existingCollection?.info.name);
            
            if (targetCollectionName === collection.info.name) {
                // Update the tab metadata and mark clean
                updateTabMetadata(tabId, {
                    name: requestName,
                    folderPath: folderPath,
                    collectionRef: {
                        collectionFilename: collection.filename,
                        collectionName: collection.info.name,
                        itemPath: folderPath
                    }
                });
                
                // Clear pending save
                pendingSaveInfo.current = null;
            }
          }

          if (!existingCollection) {
            addCollection(collection);
            return;
          }
          updateCollection(collection.info.name, collection);
        } catch (error: any) {
          console.error('Error updating collection:', error);
        }
      } else if (message.type === 'collectionsError') {
        setCollectionLoadError(message.error);
      } else if (message.type === 'environmentsLoaded') {
        setEnvironments(message.environments);
      } else if (message.type === 'environmentsError') {
        setEnvironmentLoadError(message.error);
      } else if (message.type === 'environmentUpdated') {
        try {
          updateEnvironment(message.environment.id, message.environment);
        } catch (error: any) {
          console.error('Error updating environment:', error);
        }
      } else if (message.type === 'cookiesLoaded') {
        setCookies(message.cookies);
      } else if (message.type === 'cookiesError') {
        console.error('Cookies error:', message.error);
      } else if (message.type === 'authsLoaded') {
        setAuths(message.auths);
      } else if (message.type === 'authsError') {
        console.error('Auths error:', message.error);
      } else if (message.type === 'proxiesLoaded') {
        setProxies(message.proxies);
      } else if (message.type === 'proxiesError') {
        console.error('Proxies error:', message.error);
      } else if (message.type === 'certsLoaded') {
        setCerts(message.certs);
      } else if (message.type === 'certsError') {
        console.error('Certs error:', message.error);
      } else if (message.type === 'validationRulesLoaded') {
        setValidationRules(message.rules);
      } else if (message.type === 'validationRulesSaved') {
        setValidationRules(message.rules);
      } else if (message.type === 'validationRulesError') {
        console.error('Validation rules error:', message.error);
      } else if (message.type === 'settingsLoaded') {
        setSettings(message.settings);
      } else if (message.type === 'settingsSaved') {
        // Update settings with the new validation status from the backend
        if (message.settings) {
          setSettings(message.settings);
        }
      } else if (message.type === 'settingsError') {
        console.error('Settings error:', message.error);
      } else if (message.type === 'historyLoaded') {
        setHistory(message.history);
      } else if (message.type === 'historyError') {
        setHistoryLoadError(message.error);
      } else if (message.type === 'bannerSuccess') {
        setBannerSuccess(message.message, message.link, message.timeoutSeconds);
      } else if (message.type === 'bannerError') {
        setBannerError(message.message, message.link, message.timeoutSeconds);
      } else if (message.type === 'bannerInfo') {
        setBannerInfo(message.message, message.link, message.timeoutSeconds);
      } else if (message.type === 'bannerWarning') {
        setBannerWarning(message.message, message.link, message.timeoutSeconds);
      }
    };

    window.addEventListener('message', messageHandler);

    return () => {
      window.removeEventListener('message', messageHandler);
    };
  }, []);

  return (
    <div
      className="min-h-screen h-screen w-screen bg-slate-50 dark:bg-slate-900 grid relative"
      style={{
        display: 'grid',
        gridTemplateColumns: '400px 1fr',
        gridTemplateRows: '1fr',
        gridTemplateAreas: (selectedEnvironment || selectedStore)
          ? `"config environment"`
          : `"config editor"`,
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
          vsCodeApi={vsCodeRef.current}
        />
      </div>

      {selectedEnvironment ? (
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
            <ValidationStoreGrid onBack={handleBackFromStore} onSaveValidationRules={handleSaveValidationRules} />
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
            <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">Settings</DialogTitle>
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
};

export default App;
