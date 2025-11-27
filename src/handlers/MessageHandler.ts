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
    settingsService
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
        }
    }

    // ==================== HTTP Request Handlers ====================

    private async handleHttpRequest(message: any): Promise<void> {
        try {
            const { response, newCookies } = await httpService.execute(message.request);
            
            this.postMessage({
                type: 'httpResponse',
                response
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
                collections
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
            const { fileName, fileContent } = message.data;
            await collectionService.import(fileName, fileContent);

            const collections = await collectionService.loadAll();
            this.postMessage({
                type: 'collectionsLoaded',
                collections
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to import collection: ${error.message}`);
        }
    }

    private async handleExportCollection(message: any): Promise<void> {
        try {
            const { fileName } = message.data;
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', fileName)),
                filters: { 'All Files': ['*'] }
            });

            const collection = await collectionService.loadOne(fileName);

            if (uri && collection) {
                const jsonString = JSON.stringify(collection, null, 2);
                const uint8Array = new TextEncoder().encode(jsonString);
                await vscode.workspace.fs.writeFile(uri, uint8Array);

                vscode.window.showInformationMessage(`Collection file saved: ${path.basename(uri.fsPath)}`);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to save collection file: ${error.message}`);
        }
    }

    // ==================== Environment Handlers ====================

    private async handleLoadEnvironments(): Promise<void> {
        try {
            const environments = await environmentService.loadAll();
            this.postMessage({
                type: 'environmentsLoaded',
                environments
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
                environments
            });
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to import environments: ${error.message}`);
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

                vscode.window.showInformationMessage(`Environments file saved: ${path.basename(uri.fsPath)}`);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to save Environments file: ${error.message}`);
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

                vscode.window.showInformationMessage(`Response file saved: ${path.basename(uri.fsPath)}`);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to save response file: ${error.message}`);
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
            await settingsService.save(settings);
            this.postMessage({
                type: 'settingsSaved'
            });
        } catch (error: any) {
            console.error('Error saving settings:', error);
            this.postMessage({
                type: 'settingsError',
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
