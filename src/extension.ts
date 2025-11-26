// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { URL } from 'url';
import * as crypto from 'crypto';
import https from 'https';
import { Environment, Collection, CollectionRequest, ParsedRequest, Cookie, Proxy, Cert, CertType } from './types/collection';
import { convertToBase64 } from './utils/encoding';
import {isUrlInDomains} from './utils/common';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "wave-client" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
		// Register waveclient.open command
		const openDisposable = vscode.commands.registerCommand('waveclient.open', () => {
			const panel = vscode.window.createWebviewPanel(
				'waveClient',
				'Wave Client',
				vscode.ViewColumn.One,
				{
					enableScripts: true,
					retainContextWhenHidden: true,
				}
			);

			// Get URIs for the webview bundle and CSS
			const webviewUri = panel.webview.asWebviewUri(
				vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'webview.js')
			);
			const cssUri = panel.webview.asWebviewUri(
				vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'index.css')
			);

			// HTML for the webview
			panel.webview.html = `
				<!DOCTYPE html>
				<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<title>Wave Client</title>
					<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${panel.webview.cspSource}; script-src 'unsafe-eval' 'unsafe-inline' ${panel.webview.cspSource}; font-src ${panel.webview.cspSource}; img-src ${panel.webview.cspSource} data:; connect-src ${panel.webview.cspSource} https: http:;">
					<link rel="stylesheet" href="${cssUri}">
					<style>
					  html, body, #root { 
						height: 100%; 
						margin: 0; 
						padding: 0; 
						font-family: system-ui, -apple-system, sans-serif;
					  }
					</style>
				</head>
				<body>
					<div id="root"></div>
					<script src="${webviewUri}" type="text/javascript"></script>
				</body>
				</html>
			`;

			// Listen for messages from the webview
			panel.webview.onDidReceiveMessage(async (message) => {
				if (message.type === 'httpRequest') {
					const req = message.request;
					const start = Date.now();
					try {
						// Load cookies and add to headers
						const cookies = await loadCookies();
						const cookieHeader = getCookiesForUrl(cookies, req.url);
						
						const headers = { ...req.headers };
						if (cookieHeader) {
							headers['Cookie'] = cookieHeader;
						}

						const proxy = await getProxyForUrl(req.url);
						const agent = await getHttpsAgentForUrl(req.url);
						const response = await axios({
							method: req.method,
							url: req.url,
							params: new URLSearchParams(req.params),
							headers: headers,
							data: req.body,
							responseType: 'arraybuffer',
							proxy: proxy || undefined,
							httpAgent: agent,
						});
						const elapsedTime = Date.now() - start;

						// Process Set-Cookie headers
						let newCookies: Cookie[] = [];
						const setCookieHeader = response.headers['set-cookie'];
						if (setCookieHeader) {
							const setCookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
							const url = new URL(req.url);
							
							setCookies.forEach(header => {
								const cookie = parseSetCookie(header, url.hostname);
								if (cookie) {
									newCookies.push(cookie);
								}
							});
							
							if (newCookies.length > 0) {
								const updatedCookies = mergeCookies(cookies, newCookies);
								await saveCookies(updatedCookies);
								// Notify webview about updated cookies
								panel.webview.postMessage({
									type: 'cookiesLoaded',
									cookies: updatedCookies
								});
							}
						}
						// Convert ArrayBuffer to base64 for efficient transfer
						const bodyBase64 = convertToBase64(response.data);
						panel.webview.postMessage({
							type: 'httpResponse',
							response: {
								id: req.id,
								status: response.status,
								statusText: response.statusText,
								elapsedTime,
								size: response.data ? response.data.byteLength : 0,
								headers: response.headers,
								body: bodyBase64,
							}
						});
					} catch (error: any) {
						const elapsedTime = Date.now() - start;
						// Convert error response to base64
                        const errorBodyBase64 = error?.response?.data 
                            ? convertToBase64(error.response.data)
                            : Buffer.from(error.message, 'utf8').toString('base64');
                        
                        const errorSize = error?.response?.data 
                            ? (error.response.data.byteLength || Buffer.byteLength(error.response.data) || 0)
                            : Buffer.byteLength(error.message);
						panel.webview.postMessage({
							type: 'httpResponse',
							response: {
								status: error?.response?.status || 0,
								statusText: error?.response?.statusText || 'Error',
								elapsedTime,
								size: errorSize,
								headers: error?.response?.headers || {},
								body: errorBodyBase64,
							}
						});
					}
				} else if (message.type === 'loadCollections') {
					try {
						const collections = await loadCollections();
						panel.webview.postMessage({
							type: 'collectionsLoaded',
							collections
						});
					} catch (error: any) {
						panel.webview.postMessage({
							type: 'collectionsError',
							error: error.message
						});
					}
				} else if (message.type === 'saveRequestToCollection') {
					try {
						const { requestContent, requestName, collectionFileName, folderPath, newCollectionName } = message.data;
						const savedCollectionFileName = await saveRequestToCollection(requestContent, requestName, collectionFileName, folderPath, newCollectionName);

						// Show success message
						vscode.window.showInformationMessage(`Request saved to collection: ${savedCollectionFileName}`);

						const collection = await loadCollection(savedCollectionFileName);
						if (collection) {
							panel.webview.postMessage({
								type: 'collectionUpdated',
								collection: {
									...collection,
									filename: collectionFileName
								}
							});
						}
					} catch (error: any) {
						console.error('Error saving request to collection:', error);
						panel.webview.postMessage({
							type: 'collectionRequestSaveError',
							error: error.message
						});
					}
				} else if (message.type === 'loadEnvironments') {
					try {
						const environments = await loadEnvironments();
						panel.webview.postMessage({
							type: 'environmentsLoaded',
							environments
						});
					} catch (error: any) {
						panel.webview.postMessage({
							type: 'environmentsError',
							error: error.message
						});
					}
				} else if (message.type === 'saveEnvironment') {
					try {
						const envToUpdate = JSON.parse(message.data.environment);
						await saveEnvironment(envToUpdate);

						// Show success message
						vscode.window.showInformationMessage(`Environment saved: ${envToUpdate.name}`);

						panel.webview.postMessage({
							type: 'environmentUpdated',
							environment: envToUpdate
						});
					} catch (error: any) {
						console.error('Error saving environment:', error);
						panel.webview.postMessage({
							type: 'environmentsError',
							error: error.message
						});
					}
				} else if (message.type === 'loadHistory') {
					try {
						const history = await loadHistory();
						panel.webview.postMessage({
							type: 'historyLoaded',
							history
						});
					} catch (error: any) {
						panel.webview.postMessage({
							type: 'historyError',
							error: error.message
						});
					} 
				} else if (message.type === 'saveRequestToHistory') {
					try {
						const { requestContent } = message.data;
						await saveRequestToHistory(requestContent);

						//reload full history
						const history = await loadHistory();
						panel.webview.postMessage({
							type: 'historyLoaded',
							history
						});
					} catch (error: any) {
						console.error('Error saving request to history:', error);
						panel.webview.postMessage({
							type: 'historyError',
							error: error.message
						});
					}
				} else if (message.type === 'downloadResponse') {
					try {
						const { body, fileName, contentType } = message.data;
						const bodyBuffer = base64ToUint8Array(body);
						
						// Show save dialog to user
						const uri = await vscode.window.showSaveDialog({
							defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', fileName)),
							filters: {
								'All Files': ['*']
							}
						});
						
						if (uri) {
							// Write file to selected location
							await vscode.workspace.fs.writeFile(uri, bodyBuffer);
							
							// Show success message
							vscode.window.showInformationMessage(`Response file saved: ${path.basename(uri.fsPath)}`);
						}
					} catch (error: any) {
						vscode.window.showErrorMessage(`Failed to save response file: ${error.message}`);
					}
				} else if (message.type === 'importCollection') {
					// Handle collection import
					try {
						const { fileName, fileContent, collectionType } = message.data;
						
						// Get the collections directory
						const homeDir = os.homedir();
						const collectionsDir = path.join(homeDir, '.waveclient', 'collections');
						
						// Ensure the collections directory exists
						if (!fs.existsSync(collectionsDir)) {
							fs.mkdirSync(collectionsDir, { recursive: true });
						}
						
						// Save the file to the collections directory
						const filePath = path.join(collectionsDir, fileName);
						fs.writeFileSync(filePath, fileContent, 'utf8');
						
						// Show success message
						vscode.window.showInformationMessage(`Collection imported: ${fileName}`);
						
						// Reload collections
						const collections = await loadCollections();
						panel.webview.postMessage({
							type: 'collectionsLoaded',
							collections
						});
					} catch (error: any) {
						vscode.window.showErrorMessage(`Failed to import collection: ${error.message}`);
					}
				} else if (message.type === 'exportCollection') {
					try {
						const { fileName } = message.data;
						const uri = await vscode.window.showSaveDialog({
							defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', fileName)),
							filters: {
								'All Files': ['*']
							}
						});
						const collection = await loadCollection(fileName);
						
						if (uri) {
							const jsonString = JSON.stringify(collection, null, 2);
							const uint8Array = new TextEncoder().encode(jsonString);
							await vscode.workspace.fs.writeFile(uri, uint8Array);
							
							vscode.window.showInformationMessage(`Collection file saved: ${path.basename(uri.fsPath)}`);
						}
					} catch (error: any) {
						vscode.window.showErrorMessage(`Failed to save collection file: ${error.message}`);
					}
				} else if (message.type === 'importEnvironments') {
					try {
						const { fileName, fileContent } = message.data;
						await importEnvironments(fileContent);
						vscode.window.showInformationMessage('Environments imported successfully.');
						
						// Reload environments
						const environments = await loadEnvironments();
						panel.webview.postMessage({
							type: 'environmentsLoaded',
							environments
						});
					} catch (error: any) {
						vscode.window.showErrorMessage(`Failed to import environments: ${error.message}`);
					}
				} else if (message.type === 'exportEnvironments') {
					try {
						// Show save dialog to user
						const uri = await vscode.window.showSaveDialog({
							defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', 'environments.json')),
							filters: {
								'All Files': ['*']
							}
						});
						const environments = await loadEnvironments();
						
						if (uri) {
							const jsonString = JSON.stringify(environments, null, 2);
							const uint8Array = new TextEncoder().encode(jsonString);
							await vscode.workspace.fs.writeFile(uri, uint8Array);
							
							// Show success message
							vscode.window.showInformationMessage(`Environments file saved: ${path.basename(uri.fsPath)}`);
						}
					} catch (error: any) {
						vscode.window.showErrorMessage(`Failed to save Environments file: ${error.message}`);
					}
				} else if (message.type === 'loadHistory') {
					try {
						const history = await loadHistory();
						panel.webview.postMessage({
							type: 'historyLoaded',
							history
						});
					} catch (error: any) {
						panel.webview.postMessage({
							type: 'historyError',
							error: error.message
						});
					}
				} else if (message.type === 'saveRequestToHistory') {
					try {
						const request = message.data.request;
						await saveRequestToHistory(request);
						
						// Reload history to reflect the changes
						const history = await loadHistory();
						panel.webview.postMessage({
							type: 'historyLoaded',
							history
						});
					} catch (error: any) {
						panel.webview.postMessage({
							type: 'historyError',
							error: error.message
						});
					}
				} else if (message.type === 'loadCookies') {
					try {
						const cookies = await loadCookies();
						panel.webview.postMessage({
							type: 'cookiesLoaded',
							cookies
						});
					} catch (error: any) {
						panel.webview.postMessage({
							type: 'cookiesError',
							error: error.message
						});
					}
				} else if (message.type === 'saveCookies') {
					try {
						const cookies = JSON.parse(message.data.cookies);
						await saveCookies(cookies);
						panel.webview.postMessage({
							type: 'cookiesSaved'
						});
					} catch (error: any) {
						console.error('Error saving cookies:', error);
						panel.webview.postMessage({
							type: 'cookiesError',
							error: error.message
						});
					}
				} else if (message.type === 'loadAuths') {
					try {
						const auths = await loadAuths();
						panel.webview.postMessage({
							type: 'authsLoaded',
							auths
						});
					} catch (error: any) {
						panel.webview.postMessage({
							type: 'authsError',
							error: error.message
						});
					}
				} else if (message.type === 'saveAuths') {
					try {
						const auths = JSON.parse(message.data.auths);
						await saveAuths(auths);
						panel.webview.postMessage({
							type: 'authsSaved'
						});
					} catch (error: any) {
						console.error('Error saving auths:', error);
						panel.webview.postMessage({
							type: 'authsError',
							error: error.message
						});
					}
				} else if (message.type === 'loadProxies') {
					try {
						const proxies = await loadProxies();
						panel.webview.postMessage({
							type: 'proxiesLoaded',
							proxies
						});
					} catch (error: any) {
						panel.webview.postMessage({
							type: 'proxiesError',
							error: error.message
						});
					}
				} else if (message.type === 'saveProxies') {
					try {
						const proxies = JSON.parse(message.data.proxies);
						await saveProxies(proxies);
						panel.webview.postMessage({
							type: 'proxiesSaved'
						});
					} catch (error: any) {
						console.error('Error saving proxies:', error);
						panel.webview.postMessage({
							type: 'proxiesError',
							error: error.message
						});
					}
				} else if (message.type === 'loadCerts') {
					try {
						const certs = await loadCerts();
						panel.webview.postMessage({
							type: 'certsLoaded',
							certs
						});
					} catch (error: any) {
						panel.webview.postMessage({
							type: 'certsError',
							error: error.message
						});
					}
				} else if (message.type === 'saveCerts') {
					try {
						const certs = JSON.parse(message.data.certs);
						await saveCerts(certs);
						panel.webview.postMessage({
							type: 'certsSaved'
						});
					} catch (error: any) {
						console.error('Error saving certs:', error);
						panel.webview.postMessage({
							type: 'certsError',
							error: error.message
						});
					}
				} else if (message.type === 'loadSettings') {
					try {
						const settings = await loadSettings();
						panel.webview.postMessage({
							type: 'settingsLoaded',
							settings
						});
					} catch (error: any) {
						panel.webview.postMessage({
							type: 'settingsError',
							error: error.message
						});
					}
				} else if (message.type === 'saveSettings') {
					try {
						const settings = JSON.parse(message.data.settings);
						await saveSettings(settings);
						panel.webview.postMessage({
							type: 'settingsSaved'
						});
					} catch (error: any) {
						console.error('Error saving settings:', error);
						panel.webview.postMessage({
							type: 'settingsError',
							error: error.message
						});
					}
				}
			});
		});
		context.subscriptions.push(openDisposable);
}

/**
 * Loads collections from the default directory (~/.waveclient/collections)
 */
async function loadCollections() {
	const homeDir = os.homedir();
	const collectionsDir = path.join(homeDir, '.waveclient', 'collections');
	
	// Ensure the collections directory exists
	if (!fs.existsSync(collectionsDir)) {
		fs.mkdirSync(collectionsDir, { recursive: true });
		return [];
	}
	
	const collections = [];
	const files = fs.readdirSync(collectionsDir);
	
	for (const file of files) {
		if (path.extname(file).toLowerCase() === '.json') {
			const collection = await loadCollection(file);
			if (collection) {
				collections.push({
					...collection,
					filename: file
				});
			}
		}
	}
	
	return collections;
}

/**
 * Loads a single collection file
 */
async function loadCollection(fileName: string): Promise<Collection | null> {
	const homeDir = os.homedir();
	const collectionsDir = path.join(homeDir, '.waveclient', 'collections');
	const filePath = path.join(collectionsDir, fileName);

	if (!fs.existsSync(filePath)) {
		return null;
	}

	try {
		const fileContent = fs.readFileSync(filePath, 'utf8');
		return JSON.parse(fileContent);
	} catch (error: any) {
		console.error(`Error loading collection ${fileName}:`, error.message);
		return null;
	}
}

/**
 * Saves a collection to the default directory (~/.waveclient/collections)
 * @param fileContent 
 * @param fileName 
 */
async function saveCollection(fileContent: string, fileName: string): Promise<Collection | undefined> {
	const homeDir = os.homedir();
	const collectionsDir = path.join(homeDir, '.waveclient', 'collections');

	// Ensure the collections directory exists
	if (!fs.existsSync(collectionsDir)) {
		fs.mkdirSync(collectionsDir, { recursive: true });
	}

	try {
		// Parse the collection JSON
		const collection = JSON.parse(fileContent) as Collection;
		
		// Save the collection to a file (overwrites if exists, creates if not)
		const filePath = path.join(collectionsDir, fileName);
		fs.writeFileSync(filePath, JSON.stringify(collection, null, 2));
		return collection;
	} catch (error: any) {
		console.error(`Error saving collection ${fileName}:`, error.message);
		throw new Error(`Failed to save collection: ${error.message}`);
	}
}

/**
 * Saves or updates a request in a collection file under the specified folder path
 * @param requestContent The JSON content of the request to save
 * @param requestName The name of the request
 * @param collectionFileName The collection file to save to
 * @param folderPath The folder path within the collection to save the request under
 * @param newCollectionName Optional name for a new collection if the specified one doesn't exist
 */
async function saveRequestToCollection(requestContent: string, requestName: string, collectionFileName: string, folderPath: string[], newCollectionName: string | undefined) : Promise<string> {
	//let collection = await loadCollection(collectionFileName);
	let collection: Collection | null = null;
	let finalCollectionFileName = collectionFileName;

	if (newCollectionName) {
		//create a new collection if it doesn't exist. Use {newCollectionName}.json as the filename and if if exists, append sequence number
		finalCollectionFileName = generateFileNameForCollection(newCollectionName);
		collection = {
			info: {
				name: newCollectionName ? newCollectionName : 'New Collection',
				schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
			},
			item: []
		};
	} else if (collectionFileName) {
        // Load existing collection
        collection = await loadCollection(collectionFileName);
    }

	if(!collection) {
		throw new Error(`Collection file ${collectionFileName} does not exist and no new collection name provided.`);
	}

	// Parse the collection JSON
	const request = JSON.parse(requestContent) as CollectionRequest;

	// Navigate to the correct folder, creating it if necessary
	let items = collection.item;
	for (const folderName of folderPath) {
		let folder = items.find(i => i.name === folderName && i.item);
		if (!folder) {
			// Create the folder if it doesn't exist
			folder = {
				name: folderName,
				item: []
			};
			items.push(folder);
		}
		items = folder.item!;
	}

	// Check if a request with the same name exists in the target folder
	const existingRequestIndex = items.findIndex(i => i.name === requestName && i.request);
	if (existingRequestIndex !== -1) {
		// Overwrite existing request
		items[existingRequestIndex].request = request;
	} else {
		// Add new request
		items.push({
			name: requestName,
			request: request
		});
	}

	// Save the updated collection
	await saveCollection(JSON.stringify(collection), finalCollectionFileName);

	return finalCollectionFileName;
}

function generateFileNameForCollection(newCollectionName: string) {
	const homeDir = os.homedir();
	const collectionsDir = path.join(homeDir, '.waveclient', 'collections');
	let baseFileName = newCollectionName ? newCollectionName : 'New Collection';
	baseFileName = baseFileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
	let fileName = `${baseFileName}.json`;
	let counter = 1;
	while (fs.existsSync(path.join(collectionsDir, fileName))) {
		fileName = `${baseFileName}_${counter}.json`;
		counter++;
		//limit to 100
		if (counter > 100) {
			throw new Error('Unable to generate unique collection filename, please provide a unique name.');
		}
	}
	return fileName;
}

/**
 * Loads environments from the default directory (~/.waveclient/environments)
 */
async function loadEnvironments() {
	const homeDir = os.homedir();
	const environmentsDir = path.join(homeDir, '.waveclient', 'environments');
	const defaultGlobalEnv: Environment = {
			id: 'global',
			name: 'Global',
			values: []
		};
	
	// Ensure the environments directory exists
	if (!fs.existsSync(environmentsDir)) {
		fs.mkdirSync(environmentsDir, { recursive: true });
		return [defaultGlobalEnv];
	}
	
	const environments = [];
	const seenNames = new Set<string>(); // Track environment names to avoid duplicates
	const files = fs.readdirSync(environmentsDir);
	
	for (const file of files) {
		if (path.extname(file).toLowerCase() === '.json') {
			try {
				const filePath = path.join(environmentsDir, file);
				const fileContent = fs.readFileSync(filePath, 'utf8');
				const environmentData = JSON.parse(fileContent);
				
				// Skip if we've already seen an environment with this name
				if (!seenNames.has(environmentData.name)) {
					seenNames.add(environmentData.name);
					environments.push({
						...environmentData,
						filename: file
					});
				} else {
					console.warn(`Skipping duplicate environment name "${environmentData.name}" from file ${file}`);
				}
			} catch (error: any) {
				console.error(`Error loading environment ${file}:`, error.message);
				// Continue loading other environments even if one fails
			}
		}
	}

	if (!seenNames.has(defaultGlobalEnv.name)) {
		environments.unshift(defaultGlobalEnv);
	}
	
	return environments;
}

async function importEnvironments(fileContent: string) {
	const homeDir = os.homedir();
	const environmentsDir = path.join(homeDir, '.waveclient', 'environments');

	// Ensure the environments directory exists
	if (!fs.existsSync(environmentsDir)) {
		fs.mkdirSync(environmentsDir, { recursive: true });
	}

	//allow just a single environment object or an array of environments
	let environments: Environment[] = [];
	if (fileContent.trim().startsWith('[')) {
		environments = JSON.parse(fileContent) as Environment[];
	} else {
		const env = JSON.parse(fileContent) as Environment;
		environments.push(env);
	}

	// Save each environment as a separate file named <environment_name>.json
	// If an environment with the same name exists, it will be overwritten
	// Environment names should be unique
	// Invalid characters in filenames should be replaced with underscores
	// e.g. "My Env/1" -> "My_Env_1.json"
	for (const env of environments) {
		const fileName = sanitizeFileName(env.name);
		const filePath = path.join(environmentsDir, `${fileName}.json`);
		fs.writeFileSync(filePath, JSON.stringify(env, null, 2));
	}
}

async function saveEnvironment(env: Environment) {
	const homeDir = os.homedir();
	const environmentsDir = path.join(homeDir, '.waveclient', 'environments');

	// Ensure the environments directory exists
	if (!fs.existsSync(environmentsDir)) {
		fs.mkdirSync(environmentsDir, { recursive: true });
	}
	const fileName = sanitizeFileName(env.name);
	const filePath = path.join(environmentsDir, `${fileName}.json`);
	fs.writeFileSync(filePath, JSON.stringify(env, null, 2));
}

/**
 * Loads request history from the default directory (~/.waveclient/history)
 */
async function loadHistory(): Promise<ParsedRequest[]> {
	const homeDir = os.homedir();
	const historyDir = path.join(homeDir, '.waveclient', 'history');

	// Ensure the history directory exists
	if (!fs.existsSync(historyDir)) {
		fs.mkdirSync(historyDir, { recursive: true });
		return [];
	}

	const history: (ParsedRequest & { baseFileName: string })[] = [];
	const files = fs.readdirSync(historyDir);

	for (const file of files) {
		if (path.extname(file).toLowerCase() === '.json') {
			try {
				const filePath = path.join(historyDir, file);
				const fileContent = fs.readFileSync(filePath, 'utf8');
				const requestData = JSON.parse(fileContent);
				const baseFileName = path.basename(file, '.json');
				history.push({ ...requestData, baseFileName: baseFileName });
			} catch (error: any) {
				console.error(`Error loading history file ${file}:`, error.message);
			}
		}
	}

	history.sort((a, b) => {
		const aNum = parseInt(a.baseFileName);
		const bNum = parseInt(b.baseFileName);
		return bNum - aNum;
	});

	return history;
}

/**
 * Saves a request to history with sequential numeric filenames
 * Maintains maximum 10 history files and removes duplicates
 * @param request The parsed request to save
 */
async function saveRequestToHistory(requestContent: string): Promise<void> {
	const request = JSON.parse(requestContent) as ParsedRequest;
	const homeDir = os.homedir();
	const historyDir = path.join(homeDir, '.waveclient', 'history');

	// Ensure the history directory exists
	if (!fs.existsSync(historyDir)) {
		fs.mkdirSync(historyDir, { recursive: true });
	}

	// Get all existing history files
	const files = fs.readdirSync(historyDir)
		.filter(file => path.extname(file).toLowerCase() === '.json')
		.map(file => {
			const num = parseInt(path.basename(file, '.json'));
			return { file, num };
		})
		.filter(item => !isNaN(item.num))
		.sort((a, b) => a.num - b.num);

	// Check for duplicate content
	const incomingContent = JSON.stringify({
		method: request.method,
		url: request.url,
		params: request.params,
		headers: request.headers,
		body: request.body
	});

	let duplicateIndex = -1;
	for (let i = 0; i < files.length; i++) {
		try {
			const filePath = path.join(historyDir, files[i].file);
			const fileContent = fs.readFileSync(filePath, 'utf8');
			const existingRequest = JSON.parse(fileContent);
			const existingContent = JSON.stringify({
				method: existingRequest.method,
				url: existingRequest.url,
				params: existingRequest.params,
				headers: existingRequest.headers,
				body: existingRequest.body
			});

			if (incomingContent === existingContent) {
				duplicateIndex = i;
				break;
			}
		} catch (error: any) {
			console.error(`Error reading history file ${files[i].file}:`, error.message);
		}
	}

	// Remove duplicate file if found
	if (duplicateIndex !== -1) {
		const duplicateFile = path.join(historyDir, files[duplicateIndex].file);
		fs.unlinkSync(duplicateFile);
		files.splice(duplicateIndex, 1);
	}

	// Enforce maximum 10 files - remove oldest if at limit
	if (files.length >= 10) {
		const oldestFile = path.join(historyDir, files[0].file);
		fs.unlinkSync(oldestFile);
		files.shift();
	}

	// Renumber all files to maintain sequence (1.json, 2.json, etc.)
	const tempFiles: { oldPath: string; newNum: number }[] = [];
	for (let i = 0; i < files.length; i++) {
		const oldPath = path.join(historyDir, files[i].file);
		const newNum = i + 1;
		if (files[i].num !== newNum) {
			tempFiles.push({ oldPath, newNum });
		}
	}

	// Rename files to temporary names first to avoid conflicts
	const tempRenamed: { tempPath: string; finalPath: string }[] = [];
	for (const item of tempFiles) {
		const tempPath = path.join(historyDir, `temp_${crypto.randomUUID()}_${item.newNum}.json`);
		fs.renameSync(item.oldPath, tempPath);
		tempRenamed.push({
			tempPath,
			finalPath: path.join(historyDir, `${item.newNum}.json`)
		});
	}

	// Rename from temporary names to final sequential names
	for (const item of tempRenamed) {
		fs.renameSync(item.tempPath, item.finalPath);
	}

	// Save the new request with the next available number
	const nextNum = files.length + 1;
	const newFilePath = path.join(historyDir, `${nextNum}.json`);
	//change request id to new id for uniqueness (say user overwrites an existing request)
	request.id = `${request.id}_${Date.now()}_hist_${Math.random().toString(36).substring(2, 8)}`;
	fs.writeFileSync(newFilePath, JSON.stringify(request, null, 2), 'utf8');
}


function sanitizeFileName(name: string): string {
	// Replace characters that are invalid in Windows, Linux, and macOS filesystems
	// Invalid characters: < > : " / \ | ? * and control characters (0-31)
	// Also replace leading/trailing spaces and dots as they can cause issues
	return name
		.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
		.replace(/^[\s.]+|[\s.]+$/g, '_')
		.trim();
};

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Loads cookies from the store directory (~/.waveclient/store/cookies.json)
 */
async function loadCookies() {
    const homeDir = os.homedir();
    const storeDir = path.join(homeDir, '.waveclient', 'store');
    const cookiesFile = path.join(storeDir, 'cookies.json');

    if (!fs.existsSync(cookiesFile)) {
        return [];
    }

    try {
        const fileContent = fs.readFileSync(cookiesFile, 'utf8');
        return JSON.parse(fileContent);
    } catch (error: any) {
        console.error(`Error loading cookies:`, error.message);
        return [];
    }
}

/**
 * Saves cookies to the store directory (~/.waveclient/store/cookies.json)
 */
async function saveCookies(cookies: any[]) {
    const homeDir = os.homedir();
    const storeDir = path.join(homeDir, '.waveclient', 'store');

    // Ensure the store directory exists
    if (!fs.existsSync(storeDir)) {
        fs.mkdirSync(storeDir, { recursive: true });
    }

    const cookiesFile = path.join(storeDir, 'cookies.json');
    fs.writeFileSync(cookiesFile, JSON.stringify(cookies, null, 2));
}

/**
 * Loads auths from the store directory (~/.waveclient/store/auth.json)
 */
async function loadAuths() {
    const homeDir = os.homedir();
    const storeDir = path.join(homeDir, '.waveclient', 'store');
    const authsFile = path.join(storeDir, 'auth.json');

    if (!fs.existsSync(authsFile)) {
        return [];
    }

    try {
        const fileContent = fs.readFileSync(authsFile, 'utf8');
        return JSON.parse(fileContent);
    } catch (error: any) {
        console.error(`Error loading auths:`, error.message);
        return [];
    }
}

/**
 * Saves auths to the store directory (~/.waveclient/store/auth.json)
 */
async function saveAuths(auths: any[]) {
    const homeDir = os.homedir();
    const storeDir = path.join(homeDir, '.waveclient', 'store');

    // Ensure the store directory exists
    if (!fs.existsSync(storeDir)) {
        fs.mkdirSync(storeDir, { recursive: true });
    }

    const authsFile = path.join(storeDir, 'auth.json');
    fs.writeFileSync(authsFile, JSON.stringify(auths, null, 2));
}

/**
 * Loads proxies from the store directory (~/.waveclient/store/proxies.json)
 */
async function loadProxies() {
    const homeDir = os.homedir();
    const storeDir = path.join(homeDir, '.waveclient', 'store');
    const proxiesFile = path.join(storeDir, 'proxies.json');

    if (!fs.existsSync(proxiesFile)) {
        return [];
    }

    try {
        const fileContent = fs.readFileSync(proxiesFile, 'utf8');
        return JSON.parse(fileContent);
    } catch (error: any) {
        console.error(`Error loading proxies:`, error.message);
        return [];
    }
}

/**
 * Saves proxies to the store directory (~/.waveclient/store/proxies.json)
 */
async function saveProxies(proxies: any[]) {
    const homeDir = os.homedir();
    const storeDir = path.join(homeDir, '.waveclient', 'store');

    // Ensure the store directory exists
    if (!fs.existsSync(storeDir)) {
        fs.mkdirSync(storeDir, { recursive: true });
    }

    const proxiesFile = path.join(storeDir, 'proxies.json');
    fs.writeFileSync(proxiesFile, JSON.stringify(proxies, null, 2));
}

/**
 * Loads certs from the store directory (~/.waveclient/store/certs.json)
 */
async function loadCerts() {
    const homeDir = os.homedir();
    const storeDir = path.join(homeDir, '.waveclient', 'store');
    const certsFile = path.join(storeDir, 'certs.json');

    if (!fs.existsSync(certsFile)) {
        return [];
    }

    try {
        const fileContent = fs.readFileSync(certsFile, 'utf8');
        return JSON.parse(fileContent);
    } catch (error: any) {
        console.error(`Error loading certs:`, error.message);
        return [];
    }
}

/**
 * Saves certs to the store directory (~/.waveclient/store/certs.json)
 */
async function saveCerts(certs: any[]) {
    const homeDir = os.homedir();
    const storeDir = path.join(homeDir, '.waveclient', 'store');

    // Ensure the store directory exists
    if (!fs.existsSync(storeDir)) {
        fs.mkdirSync(storeDir, { recursive: true });
    }

    const certsFile = path.join(storeDir, 'certs.json');
    fs.writeFileSync(certsFile, JSON.stringify(certs, null, 2));
}

/**
 * Default settings configuration
 */
interface AppSettings {
    saveFilesLocation: string;
    maxRedirects: number;
    requestTimeoutSeconds: number;
    maxHistoryItems: number;
    commonHeaderNames: string[];
    encryptionKeyEnvVar: string;
    ignoreCertificateValidation: boolean;
}

function getDefaultSettings(): AppSettings {
    const homeDir = os.homedir();
    return {
        saveFilesLocation: path.join(homeDir, '.waveclient'),
        maxRedirects: 5,
        requestTimeoutSeconds: 0,
        maxHistoryItems: 10,
        commonHeaderNames: [],
        encryptionKeyEnvVar: 'WAVECLIENT_SECRET_KEY',
        ignoreCertificateValidation: false,
    };
}

/**
 * Loads settings from the settings file (~/.waveclient/settings.json)
 * Always stored in homeDir/.waveclient to avoid data loss
 */
async function loadSettings(): Promise<AppSettings> {
    const homeDir = os.homedir();
    const waveclientDir = path.join(homeDir, '.waveclient');
    const settingsFile = path.join(waveclientDir, 'settings.json');

    // Ensure the waveclient directory exists
    if (!fs.existsSync(waveclientDir)) {
        fs.mkdirSync(waveclientDir, { recursive: true });
    }

    // Return default settings if file doesn't exist
    if (!fs.existsSync(settingsFile)) {
        return getDefaultSettings();
    }

    try {
        const fileContent = fs.readFileSync(settingsFile, 'utf8');
        const savedSettings = JSON.parse(fileContent);
        // Merge with defaults to ensure all properties exist
        return { ...getDefaultSettings(), ...savedSettings };
    } catch (error: any) {
        console.error(`Error loading settings:`, error.message);
        return getDefaultSettings();
    }
}

/**
 * Saves settings to the settings file (~/.waveclient/settings.json)
 * Always stored in homeDir/.waveclient to avoid data loss
 */
async function saveSettings(settings: AppSettings): Promise<void> {
    const homeDir = os.homedir();
    const waveclientDir = path.join(homeDir, '.waveclient');

    // Ensure the waveclient directory exists
    if (!fs.existsSync(waveclientDir)) {
        fs.mkdirSync(waveclientDir, { recursive: true });
    }

    const settingsFile = path.join(waveclientDir, 'settings.json');
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
}

/**
 * Helper functions for Cookie management
 */

function getCookiesForUrl(cookies: Cookie[], urlStr: string): string {
    try {
        const url = new URL(urlStr);
        const now = new Date();
        
        const validCookies = cookies.filter(cookie => {
            if (!cookie.enabled) {
                return false;
            }
            
            // Check expiration
            if (cookie.expires) {
                const expiresDate = new Date(cookie.expires);
                if (expiresDate < now) {
                    return false;
                }
            }
            
            // Check domain
			if(!isUrlInDomains(urlStr, [cookie.domain])) {
				return false;
			}
            
            // Check path
			if(Boolean(cookie.path) && cookie.path !== '/') {
				if (!url.pathname.startsWith(cookie.path)) {
					return false;
				}
			}
            
            // Check secure
            if (cookie.secure && url.protocol !== 'https:') {
                return false;
            }
            
            return true;
        });
        
        return validCookies.map(c => `${c.name}=${c.value}`).join('; ');
    } catch (e) {
        console.error('Error processing cookies for URL:', e);
        return '';
    }
}

function parseSetCookie(header: string, defaultDomain: string): Cookie | null {
    const parts = header.split(';').map(p => p.trim());
    if (parts.length === 0) {
        return null;
    }
    
    const [nameValue, ...attributes] = parts;
    const separatorIndex = nameValue.indexOf('=');
    if (separatorIndex === -1) {
        return null;
    }
    
    const name = nameValue.substring(0, separatorIndex);
    const value = nameValue.substring(separatorIndex + 1);
    
    const cookie: Cookie = {
        id: crypto.randomUUID(),
        name,
        value,
        domain: defaultDomain,
        path: '/',
        httpOnly: false,
        secure: false,
        enabled: true
    };
    
    for (const attr of attributes) {
        const lowerAttr = attr.toLowerCase();
        if (lowerAttr.startsWith('domain=')) {
            cookie.domain = attr.substring(7);
        } else if (lowerAttr.startsWith('path=')) {
            cookie.path = attr.substring(5);
        } else if (lowerAttr.startsWith('expires=')) {
            try {
                const date = new Date(attr.substring(8));
                if (!isNaN(date.getTime())) {
                    cookie.expires = date.toISOString();
                }
            } catch (e) {}
        } else if (lowerAttr.startsWith('max-age=')) {
             const maxAge = parseInt(attr.substring(8));
             if (!isNaN(maxAge)) {
                 const date = new Date();
                 date.setSeconds(date.getSeconds() + maxAge);
                 cookie.expires = date.toISOString();
             }
        } else if (lowerAttr === 'secure') {
            cookie.secure = true;
        } else if (lowerAttr === 'httponly') {
            cookie.httpOnly = true;
        }
    }
    
    return cookie;
}

function mergeCookies(existingCookies: Cookie[], newCookies: Cookie[]): Cookie[] {
    let result = [...existingCookies];
    const now = new Date();

    for (const newCookie of newCookies) {
        // Check if new cookie is expired (deletion)
        let isExpired = false;
        if (newCookie.expires) {
             const expiresDate = new Date(newCookie.expires);
             if (expiresDate < now) {
                 isExpired = true;
             }
        }

        const index = result.findIndex(c => 
            c.name === newCookie.name && 
            c.domain === newCookie.domain && 
            c.path === newCookie.path
        );
        
        if (isExpired) {
            if (index !== -1) {
                result.splice(index, 1);
            }
        } else {
            if (index !== -1) {
                newCookie.id = result[index].id;
                newCookie.enabled = result[index].enabled; 
                result[index] = newCookie;
            } else {
                result.push(newCookie);
            }
        }
    }
    return result;
}

/**
 * Axios proxy configuration interface
 */
interface AxiosProxyConfig {
    protocol?: string;
    host: string;
    port: number;
    auth?: {
        username: string;
        password: string;
    };
}

/**
 * getProxyForUrl - Load proxies and get matching proxy for given URL accounting for enabled status, domain filter and exclude filter
 * Returns proxy configuration in the format expected by axios
 */
async function getProxyForUrl(urlStr: string): Promise<AxiosProxyConfig | null> {
    try {
        // Load all proxies
        const proxies = await loadProxies();
        
        // Filter for enabled proxies only
        const enabledProxies = proxies.filter((proxy: Proxy) => proxy.enabled);
        
        // Find the first proxy that matches the URL
        for (const proxy of enabledProxies) {
            // Check if URL is in exclude list - if so, skip this proxy
            if (proxy.excludeDomains && proxy.excludeDomains.length > 0) {
                if (isUrlInDomains(urlStr, proxy.excludeDomains)) {
                    continue; // This proxy explicitly excludes this domain
                }
            }
            
            // Check if URL matches domain filters
            // If domainFilters is empty, proxy applies to all domains (unless excluded)
            if (!proxy.domainFilters || proxy.domainFilters.length === 0) {
                return parseProxyConfig(proxy); // First enabled proxy with no domain filter wins
            }
            
            // Check if URL is in the domain filters
            if (isUrlInDomains(urlStr, proxy.domainFilters)) {
                return parseProxyConfig(proxy); // Found a matching proxy
            }
        }
        
        // No matching proxy found
        return null;
    } catch (error: any) {
        console.error('Error getting proxy for URL:', error);
        return null;
    }
}

/**
 * Parse proxy URL and credentials into axios proxy config format
 * @param proxy The proxy object from store
 * @returns Axios-compatible proxy configuration
 */
function parseProxyConfig(proxy: Proxy): AxiosProxyConfig | null {
    try {
        const proxyUrl = new URL(proxy.url);
        
        const config: AxiosProxyConfig = {
            protocol: proxyUrl.protocol.replace(':', ''), // Remove trailing colon
            host: proxyUrl.hostname,
            port: parseInt(proxyUrl.port) || (proxyUrl.protocol === 'https:' ? 443 : 80)
        };
        
        // Add authentication if provided
        if (proxy.userName && proxy.password) {
            config.auth = {
                username: proxy.userName,
                password: proxy.password
            };
        }
        
        return config;
    } catch (error: any) {
        console.error('Error parsing proxy config:', error);
        return null;
    }
}

/**
 * function to return https Agent with cert configured for the given URL if a matching cert is found
 */
async function getHttpsAgentForUrl(urlStr: string): Promise<https.Agent | null> {
	try {
		const url = new URL(urlStr);
		if (url.protocol !== 'https:') {
			return null; // Only HTTPS URLs need certs
		}
		const certs = await loadCerts() as Cert[];
		for (const cert of certs) {
			if(!cert.enabled){
				continue;
			}
			if(!isUrlInDomains(urlStr, cert.domainFilters)) {
				continue;
			}
			//check for expiration
			if (cert.expiryDate) {
				const expiresDate = new Date(cert.expiryDate);
				const now = new Date();
				if (expiresDate < now) {
					continue; // Skip expired certs
				}
			}
			if (cert.type === CertType.CA) {
				// CA type certs only set the 'ca' field
				const httpsAgent = new https.Agent({
					ca: cert.certFile,
					passphrase: cert.passPhrase,
				});
				return httpsAgent;
			}
			const httpsAgent = new https.Agent({
				cert: cert.certFile,
				key: cert.keyFile,
				pfx: cert.pfxFile,
				passphrase: cert.passPhrase,
			});
			return httpsAgent;
		}
		return null;
	} catch (error: any) {
		console.error('Error getting HTTPS agent for URL:', error);
		return null;
	}
}

function getAppDir(settings? : AppSettings): string {
	const saveLocation = settings?.saveFilesLocation || '';
	const homeDir = os.homedir();
	if(!saveLocation || saveLocation.trim() === '') {
		return path.join(homeDir, '.waveclient');
	}
	if (path.isAbsolute(saveLocation)) {
		return saveLocation;
	} else {
		return path.join(homeDir, saveLocation);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
