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

    if (element) {
      return Promise.resolve(element.children || []);
    }

    if (this.routesMap.size > 0) {
      return Promise.resolve([...this.routesMap.values()]);
    }

    const matches: BackendMatch[] = this.context.globalState.get('backendMatches', []);
    matches.forEach(match => this.addToTree(match));
    return Promise.resolve([...this.routesMap.values()]);
  }

  private addToTree(match: BackendMatch) {
    const segments = match.endpoint.split('/');
    let currentParent: Route | undefined;

    segments.reduce((acc, segment, index) => {
      const path = acc + '/' + segment;
      const method  = match.method;
      if (!this.routesMap.has(path)) {
        const isLeaf = index === segments.length - 1;
        const route = new Route(
          path,
          method,
          vscode.Uri.file(match.file),
          isLeaf ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed
        );
        if (currentParent) {
          currentParent.children = currentParent.children || [];
          currentParent.children.push(route);
        } else {
          this.routesMap.set(path, route);
        }
      }
      currentParent = this.routesMap.get(path);
      return path;
    }, '');
  }
}


class Route extends vscode.TreeItem {
  children: Route[] | undefined;

  constructor(
    public readonly label: string,
    private endpoint: string,
    public readonly uri: vscode.Uri,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.Collapsed
  ) {
    super(label, collapsibleState);
    this.tooltip = `${this.label} - ${this.uri.fsPath}`;
    this.description = this.endpoint;

    this.command = this.collapsibleState === vscode.TreeItemCollapsibleState.None ? {
      title: "Open File",
      command: "vscode.open",
      arguments: [this.uri]
    } : undefined;
  }

  iconPath = {
    light: path.join(__filename, '..', '..', 'resources', 'light', 'endpoint.svg'),
    dark: path.join(__filename, '..', '..', 'resources', 'dark', 'endpoint.svg')
  };
}