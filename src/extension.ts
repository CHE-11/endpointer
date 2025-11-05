// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { RoutesProvider, FrontendCallsProvider } from './routesProvider';
import * as path from 'path';
import * as fs from 'fs';

interface EndpointerConfig {
  frontend: {
    folders_to_include: string[];
    extensions_to_include: string[];
  };
  backend: {
    folders_to_include: string[];
    extensions_to_include: string[];
  };
}

const DEFAULT_CONFIG: EndpointerConfig = {
  frontend: {
    folders_to_include: [],
    extensions_to_include: []
  },
  backend: {
    folders_to_include: [],
    extensions_to_include: []
  }
};

async function loadEndpointerConfig(workspaceFolder: vscode.WorkspaceFolder): Promise<EndpointerConfig> {
  const configPath = path.join(workspaceFolder.uri.fsPath, '.vscode', 'endpointer.json');
  
  try {
    if (!fs.existsSync(configPath)) {
      // Create .vscode directory if it doesn't exist
      const vscodeDir = path.dirname(configPath);
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
      }
      
      // Create default config file
      fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
      console.log('Created default endpointer.json config at', configPath);
      return DEFAULT_CONFIG;
    }
    
    const fileContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(fileContent) as EndpointerConfig;
    
    // Validate config structure
    if (!config.frontend) config.frontend = { extensions_to_include: [], folders_to_include: [] };
    if (!config.backend) config.backend = { folders_to_include: [], extensions_to_include: [] };
    
    return config;
  } catch (error) {
    console.error('Error reading endpointer.json, using defaults:', error);
    return DEFAULT_CONFIG;
  }
} 


export function activate(context: vscode.ExtensionContext) {
  // get the config for the link color and icon
  const config = vscode.workspace.getConfiguration('endpointer');
  const linkColor = config.get('linkColor');
  // Match a single comment line. Do not eat the newline at the end.
  const frontEndRegex = /\/\/\s*ENDPOINTER\s*<frontend>\s*method:\s*"([^"]+)",\s*endpoint:\s*"([^"]+)"/g;

  // --------------------------------------------------------------------------------------------------------------------
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.text = `$(sync~spin) Indexing...`;
  statusBar.tooltip = "Indexing the workspace for endpoints";
  statusBar.hide(); // Initially hidden

  // Register the command that starts indexing
  let indexWorkspaceCommand = vscode.commands.registerCommand('extension.reindexWorkspace', async () => {
    // Ensure there is at least one folder opened in the editor
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      vscode.window.showInformationMessage('No folder open to index.');
      return;
    }

    // Clear the existing matches
    context.globalState.update('backendMatches', []);
    context.globalState.update('frontEndMatches', []);

    // Show status bar item while indexing
    statusBar.show();

    // Perform the indexing operation
    let { backendMatches, frontEndMatches } = await performIndexing(vscode.workspace.workspaceFolders);

    // Sort by HTTP verb
    const verbOrder = ["GET", "POST", "PUT", "PATCH", "DELETE"]
    backendMatches.sort((a: any, b: any) => {
      const aIndex = verbOrder.indexOf(a.method);
      const bIndex = verbOrder.indexOf(b.method);
      return aIndex - bIndex;
    });

    // Save the matches first so downstream consumers (hover/links) see fresh data
    context.globalState.update('backendMatches', backendMatches);
    context.globalState.update('frontEndMatches', frontEndMatches);

    // Recompute decorations with fresh data
    resetDecorations();
    updateDecorations(vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0]);

    console.log('Backend matches: ', backendMatches);
    console.log('Frontend matches: ', frontEndMatches);

    vscode.window.showInformationMessage('Indexing completed. Found ' + backendMatches.length + ' endpoints & ' + frontEndMatches.length + ' frontend calls.');

    routesProvider.refresh();
    frontendCallsProvider.refresh();

    // Hide the status bar item when done
    statusBar.hide();
  });
  
	const routesProvider = new RoutesProvider(vscode.workspace.rootPath || '', context);
	vscode.window.registerTreeDataProvider('endpointer.routes', routesProvider);

	const treeView = vscode.window.createTreeView('endpointer.routes', {
		treeDataProvider: routesProvider
	});

  const frontendCallsProvider = new FrontendCallsProvider(vscode.workspace.rootPath || '', context);
  vscode.window.registerTreeDataProvider('endpointer.frontendCalls', frontendCallsProvider);

  vscode.window.createTreeView('endpointer.frontendCalls', {
    treeDataProvider: frontendCallsProvider
  });

  // Command to open backend route file
  const openBackendRouteCommand = vscode.commands.registerCommand('extension.openBackendRoute', async (openUri: string) => {
    try {
      const { fileUri, line } = parseEndpointerUriString(String(openUri));
      if (typeof line === 'number') {
        await vscode.window.showTextDocument(fileUri, { 
          selection: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 0)) 
        });
      } else {
        await vscode.window.showTextDocument(fileUri);
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to open file: ${e?.message || e}`);
    }
  });

  // Handle selection to show "no frontend calls" message when appropriate
  treeView.onDidChangeSelection(async (e) => {
    if (e.selection.length === 0) return;
    const item = e.selection[0];
    
    // Show message if MethodItem has no frontend calls
    if (item && (item as any).contextValue === 'method') {
      const methodItem = item as any;
      if (methodItem.callCount === 0) {
        vscode.window.showInformationMessage(`No frontend calls found for ${methodItem.method} ${methodItem.endpoint}`);
      }
    }
  });


  // --------------------------------------------------------------------------------------------------------------------
  let pasteBackendDisposable = vscode.commands.registerCommand('extension.pasteBackendEndpointTemplate', async () => {
    const editor = vscode.window.activeTextEditor;
  
    // Call pasteURI and use its output
    const pasteUri = `// ENDPOINTER <backend> method: "GET", endpoint: "/api/endpoint"`
        
    if (!editor) {
      vscode.window.showInformationMessage('No active editor available for pasting.');
      return; // Exit if no editor is open
    }

    editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, pasteUri);
    });
  });

  let pasteFrontendDisposable = vscode.commands.registerCommand('extension.pasteFrontendEndpointTemplate', async () => {
    const editor = vscode.window.activeTextEditor;
  
    // Call pasteURI and use its output
    const pasteUri = `// ENDPOINTER <frontend> method: "GET", endpoint: "/api/endpoint"`
        
    if (!editor) {
      vscode.window.showInformationMessage('No active editor available for pasting.');
      return; // Exit if no editor is open
    }

    editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, pasteUri);
    });
  });

  // --------------------------------------------------------------------------------------------------------------------
  let formatEndpoints = vscode.commands.registerCommand('extension.formatEndpoints', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor available for formatting.');
      return; // Exit if no editor is open
    }

    updateDecorations(editor);
  
  });

  const handleLinkClickCommand = vscode.commands.registerCommand('extension.openEndpoint', async (...args: any[]) => {
    const uriArg = args[0];
    if (!uriArg || uriArg === 'Cannot find matching backend endpoint') {
      vscode.window.showWarningMessage('No URI found to open.');
      return;
    }

    try {
      const { fileUri, line } = parseEndpointerUriString(String(uriArg));
      if (typeof line === 'number') {
        await vscode.window.showTextDocument(fileUri, { selection: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 0)) });
      } else {
        await vscode.window.showTextDocument(fileUri);
      }
    } catch (e: any) {
      vscode.window.showErrorMessage(`Failed to open file: ${e?.message || e}`);
    }
  });
  
  // Copies provided text to the clipboard
  const copyToClipboardCommand = vscode.commands.registerCommand('extension.copyToClipboard', async (text: string) => {
    if (!text) {
      vscode.window.showWarningMessage('No text to copy.');
      return;
    }
    await vscode.env.clipboard.writeText(text);
    vscode.window.setStatusBarMessage('Copied to clipboard', 2000);
  });
  
  // set the link color
  const linkDecorator = vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline', // Underline to indicate a link
    cursor: 'pointer', // Cursor style as a pointer
    color: linkColor ?? '#2da5f2', // Default link color
  });

  function rangeKey(range: vscode.Range) {
    // Generates a unique key for a range object
    return `Range(${range.start.line},${range.start.character},${range.end.line},${range.end.character})`;
  }

  const existingDecorations = new Map();

  function updateDecorations(editor: vscode.TextEditor) {
    if (!editor) {
      vscode.window.showInformationMessage('No active editor available for decoration.');
      return;
    }


    const document = editor.document;
    const text = document.getText();
    // Ensure regex starts from 0 on each run
    frontEndRegex.lastIndex = 0;
    const linkDecorations: vscode.DecorationOptions[] = [];

    let match;
    while ((match = frontEndRegex.exec(text)) !== null) {

      // console.log('Frontend match: ', match);

      const method = match[1];
      const endpoint = match[2];
      // Trim any trailing spaces so underline stops at the last character
      const matchedText = match[0].replace(/[ \t]+$/, '');
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + matchedText.length);
      const range = new vscode.Range(startPos, endPos);
      const key = rangeKey(range);

      // Find the matching API call from the backendMatches based on method and endpoint
      const backendMatches = context.globalState.get('backendMatches', []);
      const matchingBackend = backendMatches.find((backend: any) => backend.method === method && backend.endpoint === endpoint) as any;
      // console.log('Matching backend: ', matchingBackend);
      
      const final_uri = matchingBackend ? matchingBackend.uri : 'Cannot find matching backend endpoint';

      if (existingDecorations.has(key)) {
        // console.log('Decoration already exists for range: ', key);
        continue; // Skip this loop iteration if decoration already exists
      } else {
        // console.log('Decoration does not exist for range: ', key);
      }

      // Encode args as an array so VS Code passes them positionally
      const encodedArg = encodeURIComponent(JSON.stringify([final_uri]));
      // Escape Markdown-special characters in label so underscores/brackets render literally
      const escapedLabel = `Open File: ${String(final_uri)
        .replace(/\\/g, "\\\\")
        .replace(/_/g, "\\_")
        .replace(/\*/g, "\\*")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]")}`;
      const firstLine = new vscode.MarkdownString(`[${escapedLabel}](command:extension.openEndpoint?${encodedArg})`);
      firstLine.isTrusted = true;

      const decoration = {
        range: range,
        hoverMessage: [firstLine],
        // renderOptions: { 
        //   after: {
        //     contentText: showLinkIcon ? '🔗' : '',
        //   }
        // },
        command: 'extension.openEndpoint',
        arguments: [final_uri]
      };

      existingDecorations.set(key, true);
      linkDecorations.push(decoration);
    }
    if (linkDecorations.length > 0) editor.setDecorations(linkDecorator, linkDecorations);
  }

  // Reset stored decorations if necessary, e.g., on document close or window change
  function resetDecorations() {
    existingDecorations.clear();
  }


  // --------------------------------------------------------------------------------------------------------------------
  // Initial update if an editor is active
  if (vscode.window.activeTextEditor) {
    resetDecorations();
    updateDecorations(vscode.window.activeTextEditor);
  }

  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      resetDecorations();
      updateDecorations(editor);
    }
  }, null, context.subscriptions);
  
  vscode.workspace.onDidChangeTextDocument(event => {
    if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
      resetDecorations();
      updateDecorations(vscode.window.activeTextEditor);
    }
  }, null, context.subscriptions);

  // --------------------------------------------------------------------------------------------------------------------

  context.subscriptions.push( pasteBackendDisposable, pasteFrontendDisposable, handleLinkClickCommand, copyToClipboardCommand, indexWorkspaceCommand, statusBar, formatEndpoints, openBackendRouteCommand);

  // Provide real document links so Ctrl+Click jumps directly to the file
  const docLinkProvider = vscode.languages.registerDocumentLinkProvider({ scheme: 'file' }, {
    provideDocumentLinks(doc) {
      const links: vscode.DocumentLink[] = [];
      const text = doc.getText();
      const re = new RegExp(frontEndRegex.source, 'g');
      let m: RegExpExecArray | null;
      const backendMatches = context.globalState.get('backendMatches', [] as any[]);
      while ((m = re.exec(text)) !== null) {
        const method = m[1];
        const endpoint = m[2];
        const matchText = m[0].replace(/[ \t]+$/, '');
        const start = doc.positionAt(m.index);
        const end = doc.positionAt(m.index + matchText.length);
        const range = new vscode.Range(start, end);
        const backend = (backendMatches as any[]).find(b => b.method === method && b.endpoint === endpoint) as any;
        if (!backend) continue; // Only create a link when we know the target
        try {
          const { fileUri } = parseEndpointerUriString(String(backend.uri));
          links.push(new vscode.DocumentLink(range, fileUri));
        } catch {
          // ignore malformed URIs
        }
      }
      return links;
    }
  });
  context.subscriptions.push(docLinkProvider);
}

async function performIndexing(workspaceFolders: any): Promise<any> {
  // Assuming you want to process all folders in the open editor
  const backendMatches = [];
  const frontEndMatches = [];

  // Get the excludeFromIndex from the config (fallback)
  const config = vscode.workspace.getConfiguration('endpointer');
  const excludeFromIndex: string = config.get<string>('excludeFromIndex', '');
  const includeInIndex: string = config.get<string>('includeInIndex', '');
  
  if (!workspaceFolders) {
    // console.log('No workspace folders found.');
    return;
  }

  for (const folder of workspaceFolders) {
    // Load endpointer.json config
    const endpointerConfig = await loadEndpointerConfig(folder);
    
    // Build patterns for frontend and backend
    const frontendPatterns = buildSearchPatterns(
      endpointerConfig.frontend.folders_to_include,
      endpointerConfig.frontend.extensions_to_include
    );
    const backendPatterns = buildSearchPatterns(
      endpointerConfig.backend.folders_to_include,
      endpointerConfig.backend.extensions_to_include
    );

    // Search for backend files
    const backendFiles = await findFilesWithPatterns(backendPatterns, excludeFromIndex, includeInIndex);
    
    for (const file of backendFiles) {
      const document = await vscode.workspace.openTextDocument(file);
      const text = document.getText();
      const backend = /\/\/\s*ENDPOINTER\s*<backend>\s*method:\s*"([^"]*)",\s*endpoint:\s*"([^"]*)"/g;
      let match;

      while ((match = backend.exec(text)) !== null) {
        const line_number = document.positionAt(match.index).line;
        const uri = getFileURI(line_number, document);
        backendMatches.push({ method: match[1], endpoint: match[2], file: document.fileName, uri: uri});
      }
    }

    // Search for frontend files
    const frontendFiles = await findFilesWithPatterns(frontendPatterns, excludeFromIndex, includeInIndex);
    
    for (const file of frontendFiles) {
      const document = await vscode.workspace.openTextDocument(file);
      const text = document.getText();
      const frontend = /\/\/\s*ENDPOINTER\s*<frontend>\s*method:\s*"([^"]+)",\s*endpoint:\s*"([^"]+)"/g;
      let frontMatch;

      while ((frontMatch = frontend.exec(text)) !== null) {
        const line_number = document.positionAt(frontMatch.index).line;
        const uri = getFileURI(line_number, document);
        frontEndMatches.push({ method: frontMatch[1], endpoint: frontMatch[2], file: document.fileName, uri: uri});
      }
    }
  }

  // Return the list of endpoints found
  return { backendMatches, frontEndMatches };
}

function buildSearchPatterns(folders: string[], extensions: string[]): string[] {
  // If both are empty, return empty array to signal "search everything"
  if (folders.length === 0 && extensions.length === 0) {
    return [];
  }

  const patterns: string[] = [];

  // Clean folder paths (remove leading slashes)
  const cleanFolders = folders.map(f => f.startsWith('/') ? f.substring(1) : f);
  
  // Clean extensions (ensure they start with a dot)
  const cleanExtensions = extensions.map(e => e.startsWith('.') ? e : '.' + e);

  // If both folders and extensions are specified
  if (cleanFolders.length > 0 && cleanExtensions.length > 0) {
    for (const folder of cleanFolders) {
      for (const ext of cleanExtensions) {
        patterns.push(`${folder}/**/*${ext}`);
      }
    }
  }
  // If only folders are specified, search all files in those folders
  else if (cleanFolders.length > 0) {
    for (const folder of cleanFolders) {
      patterns.push(`${folder}/**/*`);
    }
  }
  // If only extensions are specified, search everywhere with those extensions
  else if (cleanExtensions.length > 0) {
    for (const ext of cleanExtensions) {
      patterns.push(`**/*${ext}`);
    }
  }

  return patterns;
}

async function findFilesWithPatterns(patterns: string[], excludePattern: string, fallbackIncludePattern: string): Promise<vscode.Uri[]> {
  // If no patterns specified, use fallback or search everything
  if (patterns.length === 0) {
    const includePattern = fallbackIncludePattern || '**/*';
    return await vscode.workspace.findFiles(includePattern, excludePattern);
  }

  // Search with each pattern and deduplicate results
  const filesMap = new Map<string, vscode.Uri>();
  
  for (const pattern of patterns) {
    const files = await vscode.workspace.findFiles(pattern, excludePattern);
    for (const file of files) {
      filesMap.set(file.fsPath, file);
    }
  }

  return Array.from(filesMap.values());
}


function getFileURI(line_number: number, document: vscode.TextDocument): string {
	const path = document.uri.path;
	const config = vscode.workspace.getConfiguration('endpointer');
	const useVSCodeInsiders = config.get('useVSCodeInsiders');
	const protocol = useVSCodeInsiders ? 'vscode-insiders' : 'vscode';

	const url = `${protocol}://file${path}:${line_number}`;

	return url;
};

function parseEndpointerUriString(value: string): { fileUri: vscode.Uri, line?: number } {
  // Accept forms like:
  // - vscode://file/<absolute path>:<line>
  // - vscode-insiders://file/<absolute path>:<line>
  // - <absolute path>:<line>
  // - <absolute path>
  let raw = value.trim();

  const prefixMatch = raw.match(/^(vscode(?:-insiders)?:\/\/file)(.*)$/);
  if (prefixMatch) {
    raw = prefixMatch[2]; // retain leading path with potential leading slash
  }

  // Remove one leading slash if followed by a Windows drive letter
  if (raw.startsWith('/') && /^[A-Za-z]:/.test(raw.slice(1))) {
    raw = raw.slice(1);
  }

  // Separate trailing :line if present (be careful with Windows drive colon)
  const lastColon = raw.lastIndexOf(':');
  let fsPath = raw;
  let line: number | undefined = undefined;
  if (lastColon > 1) {
    const maybeLine = raw.slice(lastColon + 1);
    const parsed = Number(maybeLine);
    if (!Number.isNaN(parsed)) {
      line = parsed;
      fsPath = raw.slice(0, lastColon);
    }
  }

  // Create a file URI from the absolute filesystem path
  const fileUri = vscode.Uri.file(fsPath);
  return { fileUri, line };
}

export function deactivate() {
}

