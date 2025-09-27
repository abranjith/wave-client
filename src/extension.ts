// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
						});
						const elapsedTime = Date.now() - start;
						panel.webview.postMessage({
							type: 'httpResponse',
							response: {
								status: response.status,
								statusText: response.statusText,
								elapsedTime,
								size: response.data ? JSON.stringify(response.data).length : 0,
								headers: response.headers,
								body: typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2),
							}
						});
					} catch (error: any) {
						const elapsedTime = Date.now() - start;
						panel.webview.postMessage({
							type: 'httpResponse',
							response: {
								status: error?.response?.status || 0,
								statusText: error?.response?.statusText || 'Error',
								elapsedTime,
								size: error?.response?.data ? JSON.stringify(error.response.data).length : 0,
								headers: error?.response?.headers || {},
								body: error?.response?.data ? JSON.stringify(error.response.data, null, 2) : error.message,
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

// This method is called when your extension is deactivated
export function deactivate() {}
