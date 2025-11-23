import React, { useState } from 'react';
import { SaveIcon, XIcon, EyeIcon, EyeOffIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Proxy } from '../../types/collection';

interface ProxyWizardProps {
  proxy?: Proxy; // If provided, we're editing; otherwise, we're creating
  onSave: (proxy: Proxy) => void;
  onCancel: () => void;
  existingNames: string[]; // To validate uniqueness
}

const ProxyWizard: React.FC<ProxyWizardProps> = ({ proxy, onSave, onCancel, existingNames }) => {
  const isEditing = !!proxy;
  
  // Form state
  const [name, setName] = useState(proxy?.name || '');
  const [url, setUrl] = useState(proxy?.url || '');
  const [userName, setUserName] = useState(proxy?.userName || '');
  const [password, setPassword] = useState(proxy?.password || '');
  const [domainFilters, setDomainFilters] = useState(proxy?.domainFilters.join(', ') || '');
  const [excludeDomains, setExcludeDomains] = useState(proxy?.excludeDomains.join(', ') || '');
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Visibility toggles for sensitive fields
  const [showPassword, setShowPassword] = useState(false);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Name validation
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!isEditing && existingNames.includes(name.trim())) {
      newErrors.name = 'Name must be unique';
    } else if (isEditing && proxy && name.trim() !== proxy.name && existingNames.includes(name.trim())) {
      newErrors.name = 'Name must be unique';
    }

    // URL validation
    if (!url.trim()) {
      newErrors.url = 'Proxy URL is required';
    } else {
      try {
        const urlObj = new URL(url.trim());
        if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(urlObj.protocol)) {
          newErrors.url = 'URL must use http, https, socks4, or socks5 protocol';
        }
      } catch {
        newErrors.url = 'Invalid URL format';
      }
    }

    // If username is provided, password should also be provided (and vice versa)
    if (userName.trim() && !password.trim()) {
      newErrors.password = 'Password is required when username is provided';
    }
    if (password.trim() && !userName.trim()) {
      newErrors.userName = 'Username is required when password is provided';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = () => {
    if (!validateForm()) return;

    const proxyData: Proxy = {
      id: proxy?.id || `proxy-${crypto.randomUUID()}`,
      name: name.trim(),
      enabled: proxy?.enabled ?? true,
      url: url.trim(),
      userName: userName.trim() || undefined,
      password: password || undefined,
      domainFilters: domainFilters.split(',').map(d => d.trim()).filter(d => d.length > 0),
      excludeDomains: excludeDomains.split(',').map(d => d.trim()).filter(d => d.length > 0),
    };

    onSave(proxyData);
  };

  return (
    <div className="space-y-4">
      {/* Common Fields */}
      <div>
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Corporate Proxy, Dev Proxy"
          className="mt-1"
        />
        {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
      </div>

      <div>
        <Label htmlFor="url">Proxy URL *</Label>
        <Input
          id="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="e.g., http://proxy.example.com:8080"
          className="mt-1"
        />
        <p className="text-xs text-slate-500 mt-1">Supports http, https, socks4, and socks5 protocols</p>
        {errors.url && <p className="text-xs text-red-500 mt-1">{errors.url}</p>}
      </div>

      <div>
        <Label htmlFor="userName">Username (Optional)</Label>
        <Input
          id="userName"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder="Proxy username"
          className="mt-1"
        />
        {errors.userName && <p className="text-xs text-red-500 mt-1">{errors.userName}</p>}
      </div>

      <div>
        <Label htmlFor="password">Password (Optional)</Label>
        <div className="relative mt-1">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Proxy password"
            className="pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            title={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOffIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
      </div>

      <div>
        <Label htmlFor="domainFilters">Domain Filters (comma-separated)</Label>
        <Input
          id="domainFilters"
          value={domainFilters}
          onChange={(e) => setDomainFilters(e.target.value)}
          placeholder="e.g., api.example.com, *.myapp.com"
          className="mt-1"
        />
        <p className="text-xs text-slate-500 mt-1">Leave empty to apply to all domains. Use * for wildcards.</p>
      </div>

      <div>
        <Label htmlFor="excludeDomains">Exclude Domains (comma-separated)</Label>
        <Input
          id="excludeDomains"
          value={excludeDomains}
          onChange={(e) => setExcludeDomains(e.target.value)}
          placeholder="e.g., localhost, *.internal.com"
          className="mt-1"
        />
        <p className="text-xs text-slate-500 mt-1">Domains to explicitly exclude from proxy. Use * for wildcards.</p>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          className="text-green-600 hover:text-green-700 hover:border-green-300"
          title={isEditing ? "Update proxy" : "Save proxy"}
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

export default ProxyWizard;
