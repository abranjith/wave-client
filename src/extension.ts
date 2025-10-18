// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Environment } from './types/collection';

/**
 * Converts various data types to base64 string for safe transfer to webview
 */
function convertToBase64(data: any): string {
    // Handle binary data types
    if (data instanceof ArrayBuffer) {
        return Buffer.from(data).toString('base64');
    }
    
    if (Buffer.isBuffer(data)) {
        // Node.js Buffer (which is a Uint8Array subclass)
        return data.toString('base64');
    }
    
    if (data instanceof Uint8Array) {
        return Buffer.from(data).toString('base64');
    }
    
    // Handle string data
    if (typeof data === 'string') {
        return Buffer.from(data, 'utf8').toString('base64');
    }
    
    // Handle objects (JSON, etc.)
    if (data && typeof data === 'object') {
        try {
            return Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
        } catch (error) {
            // Fallback for objects that can't be stringified
            return Buffer.from('[Object: Unable to serialize]', 'utf8').toString('base64');
        }
    }
    
    // Fallback for any other type
    return Buffer.from(String(data), 'utf8').toString('base64');
}

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
					  /* Override VS Code's theme variables */
					  #root {
						--vscode-foreground: initial;
						--vscode-background: initial;
					  }
					</style>
				</head>
				<body class="light">
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
						const response = await axios({
							method: req.method,
							url: req.url,
							params: new URLSearchParams(req.params),
							headers: req.headers,
							data: req.body,
							responseType: 'arraybuffer'
						});
						const elapsedTime = Date.now() - start;
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
				} else if (message.type === 'downloadResponse') {
					// Handle file download from webview
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
							vscode.window.showInformationMessage(`File saved: ${path.basename(uri.fsPath)}`);
						}
					} catch (error: any) {
						vscode.window.showErrorMessage(`Failed to save file: ${error.message}`);
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
				}
				else if (message.type === 'importEnvironments') {
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
			try {
				const filePath = path.join(collectionsDir, file);
				const fileContent = fs.readFileSync(filePath, 'utf8');
				const collectionData = JSON.parse(fileContent);
				
				// Add filename to the collection data
				collections.push({
					...collectionData,
					filename: file
				});
			} catch (error: any) {
				console.error(`Error loading collection ${file}:`, error.message);
				// Continue loading other collections even if one fails
			}
		}
	}
	
	return collections;
}

/**
 * Loads environments from the default directory (~/.waveclient/environments)
 */
async function loadEnvironments() {
	const homeDir = os.homedir();
	const environmentsDir = path.join(homeDir, '.waveclient', 'environments');
	
	// Ensure the environments directory exists
	if (!fs.existsSync(environmentsDir)) {
		fs.mkdirSync(environmentsDir, { recursive: true });
		return [];
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
	
	return environments;
}

//update this function to accept json content and save to the default directory (~/.waveclient/environments)
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
	const sanitizeFileName = (name: string) => {
		return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
	};

	for (const env of environments) {
		const filePath = path.join(environmentsDir, `${env.name}.json`);
		fs.writeFileSync(filePath, JSON.stringify(env, null, 2));
	}
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// This method is called when your extension is deactivated
export function deactivate() {}
