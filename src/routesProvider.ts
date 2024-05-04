import * as vscode from 'vscode';
import * as path from 'path';

interface BackendMatch {
  method: string;
  endpoint: string;
  file: string;
  uri: string;
}


export class RoutesProvider implements vscode.TreeDataProvider<Route> {
  private _onDidChangeTreeData: vscode.EventEmitter<Route | undefined | void> = new vscode.EventEmitter<Route | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<Route | undefined | void> = this._onDidChangeTreeData.event;
  private routesMap = new Map<string, Route>();

  constructor(private workspaceRoot: string, private context: vscode.ExtensionContext) {}

  refresh(): void {
    this.routesMap.clear(); // Clear previous data
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Route): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Route): Thenable<Route[]> {

    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No routes in empty workspace');
      return Promise.resolve([]);
    }

    if (!element) {
      if (this.routesMap.size === 0) { // Ensure this condition is checked properly
        const matches: BackendMatch[] = this.context.globalState.get('backendMatches', []);
        matches.forEach(match => this.addToTree(match));
      }
      const sortedRoutes = Array.from(this.routesMap.values()).sort((a, b) => a.label.localeCompare(b.label));
      return Promise.resolve(sortedRoutes);
    }

    // Since it's a flat list, return empty array if element is provided
    return Promise.resolve([]);
  }

  private addToTree(match: BackendMatch) {
    const endpoint = match.endpoint;
    const method = match.method;
    const key = `${method} ${endpoint}`; // Create a unique key using both method and endpoint

    // Check if the unique key exists in the map
    if (!this.routesMap.has(key)) {
        const route = new Route(
            endpoint, // Use the key as the label for clarity
            method,
            vscode.Uri.file(match.file),
            vscode.TreeItemCollapsibleState.None, // Flat list, items do not collapse
            key
        );
        this.routesMap.set(key, route);
        console.log("Added to tree: ", match);
    }
  }


}
  

class Route extends vscode.TreeItem {
  constructor(
      public readonly label: string,
      private method: string,
      public readonly uri: vscode.Uri,
      public readonly collapsibleState: vscode.TreeItemCollapsibleState,
      private readonly key: string
  ) {
      super(label, collapsibleState);
      this.tooltip = `${this.method} ${this.label} - ${this.uri.fsPath}`;
      this.description = this.method;

      this.command = {
          title: "Open File",
          command: "vscode.open",
          arguments: [this.uri]
      };

      this.iconPath = {
          light: path.join(__filename, '..', '..', 'src/resources', 'dark-endpoint.svg'),
          dark: path.join(__filename, '..', '..', 'src/resources', 'light-endpoint.svg')
      };
  }
}