import React, { useState } from 'react';
import { ArrowLeftIcon, PlusIcon, PencilIcon, Trash2Icon, NetworkIcon, XIcon, CheckIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Switch } from '../ui/switch';
import Banner from '../ui/banner';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import { Proxy } from '../../types/collection';
import ProxyWizard from './ProxyWizard';

interface ProxyStoreGridProps {
  onBack: () => void;
  onSaveProxies: (proxies: Proxy[]) => void;
}

const ProxyStoreGrid: React.FC<ProxyStoreGridProps> = ({ onBack, onSaveProxies }) => {
  const proxies = useAppStateStore((state) => state.proxies);
  const addProxy = useAppStateStore((state) => state.addProxy);
  const removeProxy = useAppStateStore((state) => state.removeProxy);
  const updateProxy = useAppStateStore((state) => state.updateProxy);
  const toggleProxyEnabled = useAppStateStore((state) => state.toggleProxyEnabled);

  const isInitialMount = React.useRef(true);
  const lastSavedProxies = React.useRef<string>('');

  React.useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastSavedProxies.current = JSON.stringify(proxies);
      return;
    }

    const currentProxiesString = JSON.stringify(proxies);
    if (currentProxiesString !== lastSavedProxies.current) {
      onSaveProxies(proxies);
      lastSavedProxies.current = currentProxiesString;
    }
  }, [proxies, onSaveProxies]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProxy, setEditingProxy] = useState<Proxy | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const handleAddNew = () => {
    setEditingProxy(undefined);
    setError(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (proxy: Proxy) => {
    setEditingProxy(proxy);
    setError(null);
    setIsDialogOpen(true);
  };

  const handleSave = (proxy: Proxy) => {
    if (editingProxy) {
      // Update existing
      const result = updateProxy(editingProxy.id, proxy);
      if (result.isErr) {
        setError(result.error);
        return;
      }
    } else {
      // Add new
      const result = addProxy(proxy);
      if (result.isErr) {
        setError(result.error);
        return;
      }
    }
    setIsDialogOpen(false);
    setEditingProxy(undefined);
    setError(null);
  };

  const handleCancel = () => {
    setIsDialogOpen(false);
    setEditingProxy(undefined);
    setError(null);
  };

  const handleToggle = (id: string) => {
    const result = toggleProxyEnabled(id);
    if (result.isErr) {
      console.error('Failed to toggle proxy:', result.error);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Proxy Configuration',
      message: 'Are you sure you want to delete this proxy configuration?',
      onConfirm: () => {
        const result = removeProxy(id);
        if (result.isErr) {
          console.error('Failed to delete proxy:', result.error);
        }
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const existingNames = proxies.map(p => p.name);

  return (
    <div className="h-full bg-white dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="text-slate-600 hover:text-slate-700 hover:border-slate-300"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Proxy Store</h1>
        </div>
      </div>

      {/* Proxy Table */}
      <div className="flex-1 overflow-auto p-4">
        {proxies.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <NetworkIcon className="h-12 w-12 mb-4 opacity-50 mx-auto text-slate-400" />
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">No proxy configurations</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Add proxy configurations to route your requests through proxy servers.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddNew}
                className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add New Proxy
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[8%]">Enabled</TableHead>
                  <TableHead className="w-[18%]">Name</TableHead>
                  <TableHead className="w-[27%]">Proxy URL</TableHead>
                  <TableHead className="w-[32%]">Domain Filters</TableHead>
                  <TableHead className="w-[15%]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proxies.map((proxy) => {
                  const isEnabled = proxy.enabled;
                  
                  return (
                    <TableRow
                      key={proxy.id}
                    >
                      <TableCell>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => handleToggle(proxy.id)}
                        />
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div className={`flex items-center gap-2 text-sm font-medium ${
                          isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          <NetworkIcon className="h-4 w-4" />
                          <span>{proxy.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div className={`text-sm ${
                          isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          <span className="font-mono text-xs">{proxy.url}</span>
                          {proxy.userName && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                              Auth
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div className="text-xs">
                          {proxy.domainFilters.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {proxy.domainFilters.map((domain, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-0.5 rounded font-mono ${
                                    isEnabled 
                                      ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                                      : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                                  }`}
                                >
                                  {domain}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 italic">All domains</span>
                          )}
                          {proxy.excludeDomains.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="text-xs text-slate-500">Exclude:</span>
                              {proxy.excludeDomains.map((domain, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-0.5 rounded font-mono ${
                                    isEnabled 
                                      ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                                      : 'bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                                  }`}
                                >
                                  {domain}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <SecondaryButton
                            size="sm"
                            onClick={() => handleEdit(proxy)}
                            colorTheme="main"
                            icon={<PencilIcon />}
                            tooltip="Edit proxy"
                          />
                          <SecondaryButton
                            size="sm"
                            onClick={() => handleDelete(proxy.id)}
                            colorTheme="error"
                            icon={<Trash2Icon />}
                            tooltip="Delete proxy"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Action Buttons - Beneath the data grid */}
        {proxies.length > 0 && (
          <div className="flex justify-start gap-2 pt-3">
            <SecondaryButton
              size="sm"
              onClick={handleAddNew}
              colorTheme="main"
              icon={<PlusIcon />}
              text="Add New Proxy"
            />
          </div>
        )}
      </div>

      {/* Proxy Wizard Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
              {editingProxy ? 'Edit Proxy Configuration' : 'Add New Proxy Configuration'}
            </DialogTitle>
          </DialogHeader>
          {error && 
          (
            <Banner
            message={error}
            messageType="error"
            onClose={() => setError(null)}
            />
          )}
          <ProxyWizard
            proxy={editingProxy}
            onSave={handleSave}
            onCancel={handleCancel}
            existingNames={editingProxy ? existingNames.filter(n => n !== editingProxy.name) : existingNames}
          />
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, isOpen: open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <SecondaryButton
              onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
              colorTheme="warning"
              icon={<XIcon />}
              text="Cancel"
            />
            <PrimaryButton
              onClick={confirmDialog.onConfirm}
              colorTheme="error"
              icon={<CheckIcon />}
              text="Confirm"
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProxyStoreGrid;
