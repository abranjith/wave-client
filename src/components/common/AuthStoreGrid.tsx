import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeftIcon, PencilIcon, Trash2Icon, CheckCircleIcon, XCircleIcon, PlusIcon, KeyIcon, UserIcon, ShieldIcon, AlertTriangleIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import AuthWizard from './AuthWizard';
import { Auth, AuthType } from '../../hooks/store/createAuthSlice';

interface AuthStoreGridProps {
  onBack: () => void;
  onSaveAuths: (auths: Auth[]) => void;
}

function isAuthExpired(auth: Auth): boolean {
  if (!auth.expiryDate) return false;
  const expiryDate = new Date(auth.expiryDate);
  const now = new Date();
  return !isNaN(expiryDate.getTime()) && expiryDate <= now;
}

const AuthStoreGrid: React.FC<AuthStoreGridProps> = ({ onBack, onSaveAuths }) => {
  const auths = useAppStateStore((state) => state.auths);
  const addAuth = useAppStateStore((state) => state.addAuth);
  const removeAuth = useAppStateStore((state) => state.removeAuth);
  const updateAuth = useAppStateStore((state) => state.updateAuth);
  const toggleAuthEnabled = useAppStateStore((state) => state.toggleAuthEnabled);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAuth, setEditingAuth] = useState<Auth | undefined>(undefined);
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
    setEditingAuth(undefined);
    setError(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (auth: Auth) => {
    setEditingAuth(auth);
    setError(null);
    setIsDialogOpen(true);
  };

  const handleSave = (auth: Auth) => {
    if (editingAuth) {
      // Update existing
      const result = updateAuth(editingAuth.id, auth);
      if (result.isErr) {
        setError(result.error);
        return;
      }
    } else {
      // Add new
      const result = addAuth(auth);
      if (result.isErr) {
        setError(result.error);
        return;
      }
    }
    setIsDialogOpen(false);
    setEditingAuth(undefined);
    setError(null);
  };

  const handleCancel = () => {
    setIsDialogOpen(false);
    setEditingAuth(undefined);
    setError(null);
  };

  const handleToggle = (id: string) => {
    const result = toggleAuthEnabled(id);
    if (result.isErr) {
      console.error('Failed to toggle auth:', result.error);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Auth Configuration',
      message: 'Are you sure you want to delete this auth configuration?',
      onConfirm: () => {
        const result = removeAuth(id);
        if (result.isErr) {
          console.error('Failed to delete auth:', result.error);
        }
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const getAuthIcon = (type: AuthType) => {
    switch (type) {
      case AuthType.API_KEY:
        return <KeyIcon className="h-4 w-4" />;
      case AuthType.BASIC:
        return <UserIcon className="h-4 w-4" />;
      case AuthType.DIGEST:
        return <ShieldIcon className="h-4 w-4" />;
      default:
        return <KeyIcon className="h-4 w-4" />;
    }
  };

  const getAuthTypeLabel = (type: AuthType) => {
    switch (type) {
      case AuthType.API_KEY:
        return 'API Key';
      case AuthType.BASIC:
        return 'Basic Auth';
      case AuthType.DIGEST:
        return 'Digest Auth';
      default:
        return type;
    }
  };

  const existingNames = auths.map(a => a.name);

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
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Auth Store</h1>
        </div>
      </div>

      {/* Auth Table */}
      <div className="flex-1 overflow-auto p-4">
        {auths.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <KeyIcon className="h-12 w-12 mb-4 opacity-50 mx-auto text-slate-400" />
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">No auth configurations</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Add auth configurations to manage authentication for your requests.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddNew}
                className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add New Auth
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200 dark:border-slate-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-[10%]">
                    Type
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-[20%]">
                    Name
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-[15%]">
                    Expires
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-[35%]">
                    Domain Filters
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700 dark:text-slate-300 w-[20%]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {auths.map((auth) => {
                  const isEnabled = auth.enabled;
                  const isExpired = isAuthExpired(auth);
                  
                  return (
                    <tr
                      key={auth.id}
                      className={`border-b border-gray-100 dark:border-slate-800 hover:bg-gray-50 dark:hover:bg-slate-800/50 ${
                        !isEnabled ? 'opacity-40' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className={`flex items-center gap-2 text-sm ${
                          isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {getAuthIcon(auth.type)}
                          <span>{getAuthTypeLabel(auth.type)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className={`text-sm font-medium ${
                          isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {auth.name}
                          {isExpired && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                              <AlertTriangleIcon className="w-3 h-3 mr-1" />
                              Expired
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className={`text-sm ${
                          isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {auth.expiryDate ? (
                            <span className={isExpired ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                              {new Date(auth.expiryDate).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 italic">Never expires</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs">
                          {auth.domainFilters.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {auth.domainFilters.map((domain, idx) => (
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
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(auth)}
                            className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
                            title="Edit auth"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggle(auth.id)}
                            className={`${
                              isEnabled
                                ? 'text-green-600 hover:text-green-700 hover:border-green-300'
                                : 'text-slate-400 hover:text-slate-600 hover:border-slate-300'
                            }`}
                            title={isEnabled ? 'Disable auth' : 'Enable auth'}
                          >
                            {isEnabled ? (
                              <CheckCircleIcon className="h-4 w-4" />
                            ) : (
                              <XCircleIcon className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(auth.id)}
                            className="text-red-600 hover:text-red-700 hover:border-red-300"
                            title="Delete auth"
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Action Buttons - Beneath the data grid */}
        {auths.length > 0 && (
          <div className="flex justify-start gap-2 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddNew}
              className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add New Auth
            </Button>
          </div>
        )}
      </div>

      {/* Auth Wizard Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAuth ? 'Edit Auth Configuration' : 'Add New Auth Configuration'}
            </DialogTitle>
          </DialogHeader>
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3 mb-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
          <AuthWizard
            auth={editingAuth}
            onSave={handleSave}
            onCancel={handleCancel}
            existingNames={editingAuth ? existingNames.filter(n => n !== editingAuth.name) : existingNames}
          />
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, isOpen: open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDialog.onConfirm}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuthStoreGrid;
