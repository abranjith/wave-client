import React, { useState, useEffect, useCallback } from 'react';
import { SaveIcon, XIcon, EyeIcon, EyeOffIcon, ExternalLinkIcon, RefreshCwIcon, CheckCircleIcon, AlertCircleIcon, LoaderIcon } from 'lucide-react';
import { PrimaryButton } from '../ui/PrimaryButton';
import { SecondaryButton } from '../ui/SecondaryButton';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Auth,
  AuthType,
  ApiKeyAuth,
  BasicAuth,
  DigestAuth,
  OAuth2RefreshAuth,
  OAuth2ClientCredentialsAuth,
  OAuth2AuthorizationCodeAuth,
  OAuth2ClientAuthMethod,
  HmacAuth,
  HmacHashAlgorithm,
} from '../../hooks/store/createAuthSlice';
import { generatePkcePair, buildAuthorizationUrl, applyClientAuth, parseAuthorizationResponse } from '../../utils/oauth2';

interface AuthWizardProps {
  auth?: Auth;
  onSave: (auth: Auth) => void;
  onCancel: () => void;
  existingNames: string[];
}

type PkcePair = { codeVerifier: string; codeChallenge: string };
type AcFlowStep = 'idle' | 'generated' | 'exchanging' | 'success' | 'error';

const AuthWizard: React.FC<AuthWizardProps> = ({ auth, onSave, onCancel, existingNames }) => {
  const isEditing = !!auth;

  // ── Common ────────────────────────────────────────────────────────────────
  const [authType, setAuthType] = useState<AuthType>(auth?.type || AuthType.API_KEY);
  const [name, setName] = useState(auth?.name || '');
  const [domainFilters, setDomainFilters] = useState(auth?.domainFilters.join(', ') || '');
  const [expiryDate, setExpiryDate] = useState(auth?.expiryDate || '');

  // ── API Key ───────────────────────────────────────────────────────────────
  const [apiKey, setApiKey] = useState((auth?.type === AuthType.API_KEY ? auth.key : '') || '');
  const [apiValue, setApiValue] = useState((auth?.type === AuthType.API_KEY ? auth.value : '') || '');
  const [apiSendIn, setApiSendIn] = useState<'header' | 'query'>((auth?.type === AuthType.API_KEY ? auth.sendIn : 'header') || 'header');
  const [prefix, setPrefix] = useState((auth?.type === AuthType.API_KEY ? auth.prefix : '') || '');

  // ── Basic / Digest ────────────────────────────────────────────────────────
  const [username, setUsername] = useState(
    (auth?.type === AuthType.BASIC || auth?.type === AuthType.DIGEST ? auth.username : '') || ''
  );
  const [password, setPassword] = useState(
    (auth?.type === AuthType.BASIC || auth?.type === AuthType.DIGEST ? auth.password : '') || ''
  );

  // ── OAuth2 Refresh ────────────────────────────────────────────────────────
  const [tokenUrl, setTokenUrl] = useState((auth?.type === AuthType.OAUTH2_REFRESH ? auth.tokenUrl : '') || '');
  const [clientId, setClientId] = useState((auth?.type === AuthType.OAUTH2_REFRESH ? auth.clientId : '') || '');
  const [clientSecret, setClientSecret] = useState((auth?.type === AuthType.OAUTH2_REFRESH ? auth.clientSecret : '') || '');
  const [refreshToken, setRefreshToken] = useState((auth?.type === AuthType.OAUTH2_REFRESH ? auth.refreshToken : '') || '');
  const [scope, setScope] = useState((auth?.type === AuthType.OAUTH2_REFRESH ? auth.scope : '') || '');
  const [clientAuthMethod, setClientAuthMethod] = useState<OAuth2ClientAuthMethod | ''>(
    auth?.type === AuthType.OAUTH2_REFRESH ? auth.clientAuthMethod : ''
  );

  // ── OAuth2 Client Credentials ─────────────────────────────────────────────
  const [ccTokenUrl, setCcTokenUrl] = useState((auth?.type === AuthType.OAUTH2_CLIENT_CREDENTIALS ? auth.tokenUrl : '') || '');
  const [ccClientId, setCcClientId] = useState((auth?.type === AuthType.OAUTH2_CLIENT_CREDENTIALS ? auth.clientId : '') || '');
  const [ccClientSecret, setCcClientSecret] = useState((auth?.type === AuthType.OAUTH2_CLIENT_CREDENTIALS ? auth.clientSecret : '') || '');
  const [ccScope, setCcScope] = useState((auth?.type === AuthType.OAUTH2_CLIENT_CREDENTIALS ? auth.scope : '') || '');
  const [ccAudience, setCcAudience] = useState((auth?.type === AuthType.OAUTH2_CLIENT_CREDENTIALS ? auth.audience : '') || '');
  const [ccClientAuthMethod, setCcClientAuthMethod] = useState<OAuth2ClientAuthMethod | ''>(
    auth?.type === AuthType.OAUTH2_CLIENT_CREDENTIALS ? auth.clientAuthMethod : ''
  );

  // ── OAuth2 Authorization Code ─────────────────────────────────────────────
  const acAuth = auth?.type === AuthType.OAUTH2_AUTHORIZATION_CODE ? auth : undefined;
  const [acAuthorizationUrl, setAcAuthorizationUrl] = useState(acAuth?.authorizationUrl || '');
  const [acTokenUrl, setAcTokenUrl] = useState(acAuth?.tokenUrl || '');
  const [acClientId, setAcClientId] = useState(acAuth?.clientId || '');
  const [acClientSecret, setAcClientSecret] = useState(acAuth?.clientSecret || '');
  const [acRedirectUri, setAcRedirectUri] = useState(acAuth?.redirectUri || '');
  const [acScope, setAcScope] = useState(acAuth?.scope || '');
  const [acCodeChallengeMethod, setAcCodeChallengeMethod] = useState<'S256' | 'plain' | ''>(acAuth?.codeChallengeMethod || '');
  const [acClientAuthMethod, setAcClientAuthMethod] = useState<OAuth2ClientAuthMethod | ''>(acAuth?.clientAuthMethod || '');
  // PKCE interactive flow state
  const [acPkcePair, setAcPkcePair] = useState<PkcePair | null>(null);
  const [acOauthState, setAcOauthState] = useState<string>('');
  const [acCodeInput, setAcCodeInput] = useState('');
  const [acFlowStep, setAcFlowStep] = useState<AcFlowStep>('idle');
  const [acFlowError, setAcFlowError] = useState('');
  // Token result state (populated after successful exchange)
  const [acAccessToken, setAcAccessToken] = useState(acAuth?.accessToken || '');
  const [acRefreshToken, setAcRefreshToken] = useState(acAuth?.refreshToken || '');
  const [acTokenType, setAcTokenType] = useState(acAuth?.tokenType || '');
  const [acTokenExpiresAt, setAcTokenExpiresAt] = useState<number | undefined>(acAuth?.tokenExpiresAt);

  // ── HMAC ─────────────────────────────────────────────────────────────────
  const hmacAuth = auth?.type === AuthType.HMAC ? auth : undefined;
  const [hmacAlgorithm, setHmacAlgorithm] = useState<HmacHashAlgorithm | ''>(hmacAuth?.algorithm || '');
  const [hmacSecretKey, setHmacSecretKey] = useState(hmacAuth?.secretKey || '');
  const [hmacKeyId, setHmacKeyId] = useState(hmacAuth?.keyId || '');
  const [hmacSignatureTemplate, setHmacSignatureTemplate] = useState(hmacAuth?.signatureTemplate || '');
  const [hmacOutputEncoding, setHmacOutputEncoding] = useState<'hex' | 'base64' | ''>(hmacAuth?.outputEncoding || '');
  const [hmacSendIn, setHmacSendIn] = useState<'header' | 'query' | ''>(hmacAuth?.sendIn || '');
  const [hmacTargetName, setHmacTargetName] = useState(hmacAuth?.targetName || '');
  const [hmacPrefix, setHmacPrefix] = useState(hmacAuth?.prefix || '');
  const [hmacTimestampHeader, setHmacTimestampHeader] = useState(hmacAuth?.timestampHeader || '');
  const [hmacNonceHeader, setHmacNonceHeader] = useState(hmacAuth?.nonceHeader || '');

  // ── Visibility toggles ────────────────────────────────────────────────────
  const [showApiValue, setShowApiValue] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showRefreshToken, setShowRefreshToken] = useState(false);
  const [showCcClientSecret, setShowCcClientSecret] = useState(false);
  const [showAcClientSecret, setShowAcClientSecret] = useState(false);
  const [showHmacSecretKey, setShowHmacSecretKey] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset type-specific state when auth type changes (create mode only)
  useEffect(() => {
    if (!isEditing) {
      setApiKey(''); setApiValue(''); setApiSendIn('header'); setPrefix('');
      setUsername(''); setPassword('');
      setTokenUrl(''); setClientId(''); setClientSecret(''); setRefreshToken(''); setScope(''); setClientAuthMethod('');
      setCcTokenUrl(''); setCcClientId(''); setCcClientSecret(''); setCcScope(''); setCcAudience(''); setCcClientAuthMethod('');
      setAcAuthorizationUrl(''); setAcTokenUrl(''); setAcClientId(''); setAcClientSecret('');
      setAcRedirectUri(''); setAcScope(''); setAcCodeChallengeMethod(''); setAcClientAuthMethod('');
      setAcPkcePair(null); setAcOauthState(''); setAcCodeInput(''); setAcFlowStep('idle'); setAcFlowError('');
      setAcAccessToken(''); setAcRefreshToken(''); setAcTokenType(''); setAcTokenExpiresAt(undefined);
      setHmacAlgorithm(''); setHmacSecretKey(''); setHmacKeyId(''); setHmacSignatureTemplate('');
      setHmacOutputEncoding(''); setHmacSendIn(''); setHmacTargetName(''); setHmacPrefix('');
      setHmacTimestampHeader(''); setHmacNonceHeader('');
    }
  }, [authType, isEditing]);

  // ── Validation ────────────────────────────────────────────────────────────
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!isEditing && existingNames.includes(name.trim())) {
      newErrors.name = 'Name must be unique';
    } else if (isEditing && auth && name.trim() !== auth.name && existingNames.includes(name.trim())) {
      newErrors.name = 'Name must be unique';
    }

    if (authType === AuthType.API_KEY) {
      if (!apiKey.trim()) newErrors.apiKey = 'Key is required';
      if (!apiValue.trim()) newErrors.apiValue = 'Value is required';
    } else if (authType === AuthType.BASIC) {
      if (!username.trim()) newErrors.username = 'Username is required';
      if (!password.trim()) newErrors.password = 'Password is required';
    } else if (authType === AuthType.DIGEST) {
      if (!username.trim()) newErrors.username = 'Username is required';
      if (!password.trim()) newErrors.password = 'Password is required';
    } else if (authType === AuthType.OAUTH2_REFRESH) {
      if (!tokenUrl.trim()) newErrors.tokenUrl = 'Token URL is required';
      if (!clientId.trim()) newErrors.clientId = 'Client ID is required';
      if (!refreshToken.trim()) newErrors.refreshToken = 'Refresh Token is required';
      if (!clientAuthMethod) newErrors.clientAuthMethod = 'Client auth method is required';
    } else if (authType === AuthType.OAUTH2_CLIENT_CREDENTIALS) {
      if (!ccTokenUrl.trim()) newErrors.ccTokenUrl = 'Token URL is required';
      if (!ccClientId.trim()) newErrors.ccClientId = 'Client ID is required';
      if (!ccClientSecret.trim()) newErrors.ccClientSecret = 'Client Secret is required';
      if (!ccClientAuthMethod) newErrors.ccClientAuthMethod = 'Client auth method is required';
    } else if (authType === AuthType.OAUTH2_AUTHORIZATION_CODE) {
      if (!acAuthorizationUrl.trim()) newErrors.acAuthorizationUrl = 'Authorization URL is required';
      if (!acTokenUrl.trim()) newErrors.acTokenUrl = 'Token URL is required';
      if (!acClientId.trim()) newErrors.acClientId = 'Client ID is required';
      if (!acRedirectUri.trim()) newErrors.acRedirectUri = 'Redirect URI is required';
      if (!acCodeChallengeMethod) newErrors.acCodeChallengeMethod = 'Code challenge method is required';
      if (!acClientAuthMethod) newErrors.acClientAuthMethod = 'Client auth method is required';
      // Require a token to have been exchanged (or existing token when editing)
      if (!acAccessToken && !isEditing) {
        newErrors.acFlow = 'Complete the token exchange before saving';
      }
    } else if (authType === AuthType.HMAC) {
      if (!hmacAlgorithm) newErrors.hmacAlgorithm = 'Algorithm is required';
      if (!hmacSecretKey.trim()) newErrors.hmacSecretKey = 'Secret Key is required';
      if (!hmacSignatureTemplate.trim()) newErrors.hmacSignatureTemplate = 'Signature Template is required';
      if (!hmacOutputEncoding) newErrors.hmacOutputEncoding = 'Output Encoding is required';
      if (!hmacSendIn) newErrors.hmacSendIn = 'Send In is required';
      if (!hmacTargetName.trim()) newErrors.hmacTargetName = 'Target Name is required';
    }

    if (expiryDate && isNaN(Date.parse(expiryDate))) {
      newErrors.expiryDate = 'Invalid date format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── PKCE: Generate & Open ─────────────────────────────────────────────────
  const handleGenerateAndOpen = useCallback(async () => {
    if (!acAuthorizationUrl.trim() || !acClientId.trim() || !acRedirectUri.trim() || !acCodeChallengeMethod) {
      setErrors((prev) => ({
        ...prev,
        acFlow: 'Fill in Authorization URL, Client ID, Redirect URI, and Code Challenge Method first',
      }));
      return;
    }

    const oauthState = crypto.randomUUID();
    const pkcePair = await generatePkcePair(acCodeChallengeMethod as 'S256' | 'plain');

    setAcPkcePair(pkcePair);
    setAcOauthState(oauthState);
    setAcFlowStep('generated');
    setAcFlowError('');
    setErrors((prev) => { const e = { ...prev }; delete e.acFlow; return e; });

    const authUrl = buildAuthorizationUrl({
      authorizationUrl: acAuthorizationUrl.trim(),
      clientId: acClientId.trim(),
      redirectUri: acRedirectUri.trim(),
      scope: acScope.trim() || undefined,
      state: oauthState,
      codeChallenge: pkcePair.codeChallenge,
      codeChallengeMethod: acCodeChallengeMethod as 'S256' | 'plain',
    });

    window.open(authUrl, '_blank', 'noopener,noreferrer');
  }, [acAuthorizationUrl, acClientId, acRedirectUri, acScope, acCodeChallengeMethod]);

  // ── PKCE: Exchange Code ───────────────────────────────────────────────────
  const handleExchangeCode = useCallback(async () => {
    if (!acCodeInput.trim()) {
      setAcFlowError('Paste the callback URL or authorization code first');
      return;
    }
    if (!acPkcePair) {
      setAcFlowError('Generate an authorization URL first');
      return;
    }

    const parsed = parseAuthorizationResponse(acCodeInput.trim());

    if (parsed.error) {
      setAcFlowError(`Authorization error: ${parsed.error}${parsed.errorDescription ? ` — ${parsed.errorDescription}` : ''}`);
      setAcFlowStep('error');
      return;
    }

    if (!parsed.code) {
      setAcFlowError('No authorization code found in the pasted value');
      setAcFlowStep('error');
      return;
    }

    // Validate state param to prevent CSRF (only when present in the response)
    if (parsed.state && parsed.state !== acOauthState) {
      setAcFlowError('State mismatch — possible CSRF attack. Do not proceed.');
      setAcFlowStep('error');
      return;
    }

    setAcFlowStep('exchanging');
    setAcFlowError('');

    try {
      const body = new URLSearchParams();
      body.set('grant_type', 'authorization_code');
      body.set('code', parsed.code);
      body.set('redirect_uri', acRedirectUri.trim());
      body.set('code_verifier', acPkcePair.codeVerifier);

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      };

      applyClientAuth(
        acClientAuthMethod as OAuth2ClientAuthMethod,
        acClientId.trim(),
        acClientSecret.trim(),
        body,
        headers
      );

      const response = await fetch(acTokenUrl.trim(), {
        method: 'POST',
        headers,
        body: body.toString(),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        const msg = data.error_description || data.error || `HTTP ${response.status}`;
        setAcFlowError(`Token exchange failed: ${msg}`);
        setAcFlowStep('error');
        return;
      }

      if (!data.access_token) {
        setAcFlowError('Token response missing access_token');
        setAcFlowStep('error');
        return;
      }

      setAcAccessToken(data.access_token);
      setAcRefreshToken(data.refresh_token || '');
      // RFC 6750 §6.1.1: token_type defaults to 'Bearer'
      setAcTokenType(data.token_type || 'Bearer');
      setAcTokenExpiresAt(data.expires_in ? Date.now() + data.expires_in * 1000 : undefined);
      setAcFlowStep('success');
    } catch (err) {
      setAcFlowError(`Network error during token exchange: ${err instanceof Error ? err.message : String(err)}`);
      setAcFlowStep('error');
    }
  }, [acCodeInput, acPkcePair, acOauthState, acRedirectUri, acClientId, acClientSecret, acTokenUrl, acClientAuthMethod]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = () => {
    if (!validateForm()) return;

    const baseAuth = {
      id: auth?.id || `auth-${crypto.randomUUID()}`,
      name: name.trim(),
      enabled: auth?.enabled ?? true,
      domainFilters: domainFilters.split(',').map(d => d.trim()).filter(d => d.length > 0),
      expiryDate: expiryDate || undefined,
    };

    let authData: Auth;

    switch (authType) {
      case AuthType.API_KEY:
        authData = {
          ...baseAuth,
          type: AuthType.API_KEY,
          key: apiKey.trim(),
          value: apiValue,
          sendIn: apiSendIn,
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
        } as DigestAuth;
        break;

      case AuthType.OAUTH2_REFRESH:
        authData = {
          ...baseAuth,
          type: AuthType.OAUTH2_REFRESH,
          tokenUrl: tokenUrl.trim(),
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim() || undefined,
          refreshToken: refreshToken.trim(),
          scope: scope.trim() || undefined,
          clientAuthMethod: clientAuthMethod as OAuth2ClientAuthMethod,
        } as OAuth2RefreshAuth;
        break;

      case AuthType.OAUTH2_CLIENT_CREDENTIALS:
        authData = {
          ...baseAuth,
          type: AuthType.OAUTH2_CLIENT_CREDENTIALS,
          tokenUrl: ccTokenUrl.trim(),
          clientId: ccClientId.trim(),
          clientSecret: ccClientSecret.trim(),
          scope: ccScope.trim() || undefined,
          audience: ccAudience.trim() || undefined,
          clientAuthMethod: ccClientAuthMethod as OAuth2ClientAuthMethod,
        } as OAuth2ClientCredentialsAuth;
        break;

      case AuthType.OAUTH2_AUTHORIZATION_CODE: {
        // Prefer newly exchanged tokens; fall back to existing tokens when editing
        const existingAc = auth?.type === AuthType.OAUTH2_AUTHORIZATION_CODE ? auth : undefined;
        authData = {
          ...baseAuth,
          type: AuthType.OAUTH2_AUTHORIZATION_CODE,
          authorizationUrl: acAuthorizationUrl.trim(),
          tokenUrl: acTokenUrl.trim(),
          clientId: acClientId.trim(),
          clientSecret: acClientSecret.trim() || undefined,
          redirectUri: acRedirectUri.trim(),
          scope: acScope.trim() || undefined,
          codeChallengeMethod: acCodeChallengeMethod as 'S256' | 'plain',
          clientAuthMethod: acClientAuthMethod as OAuth2ClientAuthMethod,
          accessToken: acAccessToken || existingAc?.accessToken,
          refreshToken: acRefreshToken || existingAc?.refreshToken || undefined,
          tokenType: acTokenType || existingAc?.tokenType || undefined,
          tokenExpiresAt: acTokenExpiresAt ?? existingAc?.tokenExpiresAt,
        } as OAuth2AuthorizationCodeAuth;
        break;
      }

      case AuthType.HMAC:
        authData = {
          ...baseAuth,
          type: AuthType.HMAC,
          algorithm: hmacAlgorithm as HmacHashAlgorithm,
          secretKey: hmacSecretKey,
          keyId: hmacKeyId.trim() || undefined,
          signatureTemplate: hmacSignatureTemplate,
          outputEncoding: hmacOutputEncoding as 'hex' | 'base64',
          sendIn: hmacSendIn as 'header' | 'query',
          targetName: hmacTargetName.trim(),
          prefix: hmacPrefix.trim() || undefined,
          timestampHeader: hmacTimestampHeader.trim() || undefined,
          nonceHeader: hmacNonceHeader.trim() || undefined,
        } as HmacAuth;
        break;

      default:
        console.error(`Unsupported auth type: ${authType}`);
        return;
    }

    onSave(authData);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const EyeToggle = ({ show, onToggle, label }: { show: boolean; onToggle: () => void; label: string }) => (
    <button
      type="button"
      onClick={onToggle}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      title={show ? `Hide ${label}` : `Show ${label}`}
    >
      {show ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
    </button>
  );

  const existingAcTokens = isEditing && auth?.type === AuthType.OAUTH2_AUTHORIZATION_CODE && auth.accessToken;

  return (
    <div className="space-y-4">
      {/* Auth Type — only when creating */}
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
              <SelectItem value={AuthType.OAUTH2_REFRESH}>OAuth2 Refresh Token</SelectItem>
              <SelectItem value={AuthType.OAUTH2_CLIENT_CREDENTIALS}>OAuth2 Client Credentials</SelectItem>
              <SelectItem value={AuthType.OAUTH2_AUTHORIZATION_CODE}>OAuth2 Authorization Code (PKCE)</SelectItem>
              <SelectItem value={AuthType.HMAC}>HMAC</SelectItem>
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

      {/* ── API Key ── */}
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
                type={showApiValue ? 'text' : 'password'}
                value={apiValue}
                onChange={(e) => setApiValue(e.target.value)}
                placeholder="Your API key value"
                className="pr-10"
              />
              <EyeToggle show={showApiValue} onToggle={() => setShowApiValue(!showApiValue)} label="value" />
            </div>
            {errors.apiValue && <p className="text-xs text-red-500 mt-1">{errors.apiValue}</p>}
          </div>

          <div>
            <Label htmlFor="apiSendIn">Send In *</Label>
            <Select value={apiSendIn} onValueChange={(v) => setApiSendIn(v as 'header' | 'query')}>
              <SelectTrigger id="apiSendIn" className="mt-1">
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

      {/* ── Basic Auth ── */}
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
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="pr-10"
              />
              <EyeToggle show={showPassword} onToggle={() => setShowPassword(!showPassword)} label="password" />
            </div>
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
          </div>
        </>
      )}

      {/* ── Digest Auth ── */}
      {authType === AuthType.DIGEST && (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Challenge parameters (realm, nonce, algorithm, qop) are negotiated automatically
            from the server's WWW-Authenticate response at request time.
          </p>
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
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="pr-10"
              />
              <EyeToggle show={showPassword} onToggle={() => setShowPassword(!showPassword)} label="password" />
            </div>
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
          </div>
        </>
      )}

      {/* ── OAuth2 Refresh Token ── */}
      {authType === AuthType.OAUTH2_REFRESH && (
        <>
          <div>
            <Label htmlFor="tokenUrl">Token URL *</Label>
            <Input
              id="tokenUrl"
              value={tokenUrl}
              onChange={(e) => setTokenUrl(e.target.value)}
              placeholder="e.g., https://oauth.example.com/token"
              className="mt-1"
            />
            {errors.tokenUrl && <p className="text-xs text-red-500 mt-1">{errors.tokenUrl}</p>}
          </div>

          <div>
            <Label htmlFor="clientId">Client ID *</Label>
            <Input
              id="clientId"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Your OAuth2 client ID"
              className="mt-1"
            />
            {errors.clientId && <p className="text-xs text-red-500 mt-1">{errors.clientId}</p>}
          </div>

          <div>
            <Label htmlFor="clientSecret">Client Secret (Optional)</Label>
            <div className="relative mt-1">
              <Input
                id="clientSecret"
                type={showClientSecret ? 'text' : 'password'}
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="Your OAuth2 client secret"
                className="pr-10"
              />
              <EyeToggle show={showClientSecret} onToggle={() => setShowClientSecret(!showClientSecret)} label="secret" />
            </div>
            <p className="text-xs text-slate-500 mt-1">Required for confidential clients</p>
          </div>

          <div>
            <Label htmlFor="refreshToken">Refresh Token *</Label>
            <div className="relative mt-1">
              <Input
                id="refreshToken"
                type={showRefreshToken ? 'text' : 'password'}
                value={refreshToken}
                onChange={(e) => setRefreshToken(e.target.value)}
                placeholder="Your OAuth2 refresh token"
                className="pr-10"
              />
              <EyeToggle show={showRefreshToken} onToggle={() => setShowRefreshToken(!showRefreshToken)} label="token" />
            </div>
            {errors.refreshToken && <p className="text-xs text-red-500 mt-1">{errors.refreshToken}</p>}
          </div>

          <div>
            <Label htmlFor="scope">Scope (Optional)</Label>
            <Input
              id="scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="e.g., read write profile"
              className="mt-1"
            />
            <p className="text-xs text-slate-500 mt-1">Space-separated list of scopes</p>
          </div>

          <div>
            <Label htmlFor="clientAuthMethod">Client Auth Method *</Label>
            <Select value={clientAuthMethod} onValueChange={(v) => setClientAuthMethod(v as OAuth2ClientAuthMethod)}>
              <SelectTrigger id="clientAuthMethod" className="mt-1">
                <SelectValue placeholder="Select method..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">HTTP Basic (client_secret_basic)</SelectItem>
                <SelectItem value="body">Request Body (client_secret_post)</SelectItem>
              </SelectContent>
            </Select>
            {errors.clientAuthMethod && <p className="text-xs text-red-500 mt-1">{errors.clientAuthMethod}</p>}
            <p className="text-xs text-slate-500 mt-1">How client credentials are sent to the token endpoint.</p>
          </div>
        </>
      )}

      {/* ── OAuth2 Client Credentials ── */}
      {authType === AuthType.OAUTH2_CLIENT_CREDENTIALS && (
        <>
          <div>
            <Label htmlFor="ccTokenUrl">Token URL *</Label>
            <Input
              id="ccTokenUrl"
              value={ccTokenUrl}
              onChange={(e) => setCcTokenUrl(e.target.value)}
              placeholder="e.g., https://auth.example.com/oauth/token"
              className="mt-1"
            />
            {errors.ccTokenUrl && <p className="text-xs text-red-500 mt-1">{errors.ccTokenUrl}</p>}
          </div>

          <div>
            <Label htmlFor="ccClientId">Client ID *</Label>
            <Input
              id="ccClientId"
              value={ccClientId}
              onChange={(e) => setCcClientId(e.target.value)}
              placeholder="Your OAuth2 client ID"
              className="mt-1"
            />
            {errors.ccClientId && <p className="text-xs text-red-500 mt-1">{errors.ccClientId}</p>}
          </div>

          <div>
            <Label htmlFor="ccClientSecret">Client Secret *</Label>
            <div className="relative mt-1">
              <Input
                id="ccClientSecret"
                type={showCcClientSecret ? 'text' : 'password'}
                value={ccClientSecret}
                onChange={(e) => setCcClientSecret(e.target.value)}
                placeholder="Your OAuth2 client secret"
                className="pr-10"
              />
              <EyeToggle show={showCcClientSecret} onToggle={() => setShowCcClientSecret(!showCcClientSecret)} label="secret" />
            </div>
            {errors.ccClientSecret && <p className="text-xs text-red-500 mt-1">{errors.ccClientSecret}</p>}
          </div>

          <div>
            <Label htmlFor="ccClientAuthMethod">Client Auth Method *</Label>
            <Select value={ccClientAuthMethod} onValueChange={(v) => setCcClientAuthMethod(v as OAuth2ClientAuthMethod)}>
              <SelectTrigger id="ccClientAuthMethod" className="mt-1">
                <SelectValue placeholder="Select method..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">HTTP Basic (client_secret_basic)</SelectItem>
                <SelectItem value="body">Request Body (client_secret_post)</SelectItem>
              </SelectContent>
            </Select>
            {errors.ccClientAuthMethod && <p className="text-xs text-red-500 mt-1">{errors.ccClientAuthMethod}</p>}
            <p className="text-xs text-slate-500 mt-1">How client credentials are sent to the token endpoint.</p>
          </div>

          <div>
            <Label htmlFor="ccScope">Scope (Optional)</Label>
            <Input
              id="ccScope"
              value={ccScope}
              onChange={(e) => setCcScope(e.target.value)}
              placeholder="e.g., read:api write:api"
              className="mt-1"
            />
            <p className="text-xs text-slate-500 mt-1">Space-separated list of scopes</p>
          </div>

          <div>
            <Label htmlFor="ccAudience">Audience (Optional)</Label>
            <Input
              id="ccAudience"
              value={ccAudience}
              onChange={(e) => setCcAudience(e.target.value)}
              placeholder="e.g., https://api.example.com"
              className="mt-1"
            />
            <p className="text-xs text-slate-500 mt-1">Resource identifier required by some providers (e.g., Auth0, Azure AD)</p>
          </div>
        </>
      )}

      {/* ── OAuth2 Authorization Code (PKCE) ── */}
      {authType === AuthType.OAUTH2_AUTHORIZATION_CODE && (
        <>
          {/* Step 1 — Configuration */}
          <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3 space-y-3">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Step 1 — Configure</p>

            <div>
              <Label htmlFor="acAuthorizationUrl">Authorization URL *</Label>
              <Input
                id="acAuthorizationUrl"
                value={acAuthorizationUrl}
                onChange={(e) => setAcAuthorizationUrl(e.target.value)}
                placeholder="e.g., https://auth.example.com/authorize"
                className="mt-1"
              />
              {errors.acAuthorizationUrl && <p className="text-xs text-red-500 mt-1">{errors.acAuthorizationUrl}</p>}
            </div>

            <div>
              <Label htmlFor="acTokenUrl">Token URL *</Label>
              <Input
                id="acTokenUrl"
                value={acTokenUrl}
                onChange={(e) => setAcTokenUrl(e.target.value)}
                placeholder="e.g., https://auth.example.com/token"
                className="mt-1"
              />
              {errors.acTokenUrl && <p className="text-xs text-red-500 mt-1">{errors.acTokenUrl}</p>}
            </div>

            <div>
              <Label htmlFor="acClientId">Client ID *</Label>
              <Input
                id="acClientId"
                value={acClientId}
                onChange={(e) => setAcClientId(e.target.value)}
                placeholder="Your OAuth2 client ID"
                className="mt-1"
              />
              {errors.acClientId && <p className="text-xs text-red-500 mt-1">{errors.acClientId}</p>}
            </div>

            <div>
              <Label htmlFor="acClientSecret">Client Secret (Optional)</Label>
              <div className="relative mt-1">
                <Input
                  id="acClientSecret"
                  type={showAcClientSecret ? 'text' : 'password'}
                  value={acClientSecret}
                  onChange={(e) => setAcClientSecret(e.target.value)}
                  placeholder="Leave empty for public clients"
                  className="pr-10"
                />
                <EyeToggle show={showAcClientSecret} onToggle={() => setShowAcClientSecret(!showAcClientSecret)} label="secret" />
              </div>
            </div>

            <div>
              <Label htmlFor="acRedirectUri">Redirect URI *</Label>
              <Input
                id="acRedirectUri"
                value={acRedirectUri}
                onChange={(e) => setAcRedirectUri(e.target.value)}
                placeholder="e.g., https://app.example.com/callback"
                className="mt-1"
              />
              {errors.acRedirectUri && <p className="text-xs text-red-500 mt-1">{errors.acRedirectUri}</p>}
            </div>

            <div>
              <Label htmlFor="acScope">Scope (Optional)</Label>
              <Input
                id="acScope"
                value={acScope}
                onChange={(e) => setAcScope(e.target.value)}
                placeholder="e.g., openid profile email"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="acCodeChallengeMethod">Code Challenge Method *</Label>
              <Select value={acCodeChallengeMethod} onValueChange={(v) => setAcCodeChallengeMethod(v as 'S256' | 'plain')}>
                <SelectTrigger id="acCodeChallengeMethod" className="mt-1">
                  <SelectValue placeholder="Select method..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="S256">S256 (Recommended)</SelectItem>
                  <SelectItem value="plain">plain (Not recommended)</SelectItem>
                </SelectContent>
              </Select>
              {errors.acCodeChallengeMethod && <p className="text-xs text-red-500 mt-1">{errors.acCodeChallengeMethod}</p>}
              <p className="text-xs text-slate-500 mt-1">S256 hashes the code verifier with SHA-256 before sending.</p>
            </div>

            <div>
              <Label htmlFor="acClientAuthMethod">Client Auth Method *</Label>
              <Select value={acClientAuthMethod} onValueChange={(v) => setAcClientAuthMethod(v as OAuth2ClientAuthMethod)}>
                <SelectTrigger id="acClientAuthMethod" className="mt-1">
                  <SelectValue placeholder="Select method..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">HTTP Basic (client_secret_basic)</SelectItem>
                  <SelectItem value="body">Request Body (client_secret_post)</SelectItem>
                </SelectContent>
              </Select>
              {errors.acClientAuthMethod && <p className="text-xs text-red-500 mt-1">{errors.acClientAuthMethod}</p>}
            </div>
          </div>

          {/* Step 2 — Acquire Token */}
          <div className="rounded-md border border-slate-200 dark:border-slate-700 p-3 space-y-3">
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Step 2 — Acquire Token</p>

            {existingAcTokens && acFlowStep === 'idle' && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
                <span>Tokens previously acquired. Re-authorize below to refresh them.</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerateAndOpen}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <ExternalLinkIcon className="h-4 w-4" />
              Generate &amp; Open Authorization URL
            </button>

            {acFlowStep !== 'idle' && (
              <>
                <div>
                  <Label htmlFor="acCodeInput">
                    Paste Callback URL or Authorization Code
                  </Label>
                  <Input
                    id="acCodeInput"
                    value={acCodeInput}
                    onChange={(e) => setAcCodeInput(e.target.value)}
                    placeholder="https://app.example.com/callback?code=...&state=... or bare code"
                    className="mt-1 font-mono text-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleExchangeCode}
                  disabled={acFlowStep === 'exchanging' || acFlowStep === 'success'}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-md border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {acFlowStep === 'exchanging' ? (
                    <LoaderIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCwIcon className="h-4 w-4" />
                  )}
                  Exchange Code for Token
                </button>
              </>
            )}

            {acFlowStep === 'success' && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
                <span>Token acquired successfully. Save to persist.</span>
              </div>
            )}

            {(acFlowStep === 'error' || acFlowError) && (
              <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{acFlowError}</span>
              </div>
            )}

            {errors.acFlow && (
              <p className="text-xs text-red-500">{errors.acFlow}</p>
            )}
          </div>
        </>
      )}

      {/* ── HMAC ── */}
      {authType === AuthType.HMAC && (
        <>
          <div>
            <Label htmlFor="hmacAlgorithm">Algorithm *</Label>
            <Select value={hmacAlgorithm} onValueChange={(v) => setHmacAlgorithm(v as HmacHashAlgorithm)}>
              <SelectTrigger id="hmacAlgorithm" className="mt-1">
                <SelectValue placeholder="Select algorithm..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sha256">HMAC-SHA256 (Recommended)</SelectItem>
                <SelectItem value="sha512">HMAC-SHA512</SelectItem>
                <SelectItem value="sha1">HMAC-SHA1</SelectItem>
                <SelectItem value="md5">HMAC-MD5</SelectItem>
              </SelectContent>
            </Select>
            {errors.hmacAlgorithm && <p className="text-xs text-red-500 mt-1">{errors.hmacAlgorithm}</p>}
          </div>

          <div>
            <Label htmlFor="hmacSecretKey">Secret Key *</Label>
            <div className="relative mt-1">
              <Input
                id="hmacSecretKey"
                type={showHmacSecretKey ? 'text' : 'password'}
                value={hmacSecretKey}
                onChange={(e) => setHmacSecretKey(e.target.value)}
                placeholder="Your HMAC signing key"
                className="pr-10"
              />
              <EyeToggle show={showHmacSecretKey} onToggle={() => setShowHmacSecretKey(!showHmacSecretKey)} label="key" />
            </div>
            {errors.hmacSecretKey && <p className="text-xs text-red-500 mt-1">{errors.hmacSecretKey}</p>}
          </div>

          <div>
            <Label htmlFor="hmacKeyId">Key ID (Optional)</Label>
            <Input
              id="hmacKeyId"
              value={hmacKeyId}
              onChange={(e) => setHmacKeyId(e.target.value)}
              placeholder="e.g., key-v1"
              className="mt-1"
            />
            <p className="text-xs text-slate-500 mt-1">Sent alongside the signature to identify the signing key</p>
          </div>

          <div>
            <Label htmlFor="hmacSignatureTemplate">Signature Template *</Label>
            <textarea
              id="hmacSignatureTemplate"
              value={hmacSignatureTemplate}
              onChange={(e) => setHmacSignatureTemplate(e.target.value)}
              placeholder={`e.g., {method}\n{path}\n{timestamp}`}
              rows={4}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
            />
            {errors.hmacSignatureTemplate && <p className="text-xs text-red-500 mt-1">{errors.hmacSignatureTemplate}</p>}
            <p className="text-xs text-slate-500 mt-1">
              Available placeholders: <code>{'{method}'}</code> <code>{'{url}'}</code> <code>{'{path}'}</code>{' '}
              <code>{'{query}'}</code> <code>{'{host}'}</code> <code>{'{body}'}</code>{' '}
              <code>{'{timestamp}'}</code> <code>{'{nonce}'}</code>
            </p>
          </div>

          <div>
            <Label htmlFor="hmacOutputEncoding">Output Encoding *</Label>
            <Select value={hmacOutputEncoding} onValueChange={(v) => setHmacOutputEncoding(v as 'hex' | 'base64')}>
              <SelectTrigger id="hmacOutputEncoding" className="mt-1">
                <SelectValue placeholder="Select encoding..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hex">Hex</SelectItem>
                <SelectItem value="base64">Base64</SelectItem>
              </SelectContent>
            </Select>
            {errors.hmacOutputEncoding && <p className="text-xs text-red-500 mt-1">{errors.hmacOutputEncoding}</p>}
          </div>

          <div>
            <Label htmlFor="hmacSendIn">Send In *</Label>
            <Select value={hmacSendIn} onValueChange={(v) => setHmacSendIn(v as 'header' | 'query')}>
              <SelectTrigger id="hmacSendIn" className="mt-1">
                <SelectValue placeholder="Select location..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="header">Header</SelectItem>
                <SelectItem value="query">Query Parameter</SelectItem>
              </SelectContent>
            </Select>
            {errors.hmacSendIn && <p className="text-xs text-red-500 mt-1">{errors.hmacSendIn}</p>}
          </div>

          <div>
            <Label htmlFor="hmacTargetName">Target Name *</Label>
            <Input
              id="hmacTargetName"
              value={hmacTargetName}
              onChange={(e) => setHmacTargetName(e.target.value)}
              placeholder="e.g., X-Signature"
              className="mt-1"
            />
            {errors.hmacTargetName && <p className="text-xs text-red-500 mt-1">{errors.hmacTargetName}</p>}
            <p className="text-xs text-slate-500 mt-1">The header name or query parameter name that receives the signature</p>
          </div>

          <div>
            <Label htmlFor="hmacPrefix">Prefix (Optional)</Label>
            <Input
              id="hmacPrefix"
              value={hmacPrefix}
              onChange={(e) => setHmacPrefix(e.target.value)}
              placeholder="e.g., HMAC "
              className="mt-1"
            />
            <p className="text-xs text-slate-500 mt-1">Prepended to the signature value (e.g., "HMAC " → "HMAC abc123")</p>
          </div>

          <div>
            <Label htmlFor="hmacTimestampHeader">Timestamp Header (Optional)</Label>
            <Input
              id="hmacTimestampHeader"
              value={hmacTimestampHeader}
              onChange={(e) => setHmacTimestampHeader(e.target.value)}
              placeholder="e.g., X-Timestamp"
              className="mt-1"
            />
            <p className="text-xs text-slate-500 mt-1">If set, the Unix timestamp used in signing is also sent in this header</p>
          </div>

          <div>
            <Label htmlFor="hmacNonceHeader">Nonce Header (Optional)</Label>
            <Input
              id="hmacNonceHeader"
              value={hmacNonceHeader}
              onChange={(e) => setHmacNonceHeader(e.target.value)}
              placeholder="e.g., X-Nonce"
              className="mt-1"
            />
            <p className="text-xs text-slate-500 mt-1">If set, the random nonce used in signing is also sent in this header</p>
          </div>
        </>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <SecondaryButton size="sm" onClick={onCancel} text="Cancel" icon={<XIcon />} tooltip="Cancel" />
        <PrimaryButton
          size="sm"
          onClick={handleSave}
          text="Save"
          icon={<SaveIcon />}
          tooltip={isEditing ? 'Update auth' : 'Save auth'}
        />
      </div>
    </div>
  );
};

export default AuthWizard;
