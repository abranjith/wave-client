/**
 * Wave Client - VS Code REST Client Extension
 * 
 * This is the main entry point for the extension.
 * It handles extension activation and webview panel creation.
 */

import * as vscode from 'vscode';
import { securityService } from './services/SecurityService';
import { MessageHandler } from './handlers/MessageHandler';

let outputChannel: vscode.OutputChannel | undefined;
// Single shared editor panel reused by both the command and the Activity Bar
// launcher, so they always land on the same full-view instance.
let waveClientPanel: vscode.WebviewPanel | undefined;
const WAVE_CLIENT_VIEW_ID = 'wave-client-view';

type WaveClientWebviewHost = vscode.WebviewPanel | vscode.WebviewView;

function log(message: string): void {
	outputChannel?.appendLine(message);
}

/**
 * Provides the Activity Bar sidebar view. The sidebar is too narrow for the
 * full-size app, so it acts as a launcher: it renders a lightweight
 * "Open Wave Client" view and opens (or reveals) the full editor-area panel
 * whenever it becomes visible. Clicking the Activity Bar icon therefore lands
 * on the same full view as the `waveclient.open` command.
 */
class WaveClientViewProvider implements vscode.WebviewViewProvider {
	constructor(private readonly context: vscode.ExtensionContext) {}

	async resolveWebviewView(webviewView: vscode.WebviewView): Promise<void> {
		log('Resolving Wave Client launcher view');
		webviewView.webview.options = getWebviewOptions(this.context);
		webviewView.webview.html = getLauncherContent(webviewView.webview, this.context.extensionUri);

		// Fallback button inside the sidebar opens the full panel on demand.
		webviewView.webview.onDidReceiveMessage(
			async (message) => {
				if (message?.type === 'openWaveClient') {
					await this.openPanel();
				}
			},
			undefined,
			this.context.subscriptions
		);

		// Re-open the panel whenever the user reveals the sidebar again.
		webviewView.onDidChangeVisibility(
			() => {
				if (webviewView.visible) {
					void this.openPanel();
				}
			},
			undefined,
			this.context.subscriptions
		);

		// Open immediately on first resolve (i.e. when the icon is clicked).
		await this.openPanel();
	}

	private async openPanel(): Promise<void> {
		try {
			await createOrShowWaveClientPanel(this.context);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log(`Failed to open Wave Client panel from launcher: ${message}`);
			vscode.window.showErrorMessage(`Wave Client failed to open: ${message}`);
		}
	}
}

/**
 * Activates the extension.
 * Called when the extension is first activated.
 */
export function activate(context: vscode.ExtensionContext) {
	console.log('[Wave Client] activate() called');
	outputChannel = vscode.window.createOutputChannel('Wave Client');
	context.subscriptions.push(outputChannel);
	log('Activating Wave Client extension...');

	try {
		// Initialize SecurityService with VS Code's SecretStorage
		securityService.initialize(context.secrets);

		// Register activity bar webview view provider
		const viewProviderDisposable = vscode.window.registerWebviewViewProvider(
			WAVE_CLIENT_VIEW_ID,
			new WaveClientViewProvider(context),
			{
				webviewOptions: {
					retainContextWhenHidden: true,
				},
			}
		);
		context.subscriptions.push(viewProviderDisposable);
		log(`Registered WebviewViewProvider: ${WAVE_CLIENT_VIEW_ID}`);

		// Register the main command to open Wave Client. Both the command and
		// the Activity Bar launcher open (or reveal) the same shared editor
		// panel, so they always land on the identical full-size view.
		const openDisposable = vscode.commands.registerCommand('waveclient.open', async () => {
			console.log('[Wave Client] waveclient.open command fired');
			log('Command received: waveclient.open');
			try {
				await createOrShowWaveClientPanel(context);
				console.log('[Wave Client] Wave Client panel shown');
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				console.error('[Wave Client] createOrShowWaveClientPanel failed:', message);
				log(`Failed to open Wave Client webview: ${message}`);
				vscode.window.showErrorMessage(`Wave Client failed to open: ${message}`);
			}
		});

		context.subscriptions.push(openDisposable);
		console.log('[Wave Client] activation complete, command registered');
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[Wave Client] Activation failed:', message);
		log(`Activation failed: ${message}`);
		vscode.window.showErrorMessage(`Wave Client activation failed: ${message}`);
		throw error;
	}
}

/**
 * Creates the Wave Client editor panel, or reveals the existing one. A single
 * shared panel instance is reused so the command and the Activity Bar launcher
 * always land on the same full-view editor panel.
 * @param context The extension context
 */
async function createOrShowWaveClientPanel(
	context: vscode.ExtensionContext
): Promise<vscode.WebviewPanel> {
	if (waveClientPanel) {
		waveClientPanel.reveal(vscode.ViewColumn.One);
		return waveClientPanel;
	}

	await ensureWebviewAssets(context);
	const webviewOptions = getWebviewOptions(context);

	const panel = vscode.window.createWebviewPanel(
		'waveClient',
		'Wave Client (Beta)',
		vscode.ViewColumn.One,
		{
			...webviewOptions,
			retainContextWhenHidden: true,
		}
	);
	panel.webview.options = webviewOptions;

	panel.iconPath = {
		light: vscode.Uri.joinPath(
			context.extensionUri,
			'assets',
			'logos',
			'wave-client-logo-light-32.png'
		),
		dark: vscode.Uri.joinPath(
			context.extensionUri,
			'assets',
			'logos',
			'wave-client-logo-dark-32.png'
		),
	};

	waveClientPanel = panel;
	panel.onDidDispose(
		() => {
			waveClientPanel = undefined;
		},
		undefined,
		context.subscriptions
	);

	await initializeWebviewHost(panel, context);

	return panel;
}

function getWebviewOptions(context: vscode.ExtensionContext): vscode.WebviewOptions {
	return {
		enableScripts: true,
		localResourceRoots: [
			vscode.Uri.joinPath(context.extensionUri, 'dist'),
			vscode.Uri.joinPath(context.extensionUri, 'assets'),
		],
	};
}

async function ensureWebviewAssets(context: vscode.ExtensionContext): Promise<void> {
	const webviewScriptPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'webview.js');
	const webviewCssPath = vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview', 'index.css');

	try {
		await vscode.workspace.fs.stat(webviewScriptPath);
		await vscode.workspace.fs.stat(webviewCssPath);
	} catch {
		const message = 'Webview assets were not found in dist/webview. Run `pnpm --filter wave-client-vscode build` and try again.';
		log(message);
		vscode.window.showErrorMessage(`Wave Client: ${message}`);
		throw new Error(message);
	}
}

async function initializeWebviewHost(
	host: WaveClientWebviewHost,
	context: vscode.ExtensionContext
): Promise<void> {
	const webview = host.webview;

	// Set the webview HTML first so the view renders immediately.
	webview.html = getWebviewContent(webview, context.extensionUri);

	// Queue messages the webview sends while the handler is still loading.
	let messageHandler: MessageHandler | null = null;
	const messageQueue: unknown[] = [];

	webview.onDidReceiveMessage(
		async (message) => {
			if (messageHandler) {
				await messageHandler.handleMessage(message);
			} else {
				messageQueue.push(message);
			}
		},
		undefined,
		context.subscriptions
	);

	// Dynamically construct the handler (pulls in lightweight service deps).
	try {
		messageHandler = new MessageHandler(host);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error('[Wave Client] Failed to load MessageHandler:', message);
		log(`Failed to load MessageHandler: ${message}`);
		webview.postMessage({
			type: 'bannerError',
			message: `Extension handler failed to load: ${message}. Try reloading the window.`,
		});
		return;
	}

	// Replay any messages that arrived while loading.
	for (const queued of messageQueue) {
		await messageHandler.handleMessage(queued);
	}
	messageQueue.length = 0;

	// Dispose all active WS/SSE connections when the host is disposed.
	host.onDidDispose(() => {
		messageHandler?.dispose();
	}, undefined, context.subscriptions);
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
	const lightLogoUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'assets', 'logos', 'wave-client-logo-light-32.png')
	);
	const darkLogoUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'assets', 'logos', 'wave-client-logo-dark-32.png')
	);

	return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<link id="wave-client-favicon" rel="icon" type="image/png" href="${lightLogoUri}" data-light="${lightLogoUri}" data-dark="${darkLogoUri}">
			<title>Wave Client (Beta)</title>
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
 * Generates the lightweight launcher HTML shown in the Activity Bar sidebar.
 * The full app lives in the editor panel; this view only invites the user to
 * open it (it also auto-opens the panel when the sidebar becomes visible).
 * @param webview The sidebar webview instance
 * @param extensionUri The extension's URI
 * @returns The launcher HTML content string
 */
function getLauncherContent(webview: vscode.Webview, extensionUri: vscode.Uri): string {
	const lightLogoUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'assets', 'logos', 'wave-client-logo-light.png')
	);
	const darkLogoUri = webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'assets', 'logos', 'wave-client-logo-dark.png')
	);

	return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src ${webview.cspSource};">
			<title>Wave Client</title>
			<style>
				body {
					font-family: var(--vscode-font-family);
					color: var(--vscode-foreground);
					padding: 16px;
					text-align: center;
				}
				img { width: 48px; height: 48px; }
				h3 { margin: 12px 0 4px; font-size: 14px; }
				p {
					color: var(--vscode-descriptionForeground);
					font-size: 12px;
					margin: 0 0 16px;
					line-height: 1.4;
				}
				button {
					width: 100%;
					padding: 6px 12px;
					border: none;
					border-radius: 2px;
					cursor: pointer;
					color: var(--vscode-button-foreground);
					background: var(--vscode-button-background);
					font-size: 13px;
				}
				button:hover { background: var(--vscode-button-hoverBackground); }
			</style>
		</head>
		<body>
			<img id="wave-logo" src="${lightLogoUri}" data-light="${lightLogoUri}" data-dark="${darkLogoUri}" alt="Wave Client" />
			<h3>Wave Client (Beta)</h3>
			<p>Wave Client opens in the editor area for better experience.</p>
			<button id="open-btn">Open Wave Client</button>
			<script>
				const vscode = acquireVsCodeApi();
				document.getElementById('open-btn').addEventListener('click', () => {
					vscode.postMessage({ type: 'openWaveClient' });
				});
			</script>
		</body>
		</html>
	`;
}

/**
 * Deactivates the extension.
 * Called when the extension is deactivated.
 */
export function deactivate() {}
