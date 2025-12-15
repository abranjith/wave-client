import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import {
    httpService,
    collectionService,
    environmentService,
    historyService,
    cookieService,
    storeService,
    settingsService,
    securityService
} from '../services';

/**
 * Converts a base64 string to a Uint8Array.
 * @param base64 The base64 encoded string
 * @returns The decoded Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Handles messages from the webview and routes them to appropriate services.
 * This class centralizes all webview message handling logic.
 */
export class MessageHandler {
    constructor(private panel: vscode.WebviewPanel) {}

    /**
     * Main message handler - routes messages to appropriate handlers.
     * @param message The message from the webview
     */
    async handleMessage(message: any): Promise<void> {
        switch (message.type) {
            case 'httpRequest':
                await this.handleHttpRequest(message);
                break;
            case 'loadCollections':
                await this.handleLoadCollections();
                break;
            case 'saveRequestToCollection':
                await this.handleSaveRequestToCollection(message);
                break;
            case 'importCollection':
                await this.handleImportCollection(message);
                break;
            case 'exportCollection':
                await this.handleExportCollection(message);
                break;
            case 'loadEnvironments':
                await this.handleLoadEnvironments();
                break;
            case 'saveEnvironment':
                await this.handleSaveEnvironment(message);
                break;
            case 'importEnvironments':
                await this.handleImportEnvironments(message);
                break;
            case 'exportEnvironments':
                await this.handleExportEnvironments();
                break;
            case 'loadHistory':
                await this.handleLoadHistory();
                break;
            case 'saveRequestToHistory':
                await this.handleSaveRequestToHistory(message);
                break;
            case 'downloadResponse':
                await this.handleDownloadResponse(message);
                break;
            case 'loadCookies':
                await this.handleLoadCookies();
                break;
            case 'saveCookies':
                await this.handleSaveCookies(message);
                break;
            case 'loadAuths':
                await this.handleLoadAuths();
                break;
            case 'saveAuths':
                await this.handleSaveAuths(message);
                break;
            case 'loadProxies':
                await this.handleLoadProxies();
                break;
            case 'saveProxies':
                await this.handleSaveProxies(message);
                break;
            case 'loadCerts':
                await this.handleLoadCerts();
                break;
            case 'saveCerts':
                await this.handleSaveCerts(message);
                break;
            case 'loadSettings':
                await this.handleLoadSettings();
                break;
            case 'saveSettings':
                await this.handleSaveSettings(message);
                break;
            // Security/Encryption handlers
            case 'getEncryptionStatus':
                await this.handleGetEncryptionStatus();
                break;
            case 'encryptAllFiles':
                await this.handleEncryptAllFiles();
                break;
            case 'decryptAllFiles':
                await this.handleDecryptAllFiles();
                break;
            case 'reEncryptAllFiles':
                await this.handleReEncryptAllFiles(message);
                break;
            case 'exportRecoveryKey':
                await this.handleExportRecoveryKey();
                break;
            case 'recoverWithKeyFile':
                await this.handleRecoverWithKeyFile(message);
                break;
        }
    }

    // ==================== HTTP Request Handlers ====================

    private async handleHttpRequest(message: any): Promise<void> {
        // Extract the request ID (tab ID) from the message
        // The ID can come from message.id (new format) or message.request.id (legacy)
        const requestId = message.id || message.request?.id || '';
        
        // Ensure the request object has the ID for downstream processing
        const requestWithId = {
            ...message.request,
            id: requestId
        };
        
        try {
            const { response, newCookies } = await httpService.execute(requestWithId);
            
            // Always include the request ID in the response for tab correlation
            this.postMessage({
                type: 'httpResponse',
                response: {
                    ...response,
                    id: requestId  // Ensure ID is always present for concurrency handling
                }
            });

            // Notify webview about updated cookies if any were received
            if (newCookies.length > 0) {
                const allCookies = await cookieService.loadAll();
                this.postMessage({
                    type: 'cookiesLoaded',
                    cookies: allCookies
                });
            }
        } catch (error: any) {
            this.postMessage({
                type: 'httpResponse',
                response: {
                    id: requestId,  // Use extracted requestId for error responses
                    status: 0,
                    statusText: 'Error',
                    elapsedTime: 0,
                    size: 0,
                    headers: {},
                    body: Buffer.from(error.message, 'utf8').toString('base64'),
                }
            });
        }
    }

    // ==================== Collection Handlers ====================

    private async handleLoadCollections(): Promise<void> {
        try {
            const collections = await collectionService.loadAll();
            this.postMessage({
                type: 'collectionsLoaded',
                collections,
                isImport: false
            });
        } catch (error: any) {
            this.postMessage({
                type: 'collectionsError',
                error: error.message
            });
        }
    }

    private async handleSaveRequestToCollection(message: any): Promise<void> {
        try {
            const { requestContent, requestName, collectionFileName, folderPath, newCollectionName } = message.data;
            const savedCollectionFileName = await collectionService.saveRequest(
                requestContent,
                requestName,
                collectionFileName,
                folderPath,
                newCollectionName
            );

            const collection = await collectionService.loadOne(savedCollectionFileName);
            if (collection) {
                this.postMessage({
                    type: 'collectionUpdated',
                    collection: {
                        ...collection,
                        filename: savedCollectionFileName
                    }
                });
                
                this.postMessage({
                    type: 'bannerSuccess',
                    message: `Request "${requestName}" saved successfully`
                });
            }
        } catch (error: any) {
            console.error('Error saving request to collection:', error);
            this.postMessage({
                type: 'collectionRequestSaveError',
                error: error.message
            });
        }
    }

    private async handleImportCollection(message: any): Promise<void> {
        try {
            const { fileName, fileContent, collectionType } = message.data;
            await collectionService.import(fileName, fileContent, collectionType);

            const collections = await collectionService.loadAll();
            this.postMessage({
                type: 'collectionsLoaded',
                collections,
                isImport: true
            });
            
            this.postMessage({
                type: 'bannerSuccess',
                message: `Collection imported successfully: ${fileName}`
            });
        } catch (error: any) {
            this.postMessage({
                type: 'bannerError',
                message: `Failed to import collection: ${error.message}`
            });
        }
    }

    private async handleExportCollection(message: any): Promise<void> {
        try {
            const { fileName, exportFormat = 'wave' } = message.data;
            
            const collection = await collectionService.loadOne(fileName);
            if (!collection) {
                throw new Error(`Collection not found: ${fileName}`);
            }

            // Export the collection to the specified format
            const { content, suggestedFilename } = await collectionService.export(collection, exportFormat);

            // Determine file filter based on format
            const filterLabel = exportFormat === 'postman' ? 'Postman Collection' : 'JSON Files';
            
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', suggestedFilename)),
                filters: { [filterLabel]: ['json'], 'All Files': ['*'] }
            });

            if (uri) {
                const uint8Array = new TextEncoder().encode(content);
                await vscode.workspace.fs.writeFile(uri, uint8Array);

                this.postMessage({
                    type: 'bannerSuccess',
                    message: `Collection exported: ${path.basename(uri.fsPath)}`
                });
            }
        } catch (error: any) {
            this.postMessage({
                type: 'bannerError',
                message: `Failed to export collection: ${error.message}`
            });
        }
    }

    // ==================== Environment Handlers ====================

    private async handleLoadEnvironments(): Promise<void> {
        try {
            const environments = await environmentService.loadAll();
            this.postMessage({
                type: 'environmentsLoaded',
                environments,
                isImport: false
            });
        } catch (error: any) {
            this.postMessage({
                type: 'environmentsError',
                error: error.message
            });
        }
    }

    private async handleSaveEnvironment(message: any): Promise<void> {
        try {
            const envToUpdate = JSON.parse(message.data.environment);
            await environmentService.save(envToUpdate);

            this.postMessage({
                type: 'environmentUpdated',
                environment: envToUpdate
            });
            
            this.postMessage({
                type: 'bannerSuccess',
                message: `Environment "${envToUpdate.name}" saved successfully`
            });
        } catch (error: any) {
            console.error('Error saving environment:', error);
            this.postMessage({
                type: 'environmentsError',
                error: error.message
            });
        }
    }

    private async handleImportEnvironments(message: any): Promise<void> {
        try {
            const { fileContent } = message.data;
            await environmentService.import(fileContent);

            const environments = await environmentService.loadAll();
            this.postMessage({
                type: 'environmentsLoaded',
                environments,
                isImport: true
            });
            
            this.postMessage({
                type: 'bannerSuccess',
                message: 'Environments imported successfully'
            });
        } catch (error: any) {
            this.postMessage({
                type: 'bannerError',
                message: `Failed to import environments: ${error.message}`
            });
        }
    }

    private async handleExportEnvironments(): Promise<void> {
        try {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', 'environments.json')),
                filters: { 'All Files': ['*'] }
            });

            const environments = await environmentService.exportAll();

            if (uri) {
                const jsonString = JSON.stringify(environments, null, 2);
                const uint8Array = new TextEncoder().encode(jsonString);
                await vscode.workspace.fs.writeFile(uri, uint8Array);

                this.postMessage({
                    type: 'bannerSuccess',
                    message: `Environments file saved: ${path.basename(uri.fsPath)}`
                });
            }
        } catch (error: any) {
            this.postMessage({
                type: 'bannerError',
                message: `Failed to save Environments file: ${error.message}`
            });
        }
    }

    // ==================== History Handlers ====================

    private async handleLoadHistory(): Promise<void> {
        try {
            const history = await historyService.loadAll();
            this.postMessage({
                type: 'historyLoaded',
                history
            });
        } catch (error: any) {
            this.postMessage({
                type: 'historyError',
                error: error.message
            });
        }
    }

    private async handleSaveRequestToHistory(message: any): Promise<void> {
        try {
            const { requestContent } = message.data;
            await historyService.save(requestContent);

            // Reload full history
            const history = await historyService.loadAll();
            this.postMessage({
                type: 'historyLoaded',
                history
            });
        } catch (error: any) {
            console.error('Error saving request to history:', error);
            this.postMessage({
                type: 'historyError',
                error: error.message
            });
        }
    }

    // ==================== Download Handler ====================

    private async handleDownloadResponse(message: any): Promise<void> {
        try {
            const { body, fileName } = message.data;
            const bodyBuffer = base64ToUint8Array(body);

            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', fileName)),
                filters: { 'All Files': ['*'] }
            });

            if (uri) {
                await vscode.workspace.fs.writeFile(uri, bodyBuffer);
                this.postMessage({
                    type: 'bannerSuccess',
                    message: `Response file saved: ${path.basename(uri.fsPath)}`
                });
            }
        } catch (error: any) {
            this.postMessage({
                type: 'bannerError',
                message: `Failed to save response file: ${error.message}`
            });
        }
    }

    // ==================== Cookie Handlers ====================

    private async handleLoadCookies(): Promise<void> {
        try {
            const cookies = await cookieService.loadAll();
            this.postMessage({
                type: 'cookiesLoaded',
                cookies
            });
        } catch (error: any) {
            this.postMessage({
                type: 'cookiesError',
                error: error.message
            });
        }
    }

    private async handleSaveCookies(message: any): Promise<void> {
        try {
            const cookies = JSON.parse(message.data.cookies);
            await cookieService.saveAll(cookies);
            this.postMessage({
                type: 'cookiesSaved'
            });
            
            this.postMessage({
                type: 'bannerSuccess',
                message: 'Cookies saved successfully'
            });
        } catch (error: any) {
            console.error('Error saving cookies:', error);
            this.postMessage({
                type: 'cookiesError',
                error: error.message
            });
        }
    }

    // ==================== Auth Handlers ====================

    private async handleLoadAuths(): Promise<void> {
        try {
            const auths = await storeService.loadAuths();
            this.postMessage({
                type: 'authsLoaded',
                auths
            });
        } catch (error: any) {
            this.postMessage({
                type: 'authsError',
                error: error.message
            });
        }
    }

    private async handleSaveAuths(message: any): Promise<void> {
        try {
            const auths = JSON.parse(message.data.auths);
            await storeService.saveAuths(auths);
            this.postMessage({
                type: 'authsSaved'
            });
            
            this.postMessage({
                type: 'bannerSuccess',
                message: 'Authentication profiles saved successfully'
            });
        } catch (error: any) {
            console.error('Error saving auths:', error);
            this.postMessage({
                type: 'authsError',
                error: error.message
            });
        }
    }

    // ==================== Proxy Handlers ====================

    private async handleLoadProxies(): Promise<void> {
        try {
            const proxies = await storeService.loadProxies();
            this.postMessage({
                type: 'proxiesLoaded',
                proxies
            });
        } catch (error: any) {
            this.postMessage({
                type: 'proxiesError',
                error: error.message
            });
        }
    }

    private async handleSaveProxies(message: any): Promise<void> {
        try {
            const proxies = JSON.parse(message.data.proxies);
            await storeService.saveProxies(proxies);
            this.postMessage({
                type: 'proxiesSaved'
            });
            
            this.postMessage({
                type: 'bannerSuccess',
                message: 'Proxy configurations saved successfully'
            });
        } catch (error: any) {
            console.error('Error saving proxies:', error);
            this.postMessage({
                type: 'proxiesError',
                error: error.message
            });
        }
    }

    // ==================== Cert Handlers ====================

    private async handleLoadCerts(): Promise<void> {
        try {
            const certs = await storeService.loadCerts();
            this.postMessage({
                type: 'certsLoaded',
                certs
            });
        } catch (error: any) {
            this.postMessage({
                type: 'certsError',
                error: error.message
            });
        }
    }

    private async handleSaveCerts(message: any): Promise<void> {
        try {
            const certs = JSON.parse(message.data.certs);
            await storeService.saveCerts(certs);
            this.postMessage({
                type: 'certsSaved'
            });
            
            this.postMessage({
                type: 'bannerSuccess',
                message: 'Certificates saved successfully'
            });
        } catch (error: any) {
            console.error('Error saving certs:', error);
            this.postMessage({
                type: 'certsError',
                error: error.message
            });
        }
    }

    // ==================== Settings Handlers ====================

    private async handleLoadSettings(): Promise<void> {
        try {
            const settings = await settingsService.load();
            this.postMessage({
                type: 'settingsLoaded',
                settings
            });
        } catch (error: any) {
            this.postMessage({
                type: 'settingsError',
                error: error.message
            });
        }
    }

    private async handleSaveSettings(message: any): Promise<void> {
        try {
            const settings = JSON.parse(message.data.settings);
            const savedSettings = await settingsService.save(settings);
            this.postMessage({
                type: 'settingsSaved',
                settings: savedSettings
            });
            
            this.postMessage({
                type: 'bannerSuccess',
                message: 'Settings saved successfully'
            });
        } catch (error: any) {
            console.error('Error saving settings:', error);
            this.postMessage({
                type: 'settingsError',
                error: error.message
            });
        }
    }

    // ==================== Security/Encryption Handlers ====================

    /**
     * Gets the current encryption status.
     */
    private async handleGetEncryptionStatus(): Promise<void> {
        try {
            const status = await securityService.getEncryptionStatus();
            this.postMessage({
                type: 'encryptionStatus',
                status
            });
        } catch (error: any) {
            console.error('Error getting encryption status:', error);
            this.postMessage({
                type: 'encryptionError',
                error: error.message
            });
        }
    }

    /**
     * Encrypts all files in the app directory.
     */
    private async handleEncryptAllFiles(): Promise<void> {
        try {
            const result = await securityService.encryptAllFiles();
            this.postMessage({
                type: 'encryptionComplete',
                result
            });
        } catch (error: any) {
            console.error('Error encrypting files:', error);
            this.postMessage({
                type: 'encryptionError',
                error: error.message
            });
        }
    }

    /**
     * Decrypts all files in the app directory.
     */
    private async handleDecryptAllFiles(): Promise<void> {
        try {
            const result = await securityService.decryptAllFiles();
            this.postMessage({
                type: 'decryptionComplete',
                result
            });
        } catch (error: any) {
            console.error('Error decrypting files:', error);
            this.postMessage({
                type: 'encryptionError',
                error: error.message
            });
        }
    }

    /**
     * Re-encrypts all files with a new key after key rotation.
     */
    private async handleReEncryptAllFiles(message: any): Promise<void> {
        try {
            const oldKey = message.data?.oldKey;
            if (!oldKey) {
                throw new Error('Old key is required for re-encryption');
            }
            const result = await securityService.reEncryptAllFiles(oldKey);
            this.postMessage({
                type: 'reEncryptionComplete',
                result
            });
        } catch (error: any) {
            console.error('Error re-encrypting files:', error);
            this.postMessage({
                type: 'encryptionError',
                error: error.message
            });
        }
    }

    /**
     * Exports a recovery key file.
     */
    private async handleExportRecoveryKey(): Promise<void> {
        try {
            // Show save dialog for recovery key file
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(os.homedir(), '.waveclient-key')),
                filters: {
                    'Wave Client Recovery Key': ['waveclient-key']
                },
                saveLabel: 'Export Recovery Key'
            });

            if (!uri) {
                // User cancelled
                this.postMessage({
                    type: 'exportRecoveryKeyCancelled'
                });
                return;
            }

            await securityService.exportRecoveryKey(uri.fsPath);
            this.postMessage({
                type: 'recoveryKeyExported',
                path: uri.fsPath
            });
        } catch (error: any) {
            console.error('Error exporting recovery key:', error);
            this.postMessage({
                type: 'encryptionError',
                error: error.message
            });
        }
    }

    /**
     * Recovers encryption configuration from a recovery key file.
     */
    private async handleRecoverWithKeyFile(message: any): Promise<void> {
        try {
            const recoveryKey = message.data?.recoveryKey;
            if (!recoveryKey) {
                throw new Error('Recovery key value is required');
            }

            // Show open dialog for recovery key file
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'Wave Client Recovery Key': ['waveclient-key']
                },
                openLabel: 'Select Recovery Key File'
            });

            if (!uris || uris.length === 0) {
                // User cancelled
                this.postMessage({
                    type: 'recoveryCancelled'
                });
                return;
            }

            await securityService.recoverWithKeyFile(uris[0].fsPath, recoveryKey);
            this.postMessage({
                type: 'recoveryComplete'
            });
        } catch (error: any) {
            console.error('Error recovering with key file:', error);
            this.postMessage({
                type: 'encryptionError',
                error: error.message
            });
        }
    }

    // ==================== Helper Methods ====================

    /**
     * Posts a message to the webview.
     * @param message The message to post
     */
    private postMessage(message: any): void {
        this.panel.webview.postMessage(message);
    }
}
