import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeftIcon, PencilIcon, Trash2Icon, PlusIcon, ShieldCheckIcon, FileKeyIcon, AlertTriangleIcon, XIcon, CheckIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { SecondaryButton } from '../ui/SecondaryButton';
import { PrimaryButton } from '../ui/PrimaryButton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Switch } from '../ui/switch';
import Banner from '../ui/banner';
import useAppStateStore from '../../hooks/store/useAppStateStore';
import CertWizard from './CertWizard';
import { Cert, CertType } from '../../types/collection';

interface CertStoreGridProps {
  onBack: () => void;
  onSaveCerts: (certs: Cert[]) => void;
}

function isCertExpired(cert: Cert): boolean {
  if (!cert.expiryDate) return false;
  const expiryDate = new Date(cert.expiryDate);
  const now = new Date();
  return !isNaN(expiryDate.getTime()) && expiryDate <= now;
}

const CertStoreGrid: React.FC<CertStoreGridProps> = ({ onBack, onSaveCerts }) => {
  const certs = useAppStateStore((state) => state.certs);
  const addCert = useAppStateStore((state) => state.addCert);
  const removeCert = useAppStateStore((state) => state.removeCert);
  const updateCert = useAppStateStore((state) => state.updateCert);
  const toggleCertEnabled = useAppStateStore((state) => state.toggleCertEnabled);

  const isInitialMount = useRef(true);
  const lastSavedCerts = useRef<string>('');

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastSavedCerts.current = JSON.stringify(certs);
      return;
    }

    const currentCertsString = JSON.stringify(certs);
    if (currentCertsString !== lastSavedCerts.current) {
      onSaveCerts(certs);
      lastSavedCerts.current = currentCertsString;
    }
  }, [certs, onSaveCerts]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCert, setEditingCert] = useState<Cert | undefined>(undefined);
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
    setEditingCert(undefined);
    setError(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (cert: Cert) => {
    setEditingCert(cert);
    setError(null);
    setIsDialogOpen(true);
  };

  const handleSave = (cert: Cert) => {
    if (editingCert) {
      // Update existing
      const result = updateCert(editingCert.id, cert);
      if (result.isErr) {
        setError(result.error);
        return;
      }
    } else {
      // Add new
      const result = addCert(cert);
      if (result.isErr) {
        setError(result.error);
        return;
      }
    }
    setIsDialogOpen(false);
    setEditingCert(undefined);
    setError(null);
  };

  const handleCancel = () => {
    setIsDialogOpen(false);
    setEditingCert(undefined);
    setError(null);
  };

  const handleToggle = (id: string) => {
    const result = toggleCertEnabled(id);
    if (result.isErr) {
      console.error('Failed to toggle cert:', result.error);
    }
  };

  const handleDelete = (id: string) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Certificate Configuration',
      message: 'Are you sure you want to delete this certificate configuration?',
      onConfirm: () => {
        const result = removeCert(id);
        if (result.isErr) {
          console.error('Failed to delete cert:', result.error);
        }
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const getCertIcon = (type: CertType) => {
    switch (type) {
      case CertType.CA:
        return <ShieldCheckIcon className="h-4 w-4" />;
      case CertType.SELF_SIGNED:
        return <FileKeyIcon className="h-4 w-4" />;
      default:
        return <ShieldCheckIcon className="h-4 w-4" />;
    }
  };

  const getCertTypeLabel = (type: CertType) => {
    switch (type) {
      case CertType.CA:
        return 'CA Certificate';
      case CertType.SELF_SIGNED:
        return 'Self-Signed';
      default:
        return type;
    }
  };

  const existingNames = certs.map(c => c.name);

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
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Certificate Store</h1>
        </div>
      </div>

      {/* Cert Table */}
      <div className="flex-1 overflow-auto p-4">
        {certs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <ShieldCheckIcon className="h-12 w-12 mb-4 opacity-50 mx-auto text-slate-400" />
              <p className="text-lg text-slate-600 dark:text-slate-400 mb-2">No certificate configurations</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Add certificate configurations to manage SSL/TLS certificates for your requests.
              </p>
              <SecondaryButton
                size="sm"
                onClick={handleAddNew}
                colorTheme="main"
                icon={<PlusIcon />}
                text="Add New Certificate"
              />
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[8%]">Enabled</TableHead>
                  <TableHead className="w-[12%]">Type</TableHead>
                  <TableHead className="w-[20%]">Name</TableHead>
                  <TableHead className="w-[15%]">Expires</TableHead>
                  <TableHead className="w-[30%]">Domain Filters</TableHead>
                  <TableHead className="w-[15%]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {certs.map((cert) => {
                  const isEnabled = cert.enabled;
                  const isExpired = isCertExpired(cert);
                  
                  return (
                    <TableRow
                      key={cert.id}
                    >
                      <TableCell>
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => handleToggle(cert.id)}
                        />
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div className={`flex items-center gap-2 text-sm ${
                          isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {getCertIcon(cert.type)}
                          <span>{getCertTypeLabel(cert.type)}</span>
                        </div>
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div className={`text-sm font-medium ${
                          isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {cert.name}
                          {isExpired && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                              <AlertTriangleIcon className="w-3 h-3 mr-1" />
                              Expired
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div className={`text-sm ${
                          isEnabled ? 'text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {cert.expiryDate ? (
                            <span className={isExpired ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                              {new Date(cert.expiryDate).toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 italic">Never expires</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={!isEnabled ? 'opacity-40' : ''}>
                        <div className="text-xs">
                          {cert.domainFilters.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {cert.domainFilters.map((domain, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-0.5 rounded font-mono ${
                                    isEnabled 
                                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
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
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <SecondaryButton
                            size="sm"
                            onClick={() => handleEdit(cert)}
                            colorTheme="main"
                            icon={<PencilIcon />}
                            tooltip="Edit certificate"
                          />
                          <SecondaryButton
                            size="sm"
                            onClick={() => handleDelete(cert.id)}
                            colorTheme="error"
                            icon={<Trash2Icon />}
                            tooltip="Delete certificate"
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
        {certs.length > 0 && (
          <div className="flex justify-start gap-2 pt-3">
            <SecondaryButton
              size="sm"
              onClick={handleAddNew}
              colorTheme="main"
              icon={<PlusIcon />}
              text="Add New Certificate"
            />
          </div>
        )}
      </div>

      {/* Cert Wizard Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-slate-800 dark:text-slate-200">
              {editingCert ? 'Edit Certificate Configuration' : 'Add New Certificate Configuration'}
            </DialogTitle>
          </DialogHeader>
          {error && (
            <Banner
              message={error}
              messageType="error"
              onClose={() => setError(null)}
            />
          )}
          <CertWizard
            cert={editingCert}
            onSave={handleSave}
            onCancel={handleCancel}
            existingNames={editingCert ? existingNames.filter(n => n !== editingCert.name) : existingNames}
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

export default CertStoreGrid;
