import React, { useState, useEffect } from 'react';
import { SaveIcon, XIcon, EyeIcon, EyeOffIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Auth, AuthType, ApiKeyAuth, BasicAuth, DigestAuth } from '../../hooks/store/createAuthSlice';

interface AuthWizardProps {
  auth?: Auth; // If provided, we're editing; otherwise, we're creating
  onSave: (auth: Auth) => void;
  onCancel: () => void;
  existingNames: string[]; // To validate uniqueness
}

const AuthWizard: React.FC<AuthWizardProps> = ({ auth, onSave, onCancel, existingNames }) => {
  const isEditing = !!auth;
  
  // Form state
  const [authType, setAuthType] = useState<AuthType>(auth?.type || AuthType.API_KEY);
  const [name, setName] = useState(auth?.name || '');
  const [domainFilters, setDomainFilters] = useState(auth?.domainFilters.join(', ') || '');
  const [expiryDate, setExpiryDate] = useState(auth?.expiryDate || '');
  const [base64Encode, setBase64Encode] = useState(auth?.base64Encode ?? false);
  
  // API Key specific
  const [apiKey, setApiKey] = useState((auth?.type === AuthType.API_KEY ? auth.key : '') || '');
  const [apiValue, setApiValue] = useState((auth?.type === AuthType.API_KEY ? auth.value : '') || '');
  const [sendIn, setSendIn] = useState<'header' | 'query'>((auth?.type === AuthType.API_KEY ? auth.sendIn : 'header') || 'header');
  const [prefix, setPrefix] = useState((auth?.type === AuthType.API_KEY ? auth.prefix : '') || '');
  
  // Basic Auth specific
  const [username, setUsername] = useState((auth?.type === AuthType.BASIC || auth?.type === AuthType.DIGEST ? auth.username : '') || '');
  const [password, setPassword] = useState((auth?.type === AuthType.BASIC || auth?.type === AuthType.DIGEST ? auth.password : '') || '');
  
  // Digest Auth specific
  const [realm, setRealm] = useState((auth?.type === AuthType.DIGEST ? auth.realm : '') || '');
  const [nonce, setNonce] = useState((auth?.type === AuthType.DIGEST ? auth.nonce : '') || '');
  const [algorithm, setAlgorithm] = useState<'MD5' | 'MD5-sess' | 'SHA-256' | 'SHA-256-sess'>((auth?.type === AuthType.DIGEST ? auth.algorithm : 'MD5') || 'MD5');
  const [qop, setQop] = useState<'auth' | 'auth-int'>((auth?.type === AuthType.DIGEST ? auth.qop : 'auth') || 'auth');
  const [nc, setNc] = useState((auth?.type === AuthType.DIGEST ? auth.nc : '') || '');
  const [cnonce, setCnonce] = useState((auth?.type === AuthType.DIGEST ? auth.cnonce : '') || '');
  const [opaque, setOpaque] = useState((auth?.type === AuthType.DIGEST ? auth.opaque : '') || '');
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Visibility toggles for sensitive fields
  const [showApiValue, setShowApiValue] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Reset form when auth type changes (only when creating new)
  useEffect(() => {
    if (!isEditing) {
      // Clear type-specific fields when switching types
      setApiKey('');
      setApiValue('');
      setSendIn('header');
      setPrefix('');
      setUsername('');
      setPassword('');
      setRealm('');
      setNonce('');
      setAlgorithm('MD5');
      setQop('auth');
      setNc('');
      setCnonce('');
      setOpaque('');
    }
  }, [authType, isEditing]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Common validations
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!isEditing && existingNames.includes(name.trim())) {
      newErrors.name = 'Name must be unique';
    } else if (isEditing && auth && name.trim() !== auth.name && existingNames.includes(name.trim())) {
      newErrors.name = 'Name must be unique';
    }

    // Type-specific validations
    if (authType === AuthType.API_KEY) {
      if (!apiKey.trim()) newErrors.apiKey = 'Key is required';
      if (!apiValue.trim()) newErrors.apiValue = 'Value is required';
    } else if (authType === AuthType.BASIC) {
      if (!username.trim()) newErrors.username = 'Username is required';
      if (!password.trim()) newErrors.password = 'Password is required';
    } else if (authType === AuthType.DIGEST) {
      if (!username.trim()) newErrors.username = 'Username is required';
      if (!password.trim()) newErrors.password = 'Password is required';
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

    const baseAuth = {
      id: auth?.id || `auth-${crypto.randomUUID()}`,
      name: name.trim(),
      enabled: auth?.enabled ?? true,
      domainFilters: domainFilters.split(',').map(d => d.trim()).filter(d => d.length > 0),
      expiryDate: expiryDate || undefined,
      base64Encode,
    };

    let authData: Auth;

    switch (authType) {
      case AuthType.API_KEY:
        authData = {
          ...baseAuth,
          type: AuthType.API_KEY,
          key: apiKey.trim(),
          value: apiValue,
          sendIn,
          prefix: prefix || undefined,
        } as ApiKeyAuth;
        break;
      case AuthType.BASIC:
        authData = {
          ...baseAuth,
          type: AuthType.BASIC,
          username: username.trim(),
          password: password,
        } as BasicAuth;
        break;
      case AuthType.DIGEST:
        authData = {
          ...baseAuth,
          type: AuthType.DIGEST,
          username: username.trim(),
          password: password,
          realm: realm.trim() || undefined,
          nonce: nonce.trim() || undefined,
          algorithm: algorithm || undefined,
          qop: qop || undefined,
          nc: nc.trim() || undefined,
          cnonce: cnonce.trim() || undefined,
          opaque: opaque.trim() || undefined,
        } as DigestAuth;
        break;
      default:
        // OAuth2 and other auth types not yet supported in UI
        console.error(`Unsupported auth type: ${authType}`);
        return;
    }

    onSave(authData);
  };

  return (
    <div className="space-y-4">
      {/* Auth Type - Only show when creating new */}
      {!isEditing && (
        <div>
          <Label htmlFor="authType">Auth Type *</Label>
          <Select value={authType} onValueChange={(value) => setAuthType(value as AuthType)}>
            <SelectTrigger id="authType" className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AuthType.API_KEY}>API Key</SelectItem>
              <SelectItem value={AuthType.BASIC}>Basic Auth</SelectItem>
              <SelectItem value={AuthType.DIGEST}>Digest Auth</SelectItem>
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
          placeholder="e.g., Production API Auth"
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
          placeholder="e.g., api.example.com, *.myapp.com"
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

      <div>
        <Label htmlFor="base64Encode" className="flex items-center gap-2">
          <input
            type="checkbox"
            id="base64Encode"
            checked={base64Encode}
            onChange={(e) => setBase64Encode(e.target.checked)}
            className="rounded"
          />
          Base64 Encode Credentials
        </Label>
      </div>

      {/* Type-specific Fields */}
      {authType === AuthType.API_KEY && (
        <>
          <div>
            <Label htmlFor="apiKey">Key *</Label>
            <Input
              id="apiKey"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="e.g., X-API-Key, Authorization"
              className="mt-1"
            />
            {errors.apiKey && <p className="text-xs text-red-500 mt-1">{errors.apiKey}</p>}
          </div>

          <div>
            <Label htmlFor="apiValue">Value *</Label>
            <div className="relative mt-1">
              <Input
                id="apiValue"
                type={showApiValue ? "text" : "password"}
                value={apiValue}
                onChange={(e) => setApiValue(e.target.value)}
                placeholder="Your API key value"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiValue(!showApiValue)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                title={showApiValue ? "Hide value" : "Show value"}
              >
                {showApiValue ? (
                  <EyeOffIcon className="h-4 w-4" />
                ) : (
                  <EyeIcon className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.apiValue && <p className="text-xs text-red-500 mt-1">{errors.apiValue}</p>}
          </div>

          <div>
            <Label htmlFor="sendIn">Send In *</Label>
            <Select value={sendIn} onValueChange={(value) => setSendIn(value as 'header' | 'query')}>
              <SelectTrigger id="sendIn" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="query">Query Parameter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="prefix">Prefix (Optional)</Label>
            <Input
              id="prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="e.g., Bearer , Token "
              className="mt-1"
            />
            <p className="text-xs text-slate-500 mt-1">Prefix to add before the value (e.g., "Bearer ")</p>
          </div>
        </>
      )}

      {authType === AuthType.BASIC && (
        <>
          <div>
            <Label htmlFor="username">Username *</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="mt-1"
            />
            {errors.username && <p className="text-xs text-red-500 mt-1">{errors.username}</p>}
          </div>

          <div>
            <Label htmlFor="password">Password *</Label>
            <div className="relative mt-1">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
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
        </>
      )}

      {authType === AuthType.DIGEST && (
        <>
          <div>
            <Label htmlFor="username">Username *</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="mt-1"
            />
            {errors.username && <p className="text-xs text-red-500 mt-1">{errors.username}</p>}
          </div>

          <div>
            <Label htmlFor="password">Password *</Label>
            <div className="relative mt-1">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
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
            <Label htmlFor="realm">Realm (Optional)</Label>
            <Input
              id="realm"
              value={realm}
              onChange={(e) => setRealm(e.target.value)}
              placeholder="Authentication realm"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="nonce">Nonce (Optional)</Label>
            <Input
              id="nonce"
              value={nonce}
              onChange={(e) => setNonce(e.target.value)}
              placeholder="Server nonce"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="algorithm">Algorithm</Label>
            <Select value={algorithm} onValueChange={(value) => setAlgorithm(value as any)}>
              <SelectTrigger id="algorithm" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MD5">MD5</SelectItem>
                <SelectItem value="MD5-sess">MD5-sess</SelectItem>
                <SelectItem value="SHA-256">SHA-256</SelectItem>
                <SelectItem value="SHA-256-sess">SHA-256-sess</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="qop">QOP (Quality of Protection)</Label>
            <Select value={qop} onValueChange={(value) => setQop(value as any)}>
              <SelectTrigger id="qop" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auth">auth</SelectItem>
                <SelectItem value="auth-int">auth-int</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="nc">Nonce Count (Optional)</Label>
            <Input
              id="nc"
              value={nc}
              onChange={(e) => setNc(e.target.value)}
              placeholder="e.g., 00000001"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="cnonce">Client Nonce (Optional)</Label>
            <Input
              id="cnonce"
              value={cnonce}
              onChange={(e) => setCnonce(e.target.value)}
              placeholder="Client-generated nonce"
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="opaque">Opaque (Optional)</Label>
            <Input
              id="opaque"
              value={opaque}
              onChange={(e) => setOpaque(e.target.value)}
              placeholder="Server-provided opaque value"
              className="mt-1"
            />
          </div>
        </>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSave}
          className="text-green-600 hover:text-green-700 hover:border-green-300"
          title={isEditing ? "Update auth" : "Save auth"}
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

export default AuthWizard;
