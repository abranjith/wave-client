/**
 * Wave Client - VS Code REST Client Extension
 * 
 * This is the main entry point for the extension.
 * It handles extension activation and webview panel creation.
 */

import * as vscode from 'vscode';
import { securityService } from './services/SecurityService';

let outputChannel: vscode.OutputChannel | undefined;

function log(message: string): void {
	outputChannel?.appendLine(message);
}

/**
 * Activates the extension.
 * Called when the extension is first activated.
 */
export function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel('Wave Client');
	context.subscriptions.push(outputChannel);
	log('Activating Wave Client extension...');

	try {
		// Initialize SecurityService with VS Code's SecretStorage
		securityService.initialize(context.secrets);

		// Register the main command to open Wave Client
		const openDisposable = vscode.commands.registerCommand('waveclient.open', async () => {
			log('Command received: waveclient.open');
			try {
				await createWebviewPanel(context);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				log(`Failed to open Wave Client webview: ${message}`);
				vscode.window.showErrorMessage(`Wave Client failed to open: ${message}`);
			}
		});

		context.subscriptions.push(openDisposable);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log(`Activation failed: ${message}`);
		vscode.window.showErrorMessage(`Wave Client activation failed: ${message}`);
		throw error;
	}
}

/**
 * Creates the webview panel for the Wave Client UI.
 * @param context The extension context
 */
async function createWebviewPanel(context: vscode.ExtensionContext): Promise<vscode.WebviewPanel> {
	const webviewScriptPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'webview.js');
	const webviewCssPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'index.css');

	try {
		await vscode.workspace.fs.stat(webviewScriptPath);
		await vscode.workspace.fs.stat(webviewCssPath);
	} catch {
		const message = 'Webview assets were not found in dist/webview. Run `pnpm --filter @wave-client/vscode build` and try again.';
		log(message);
		vscode.window.showErrorMessage(`Wave Client: ${message}`);
		throw new Error(message);
	}

	const panel = vscode.window.createWebviewPanel(
		'waveClient',
		'Wave Client',
		vscode.ViewColumn.One,
		{
			enableScripts: true,
			retainContextWhenHidden: true,
			localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist')],
		}
	);

	// Set up the webview HTML content
	panel.webview.html = getWebviewContent(panel.webview, context.extensionUri);

	// Defer heavy handler imports until the panel is explicitly opened.
	const { MessageHandler } = await import('./handlers/MessageHandler');
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
