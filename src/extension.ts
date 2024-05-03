// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { RoutesProvider } from './routesProvider';
 


export function activate(context: vscode.ExtensionContext) {
  // get the config for the link color and icon
  const config = vscode.workspace.getConfiguration('endpointer');
  const linkColor = config.get('linkColor');
  // const showLinkIcon = config.get('showLinkIcon');
  const endpointRegexCall = config.get('endpointRegex') as string;
  const endpointRegex = new RegExp(endpointRegexCall, 'g');
  const frontEndRegex = /^\/\/\s*ENDPOINTER\s*<frontend>\s*method:\s*"([^"]+)",\s*endpoint:\s*"([^"]+)"\s*$/gm;


  // Register the tree view
  const rootPath =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;
    vscode.window.registerTreeDataProvider(
      'endpointer',
      new RoutesProvider(rootPath ?? '', context)
    );

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


    // Save the matches to the global scope for later use
    context.globalState.update('backendMatches', backendMatches);
    context.globalState.update('frontEndMatches', frontEndMatches);

    console.log('Backend matches: ', backendMatches);
    console.log('Frontend matches: ', frontEndMatches);

    vscode.window.showInformationMessage('Indexing completed. Found ' + backendMatches.length + ' endpoints & ' + frontEndMatches.length + ' frontend calls.');

    routesProvider.refresh();

    // Hide the status bar item when done
    statusBar.hide();
  });
  
  const routesProvider = new RoutesProvider(vscode.workspace.rootPath || '', context);
  vscode.window.registerTreeDataProvider('endpointer', routesProvider);

  vscode.window.createTreeView('endpointer', {
    treeDataProvider: routesProvider
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

  const handleLinkClickCommand = vscode.commands.registerCommand('extension.openEndpoint', uri => {

    if (!uri || uri == 'Cannot find matching backend endpoint') {
      vscode.window.showWarningMessage('No URI found to open.');
      return;
    }
    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(uri));
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
    console.log('Updating decorations...')
    if (!editor) {
      vscode.window.showInformationMessage('No active editor available for decoration.');
      return;
    }

    const document = editor.document;
    const text = document.getText();
    const linkDecorations: vscode.DecorationOptions[] = [];

    let match;
    while ((match = frontEndRegex.exec(text)) !== null) {

      console.log('Frontend match: ', match);

      const uri = match[1];
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);
      const key = rangeKey(range);

      const method = match[1];
      const endpoint = match[2];

      // Find the matching API call from the backendMatches based on method and endpoint
      const backendMatches = context.globalState.get('backendMatches', []);
      const matchingBackend = backendMatches.find((backend: any) => backend.method === method && backend.endpoint === endpoint) as any;
      console.log('Matching backend: ', matchingBackend);
      
      const final_uri = matchingBackend ? matchingBackend.uri : 'Cannot find matching backend endpoint';

      if (existingDecorations.has(key)) {
        // console.log('Decoration already exists for range: ', key);
        continue; // Skip this loop iteration if decoration already exists
      } else {
        // console.log('Decoration does not exist for range: ', key);
      }

      const messageMarkdown = new vscode.MarkdownString(`[Open File: ${final_uri}](command:extension.openEndpoint?${encodeURIComponent(JSON.stringify(final_uri))})`);
      messageMarkdown.supportHtml = true;
      messageMarkdown.isTrusted = true;

      const decoration = {
        range: range,
        hoverMessage: messageMarkdown,
        // renderOptions: { 
        //   after: {
        //     contentText: showLinkIcon ? '🔗' : '',
        //   }
        // },
        command: 'extension.openEndpoint',
        arguments: [uri]
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

  context.subscriptions.push( pasteBackendDisposable, pasteFrontendDisposable, handleLinkClickCommand, indexWorkspaceCommand, statusBar, formatEndpoints);
}

async function performIndexing(workspaceFolders: any): Promise<any> {
  // Assuming you want to process all folders in the open editor
  const backendMatches = [];
  const frontEndMatches = [];

  for (const folder of workspaceFolders) {
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, '**/*'), '**/node_modules/**');

    for (const file of files) {
      const document = await vscode.workspace.openTextDocument(file);
      const text = document.getText();
      const backend = /\/\/\s*ENDPOINTER\s*<backend>\s*method:\s*"([^"]*)",\s*endpoint:\s*"([^"]*)"/g;
      let match;
      // console log the file path
      console.log(`File path: ${document.fileName}`);

      while ((match = backend.exec(text)) !== null) {
        // Get the line number where the match was found
        const line_number = document.positionAt(match.index).line;

        const uri = getFileURI(line_number, document);
        // console.log(`Found method: ${match[1]}, endpoint: ${match[2]}, file: ${document.fileName}`);
        // Process or store these matches as needed
        backendMatches.push({ method: match[1], endpoint: match[2], file: document.fileName, uri: uri});
      }

      const frontend = /\/\/\s*ENDPOINTER\s*<frontend>\s*([^]*)/g;
      let frontMatch;
      while ((frontMatch = frontend.exec(text)) !== null) {
        // console.log(`Found frontend call: ${frontMatch[1]}, file: ${document.fileName}`);
        // Process or store these matches as needed
        const line_number = document.positionAt(frontMatch.index).line;
        const uri = getFileURI(line_number, document);

        frontEndMatches.push({ method: frontMatch[1], endpoint: frontMatch[2], file: document.fileName, uri: uri});
      }
    }
  }

  // Return the list of endpoints found
  return { backendMatches, frontEndMatches };
}


function getFileURI(line_number: number, document: vscode.TextDocument): string {
	const path = document.uri.path;
	const config = vscode.workspace.getConfiguration('endpointer');
	const useVSCodeInsiders = config.get('useVSCodeInsiders');
	const protocol = useVSCodeInsiders ? 'vscode-insiders' : 'vscode';

	const url = `${protocol}://file${path}:${line_number}`;

	return url;
};

export function deactivate() {
}

