import React, { useState, useEffect } from 'react';
import { SaveIcon, XIcon, EyeIcon, EyeOffIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Cert, CertType, CACert, SelfSignedCert } from '../../types/collection';
import { FileInput } from '../ui/fileinput';
import { FileWithPreview } from '../../hooks/useFileUpload';

interface CertWizardProps {
  cert?: Cert; // If provided, we're editing; otherwise, we're creating
  onSave: (cert: Cert) => void;
  onCancel: () => void;
  existingNames: string[]; // To validate uniqueness
}

const CertWizard: React.FC<CertWizardProps> = ({ cert, onSave, onCancel, existingNames }) => {
  const isEditing = !!cert;
  
  // Form state
  const [certType, setCertType] = useState<CertType>(cert?.type || CertType.CA);
  const [name, setName] = useState(cert?.name || '');
  const [domainFilters, setDomainFilters] = useState(cert?.domainFilters.join(', ') || '');
  const [expiryDate, setExpiryDate] = useState(cert?.expiryDate || '');
  
  // CA specific - using FileWithPreview for file state
  const [caCertFile, setCaCertFile] = useState<FileWithPreview | null>(null);
  const [caCertFilePath, setCaCertFilePath] = useState((cert?.type === CertType.CA ? cert.certFile : '') || '');
  
  // Self-Signed specific - using FileWithPreview for file state
  const [certFile, setCertFile] = useState<FileWithPreview | null>(null);
  const [certFilePath, setCertFilePath] = useState((cert?.type === CertType.SELF_SIGNED ? cert.certFile : '') || '');
  const [keyFile, setKeyFile] = useState<FileWithPreview | null>(null);
  const [keyFilePath, setKeyFilePath] = useState((cert?.type === CertType.SELF_SIGNED ? cert.keyFile : '') || '');
  const [pfxFile, setPfxFile] = useState<FileWithPreview | null>(null);
  const [pfxFilePath, setPfxFilePath] = useState((cert?.type === CertType.SELF_SIGNED ? cert.pfxFile : '') || '');
  const [passPhrase, setPassPhrase] = useState((cert?.type === CertType.SELF_SIGNED ? cert.passPhrase : '') || '');
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Visibility toggle for passphrase
  const [showPassPhrase, setShowPassPhrase] = useState(false);

  // Reset form when cert type changes (only when creating new)
  useEffect(() => {
    if (!isEditing) {
      // Clear type-specific fields when switching types
      setCaCertFile(null);
      setCaCertFilePath('');
      setCertFile(null);
      setCertFilePath('');
      setKeyFile(null);
      setKeyFilePath('');
      setPfxFile(null);
      setPfxFilePath('');
      setPassPhrase('');
    }
  }, [certType, isEditing]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Common validations
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!isEditing && existingNames.includes(name.trim())) {
      newErrors.name = 'Name must be unique';
    } else if (isEditing && cert && name.trim() !== cert.name && existingNames.includes(name.trim())) {
      newErrors.name = 'Name must be unique';
    }

    if (!domainFilters.trim()) {
      newErrors.domainFilters = 'At least one domain (host) is required';
    }

    // Type-specific validations
    if (certType === CertType.CA) {
      if (!caCertFilePath.trim()) {
        newErrors.caCertFile = 'Certificate file is required';
      }
    } else if (certType === CertType.SELF_SIGNED) {
      const hasCertAndKey = certFilePath.trim() && keyFilePath.trim();
      const hasPfx = pfxFilePath.trim();
      
      if (!hasCertAndKey && !hasPfx) {
        newErrors.selfSigned = 'Either provide (Cert + Key files) or a PFX file';
      }
    }

    // Validate expiry date format if provided
    if (expiryDate && isNaN(Date.parse(expiryDate))) {
      newErrors.expiryDate = 'Invalid date format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) return;

    const baseCert = {
      id: cert?.id || `cert-${crypto.randomUUID()}`,
      name: name.trim(),
      enabled: cert?.enabled ?? true,
      domainFilters: domainFilters.split(',').map(d => d.trim()).filter(d => d.length > 0),
      expiryDate: expiryDate || undefined,
    };

    let certData: Cert;

    switch (certType) {
      case CertType.CA:
        certData = {
          ...baseCert,
          type: CertType.CA,
          certFile: caCertFilePath.trim(),
          passPhrase: passPhrase || undefined,
        } as CACert;
        break;
      case CertType.SELF_SIGNED:
        certData = {
          ...baseCert,
          type: CertType.SELF_SIGNED,
          certFile: certFilePath.trim() || undefined,
          keyFile: keyFilePath.trim() || undefined,
          pfxFile: pfxFilePath.trim() || undefined,
          passPhrase: passPhrase || undefined,
        } as SelfSignedCert;
        break;
    }

    onSave(certData);
  };

  return (
    <div className="space-y-4">
      {/* Cert Type - Only show when creating new */}
      {!isEditing && (
        <div>
          <Label htmlFor="certType">Certificate Type *</Label>
          <Select value={certType} onValueChange={(value) => setCertType(value as CertType)}>
            <SelectTrigger id="certType" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CertType.CA}>CA Certificate</SelectItem>
              <SelectItem value={CertType.SELF_SIGNED}>Self-Signed Certificate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Common Fields */}
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Production SSL Cert"
          className="mt-1"
        />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
      </div>

      <div>
        <Label htmlFor="domainFilters">Domain Filters (comma-separated)</Label>
        <Input
          id="domainFilters"
          value={domainFilters}
          onChange={(e) => setDomainFilters(e.target.value)}
          placeholder="e.g., api1.example.com, api2.example.com"
          className="mt-1"
        />
        <p className="text-xs text-slate-500 mt-1">Leave empty to apply to all domains. Use * for wildcards.</p>
      </div>

      <div>
        <Label htmlFor="expiryDate">Expiry Date (Optional)</Label>
        <Input
          id="expiryDate"
          type="datetime-local"
          value={expiryDate}
          onChange={(e) => setExpiryDate(e.target.value)}
          className="mt-1"
        />
        {errors.expiryDate && <p className="text-xs text-red-500 mt-1">{errors.expiryDate}</p>}
      </div>

      {/* Type-specific Fields */}
      {certType === CertType.CA && (
        <>
          <div>
            <Label htmlFor="caCertFile">Certificate File *</Label>
            <FileInput
              id="caCertFile"
              onFilesAdded={(files) => {
                if (files.length > 0) {
                  setCaCertFile(files[0]);
                  if (files[0].file instanceof File) {
                    setCaCertFilePath(files[0].file.name);
                  }
                }
              }}
              onFileRemoved={() => {
                setCaCertFile(null);
                setCaCertFilePath('');
              }}
              initialFiles={caCertFile ? [caCertFile] : []}
              placeholder="Select certificate file (.crt, .pem)"
              accept=".crt,.pem,.cer"
              className="mt-1"
              useFileIcon={true}
            />
            {errors.caCertFile && <p className="text-xs text-red-500 mt-1">{errors.caCertFile}</p>}
            <p className="text-xs text-slate-500 mt-1">CA certificate file for validating server certificates</p>
          </div>
        </>
      )}

      {certType === CertType.SELF_SIGNED && (
        <>
          <div className="space-y-4 p-4 border border-slate-200 dark:border-slate-700 rounded-md">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Option 1: Certificate + Key Files
            </p>
            
            <div>
              <Label htmlFor="certFile">Certificate File</Label>
              <FileInput
                id="certFile"
                onFilesAdded={(files) => {
                  if (files.length > 0) {
                    setCertFile(files[0]);
                    if (files[0].file instanceof File) {
                      setCertFilePath(files[0].file.name);
                    }
                  }
                }}
                onFileRemoved={() => {
                  setCertFile(null);
                  setCertFilePath('');
                }}
                initialFiles={certFile ? [certFile] : []}
                placeholder="Select certificate file (.crt, .pem)"
                accept=".crt,.pem,.cer"
                className="mt-1"
                useFileIcon={true}
              />
              <p className="text-xs text-slate-500 mt-1">Client certificate file</p>
            </div>

            <div>
              <Label htmlFor="keyFile">Key File</Label>
              <FileInput
                id="keyFile"
                onFilesAdded={(files) => {
                  if (files.length > 0) {
                    setKeyFile(files[0]);
                    if (files[0].file instanceof File) {
                      setKeyFilePath(files[0].file.name);
                    }
                  }
                }}
                onFileRemoved={() => {
                  setKeyFile(null);
                  setKeyFilePath('');
                }}
                initialFiles={keyFile ? [keyFile] : []}
                placeholder="Select key file (.key, .pem)"
                accept=".key,.pem"
                className="mt-1"
                useFileIcon={true}
              />
              <p className="text-xs text-slate-500 mt-1">Private key file for the certificate</p>
            </div>
          </div>

          <div className="text-center text-sm text-slate-500 dark:text-slate-400">
            - OR -
          </div>

          <div className="space-y-4 p-4 border border-slate-200 dark:border-slate-700 rounded-md">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Option 2: PFX/PKCS12 File
            </p>
            
            <div>
              <Label htmlFor="pfxFile">PFX File</Label>
              <FileInput
                id="pfxFile"
                onFilesAdded={(files) => {
                  if (files.length > 0) {
                    setPfxFile(files[0]);
                    if (files[0].file instanceof File) {
                      setPfxFilePath(files[0].file.name);
                    }
                  }
                }}
                onFileRemoved={() => {
                  setPfxFile(null);
                  setPfxFilePath('');
                }}
                initialFiles={pfxFile ? [pfxFile] : []}
                placeholder="Select PFX file (.pfx, .p12)"
                accept=".pfx,.p12"
                className="mt-1"
                useFileIcon={true}
              />
              <p className="text-xs text-slate-500 mt-1">PFX/PKCS12 file containing certificate and key</p>
            </div>
          </div>

          <div>
            <Label htmlFor="passPhrase">Passphrase (Optional)</Label>
            <div className="relative mt-1">
              <Input
                id="passPhrase"
                type={showPassPhrase ? "text" : "password"}
                value={passPhrase}
                onChange={(e) => setPassPhrase(e.target.value)}
                placeholder="Passphrase for encrypted key/PFX"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassPhrase(!showPassPhrase)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                title={showPassPhrase ? "Hide passphrase" : "Show passphrase"}
              >
                {showPassPhrase ? (
                  <EyeOffIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">Required if your key or PFX file is encrypted</p>
          </div>

          {errors.selfSigned && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
              {errors.selfSigned}
            </p>
          )}
        </>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          className="text-green-600 hover:text-green-700 hover:border-green-300"
          title={isEditing ? "Update certificate" : "Save certificate"}
        >
          Save <SaveIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          className="text-red-600 hover:text-red-700 hover:border-red-300"
          title="Cancel"
        >
          Cancel <XIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default CertWizard;
