// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { RoutesProvider } from './routesProvider';
 
export function activate(context: vscode.ExtensionContext) {
  // get the config for the link color and icon
  const config = vscode.workspace.getConfiguration('endpointer');
  const linkColor = config.get('linkColor');
  const showLinkIcon = config.get('showLinkIcon');
  const endpointRegexCall = config.get('endpointRegex') as string;
  const endpointRegex = new RegExp(endpointRegexCall, 'g');
  const frontendCallRegex = config.get('frontendCallRegex') as string;
  const frontEndRegex = new RegExp(frontendCallRegex, 'g');


  const rootPath =
    vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0].uri.fsPath
      : undefined;
    vscode.window.registerTreeDataProvider(
      'endpointer',
      new RoutesProvider(rootPath ?? '')
    );

  vscode.window.createTreeView('endpointer', {
    treeDataProvider: new RoutesProvider(rootPath ?? '')
  });

  let indexWorkspace = vscode.commands.registerCommand('extension.reindexWorkspace', async () => {
    // Use the endpoint regex to find all endpoints in the workspace
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor available for indexing.');
      return; // Exit if no editor is open
    }
    const document = editor.document;
    const text = document.getText();
    const endpoints: string[] = [];
    let match;

    while ((match = endpointRegex.exec(text)) !== null) {
      endpoints.push(match[1]);
    }

    // Store the endpoints in the global state
    context.workspaceState.update('endpoints', endpoints);
    vscode.window.showInformationMessage('Workspace indexed for endpoints.');
    
  });


  let pasteDisposable = vscode.commands.registerCommand('extension.pasteEndpointTemplate', async () => {
    const editor = vscode.window.activeTextEditor;
  
    // Call pasteURI and use its output
    const pasteUri = `// ENDPOINTER <> method: "GET", endpoint: "/api/endpoint"`
        
    if (!editor) {
      vscode.window.showInformationMessage('No active editor available for pasting.');
      return; // Exit if no editor is open
    }

    editor.edit((editBuilder) => {
      editBuilder.insert(editor.selection.active, pasteUri);
    });
  });

  const handleLinkClickCommand = vscode.commands.registerCommand('extension.openEndpoint', uri => {
    vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(uri));
  });
  

  // set the link color
  const linkDecorator = vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline', // Underline to indicate a link
    cursor: 'pointer', // Cursor style as a pointer
    color: linkColor ?? '#0000FF', // Default link color
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
    const linkDecorations: vscode.DecorationOptions[] = [];

    let match;
    while ((match = frontEndRegex.exec(text)) !== null) {

      const uri = match[1];
      const startPos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(startPos, endPos);
      const key = rangeKey(range);

      if (existingDecorations.has(key)) {
        // console.log('Decoration already exists for range: ', key);
        continue; // Skip this loop iteration if decoration already exists
      } else {
        // console.log('Decoration does not exist for range: ', key);
      }

      const messageMarkdown = new vscode.MarkdownString(`[Open File: ${uri}](command:extension.handleLinkClick?${encodeURIComponent(JSON.stringify(uri))})`);
      messageMarkdown.supportHtml = true;
      messageMarkdown.isTrusted = true;

      const decoration = {
        range: range,
        hoverMessage: messageMarkdown,
        renderOptions: { 
          after: {
            contentText: showLinkIcon ? '🔗' : '',
          }
        },
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


  context.subscriptions.push( pasteDisposable, handleLinkClickCommand);
}

export function deactivate() {
}

