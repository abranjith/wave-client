import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeftIcon, PencilIcon, Trash2Icon, SaveIcon, XIcon, PlusIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Cookie } from '../../types/collection';
import useAppStateStore from '../../hooks/store/useAppStateStore';

interface CookieStoreGridProps {
  onBack: () => void;
  onSaveCookies: (cookies: Cookie[]) => void;
}

interface EditingCookie {
  originalId: string | null; // null for new cookies
  domain: string;
  path: string;
  name: string;
  value: string;
  expires: string;
  httpOnly: boolean;
  secure: boolean;
}

const CookieStoreGrid: React.FC<CookieStoreGridProps> = ({ onBack, onSaveCookies }) => {
  const cookies = useAppStateStore((state) => state.cookies);
  const addCookie = useAppStateStore((state) => state.addCookie);
  const updateCookie = useAppStateStore((state) => state.updateCookie);
  const removeCookie = useAppStateStore((state) => state.removeCookie);
  const toggleCookieEnabled = useAppStateStore((state) => state.toggleCookieEnabled);
  const clearAllCookies = useAppStateStore((state) => state.clearAllCookies);

  const isInitialMount = useRef(true);
  const lastSavedCookies = useRef<string>('');

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastSavedCookies.current = JSON.stringify(cookies);
      return;
    }

    const currentCookiesString = JSON.stringify(cookies);
    if (currentCookiesString !== lastSavedCookies.current) {
      const now = new Date();
      const expiredCookies = cookies.filter(cookie => {
        if (!cookie.expires || cookie.expires === 'Session') return false;
        const expiryDate = new Date(cookie.expires);
        return !isNaN(expiryDate.getTime()) && expiryDate <= now;
      });

      if (expiredCookies.length > 0) {
        expiredCookies.forEach(c => removeCookie(c.id));
        return;
      }

      onSaveCookies(cookies);
      lastSavedCookies.current = currentCookiesString;
    }
  }, [cookies, removeCookie, onSaveCookies]);

  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<EditingCookie | null>(null);
  const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

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

  const startEditing = (cookie: Cookie) => {
    setEditingRow(cookie.id);
    setEditingData({
      originalId: cookie.id,
      domain: cookie.domain,
      path: cookie.path,
      name: cookie.name,
      value: cookie.value,
      expires: cookie.expires || '',
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
    });
    setFieldError(null);
  };

  const startAddingNew = () => {
    setIsAddingNew(true);
    setEditingRow('__new__');
    setEditingData({
      originalId: null,
      domain: '',
      path: '/',
      name: '',
      value: '',
      expires: '',
      httpOnly: false,
      secure: false,
    });
    setFieldError(null);
  };

  const cancelEditing = () => {
    setEditingRow(null);
    setEditingData(null);
    setIsAddingNew(false);
    setFieldError(null);
  };

  const saveEditing = () => {
    if (!editingData) return;

    // Validation
    if (!editingData.domain.trim()) {
      setFieldError('Domain is required');
      return;
    }
    if (!editingData.name.trim()) {
      setFieldError('Name is required');
      return;
    }

    if (isAddingNew) {
      // Add new cookie
      const newCookie: Cookie = {
        id: `cookie-${crypto.randomUUID()}`,
        domain: editingData.domain.trim(),
        path: editingData.path.trim() || '/',
        name: editingData.name.trim(),
        value: editingData.value,
        expires: editingData.expires || undefined,
        httpOnly: editingData.httpOnly,
        secure: editingData.secure,
        enabled: true,
      };
      addCookie(newCookie);
    } else if (editingData.originalId) {
      // Update existing cookie
      updateCookie(editingData.originalId, {
        domain: editingData.domain.trim(),
        path: editingData.path.trim() || '/',
        name: editingData.name.trim(),
        value: editingData.value,
        expires: editingData.expires || undefined,
        httpOnly: editingData.httpOnly,
        secure: editingData.secure,
      });
    }

    cancelEditing();
  };

  const handleClearAll = () => {
    if (cookies.length > 0) {
      setConfirmDialog({
        isOpen: true,
        title: 'Clear All Cookies',
        message: `Are you sure you want to clear all ${cookies.length} cookie(s)?`,
        onConfirm: () => {
          clearAllCookies();
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        },
      });
    }
  };

  const enabledCount = cookies.filter((c) => c.enabled).length;

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
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Cookie Store</h1>
        </div>
      </div>

      {/* Cookies Table */}
      <div className="flex-1 overflow-auto p-4">
        {cookies.length === 0 && !isAddingNew ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">No cookies</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Add cookies to manage them for your requests.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={startAddingNew}
                className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Cookie
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[6%]">Enabled</TableHead>
                  <TableHead className="w-[12%]">Domain</TableHead>
                  <TableHead className="w-[8%]">Path</TableHead>
                  <TableHead className="w-[12%]">Name</TableHead>
                  <TableHead className="w-[15%]">Value</TableHead>
                  <TableHead className="w-[12%]">Expires</TableHead>
                  <TableHead className="w-[7%]">HttpOnly</TableHead>
                  <TableHead className="w-[7%]">Secure</TableHead>
                  <TableHead className="w-[12%]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cookies.map((cookie, index) => {
                  const isEnabled = cookie.enabled;
                  const isEditing = editingRow === cookie.id;

                  if (isEditing && editingData) {
                    return (
                      <TableRow
                        key={`${cookie.id}-${index}`}
                        className="bg-blue-50 dark:bg-blue-900/20"
                      >
                        <TableCell></TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            value={editingData.domain}
                            onChange={(e) => {
                              setEditingData({ ...editingData, domain: e.target.value });
                              if (fieldError) setFieldError(null);
                            }}
                            className="font-mono text-sm text-slate-800 dark:text-slate-200"
                            placeholder="example.com"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            value={editingData.path}
                            onChange={(e) => setEditingData({ ...editingData, path: e.target.value })}
                            className="font-mono text-sm text-slate-800 dark:text-slate-200"
                            placeholder="/"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            value={editingData.name}
                            onChange={(e) => {
                              setEditingData({ ...editingData, name: e.target.value });
                              if (fieldError) setFieldError(null);
                            }}
                            className="font-mono text-sm text-slate-800 dark:text-slate-200"
                            placeholder="cookieName"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            value={editingData.value}
                            onChange={(e) => setEditingData({ ...editingData, value: e.target.value })}
                            className="font-mono text-sm text-slate-800 dark:text-slate-200"
                            placeholder="cookieValue"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            value={editingData.expires}
                            onChange={(e) => setEditingData({ ...editingData, expires: e.target.value })}
                            className="text-sm text-slate-800 dark:text-slate-200"
                            placeholder="Session"
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={editingData.httpOnly}
                            onCheckedChange={(checked) => setEditingData({ ...editingData, httpOnly: checked })}
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={editingData.secure}
                            onCheckedChange={(checked) => setEditingData({ ...editingData, secure: checked })}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={saveEditing}
                              className="text-green-600 hover:text-green-700 hover:border-green-300"
                              title="Save changes"
                            >
                              <SaveIcon className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={cancelEditing}
                              className="text-red-600 hover:text-red-700 hover:border-red-300"
                              title="Cancel editing"
                            >
                              <XIcon className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow
                      key={`${cookie.id}-${index}`}
                    >
                      <TableCell>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => toggleCookieEnabled(cookie.id)}
                          disabled={editingRow !== null}
                        />
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div
                          className={`font-mono text-sm break-words ${
                            isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {cookie.domain}
                        </div>
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div
                          className={`font-mono text-sm break-words ${
                            isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {cookie.path}
                        </div>
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div
                          className={`font-mono text-sm font-medium break-words ${
                            isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {cookie.name}
                        </div>
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div
                          className={`font-mono text-sm break-words ${
                            isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {cookie.value}
                        </div>
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div
                          className={`text-sm break-words ${
                            isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {cookie.expires || 'Session'}
                        </div>
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div
                          className={`text-sm ${
                            isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {cookie.httpOnly ? '✓' : '—'}
                        </div>
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div
                          className={`text-sm ${
                            isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {cookie.secure ? '✓' : '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditing(cookie)}
                            className="text-blue-600 hover:text-blue-700 hover:border-blue-300"
                            title="Edit cookie"
                            disabled={editingRow !== null}
                          >
                            <PencilIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete the cookie "${cookie.name}"?`)) {
                                removeCookie(cookie.id);
                              }
                            }}
                            className="text-red-600 hover:text-red-700 hover:border-red-300"
                            title="Delete cookie"
                            disabled={editingRow !== null}
                          >
                            <Trash2Icon className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* New Cookie Row */}
                {isAddingNew && editingData && (
                  <TableRow className="bg-blue-50 dark:bg-blue-900/20">
                    <TableCell></TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Input
                          type="text"
                          value={editingData.domain}
                          onChange={(e) => {
                            setEditingData({ ...editingData, domain: e.target.value });
                            if (fieldError) setFieldError(null);
                          }}
                          className={`font-mono text-sm text-slate-800 dark:text-slate-200 ${
                            fieldError ? 'border-red-500 focus:border-red-500' : ''
                          }`}
                          placeholder="example.com"
                          autoFocus
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={editingData.path}
                        onChange={(e) => setEditingData({ ...editingData, path: e.target.value })}
                        className="font-mono text-sm text-slate-800 dark:text-slate-200"
                        placeholder="/"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={editingData.name}
                        onChange={(e) => {
                          setEditingData({ ...editingData, name: e.target.value });
                          if (fieldError) setFieldError(null);
                        }}
                        className="font-mono text-sm text-slate-800 dark:text-slate-200"
                        placeholder="cookieName"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={editingData.value}
                        onChange={(e) => setEditingData({ ...editingData, value: e.target.value })}
                        className="font-mono text-sm text-slate-800 dark:text-slate-200"
                        placeholder="cookieValue"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        value={editingData.expires}
                        onChange={(e) => setEditingData({ ...editingData, expires: e.target.value })}
                        className="text-sm text-slate-800 dark:text-slate-200"
                        placeholder="Session"
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={editingData.httpOnly}
                        onCheckedChange={(checked) => setEditingData({ ...editingData, httpOnly: checked })}
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={editingData.secure}
                        onCheckedChange={(checked) => setEditingData({ ...editingData, secure: checked })}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={saveEditing}
                          className="text-green-600 hover:text-green-700 hover:border-green-300"
                          title="Save cookie"
                        >
                          <SaveIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={cancelEditing}
                          className="text-red-600 hover:text-red-700 hover:border-red-300"
                          title="Cancel"
                        >
                          <XIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {fieldError && (
              <div className="mt-2 text-sm text-red-600 dark:text-red-400">{fieldError}</div>
            )}
          </div>
        )}

        {/* Action Buttons - Beneath the data grid */}
        {cookies.length > 0 && (
          <div className="flex justify-start gap-2 pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={startAddingNew}
              disabled={editingRow !== null}
              className="text-blue-600 hover:text-blue-700 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Cookie
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              disabled={editingRow !== null || cookies.length === 0}
              className="text-red-600 hover:text-red-700 hover:border-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2Icon className="h-4 w-4 mr-2" />
              Clear All Cookies
            </Button>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="border-t border-gray-200 dark:border-slate-700 p-4 bg-gray-50 dark:bg-slate-800">
        <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>Total Cookies: {cookies.length}</span>
          <span>
            {enabledCount} of {cookies.length} cookies enabled
          </span>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialog.isOpen} onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, isOpen: open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">{confirmDialog.title}</DialogTitle>
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

export default CookieStoreGrid;
