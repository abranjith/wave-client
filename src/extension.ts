/**
 * Wave Client - VS Code REST Client Extension
 * 
 * This is the main entry point for the extension.
 * It handles extension activation and webview panel creation.
 */

import * as vscode from 'vscode';
import { MessageHandler } from './handlers';

/**
 * Activates the extension.
 * Called when the extension is first activated.
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('Congratulations, your extension "wave-client" is now active!');

	// Register the main command to open Wave Client
	const openDisposable = vscode.commands.registerCommand('waveclient.open', () => {
		createWebviewPanel(context);
	});

	context.subscriptions.push(openDisposable);
}

/**
 * Creates the webview panel for the Wave Client UI.
 * @param context The extension context
 */
function createWebviewPanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
	const panel = vscode.window.createWebviewPanel(
		'waveClient',
		'Wave Client',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
		}
	);

	// Set up the webview HTML content
	panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

	// Create message handler for webview communication
	const messageHandler = new MessageHandler(panel);

	// Listen for messages from the webview
	panel.webview.onDidReceiveMessage(
		async (message) => {
			await messageHandler.handleMessage(message);
		},
		undefined,
		context.subscriptions
	);

	return panel;
}

/**
 * Generates the HTML content for the webview.
 * @param webview The webview instance
 * @param extensionUri The extension's URI
 * @returns The HTML content string
 */
function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	// Get URIs for the webview bundle and CSS
	const webviewUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'webview.js')
	);
	const cssUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'dist', 'webview', 'index.css')
	);

	return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Wave Client</title>
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'unsafe-eval' 'unsafe-inline' ${webview.cspSource}; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:; connect-src ${webview.cspSource} https: http:;">
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
}

/**
 * Deactivates the extension.
 * Called when the extension is deactivated.
 */
export function deactivate() {}
