import * as vscode from 'vscode';
import * as path from 'path';

interface BackendMatch {
  method: string;
  endpoint: string;
  file: string;
  uri: string;
}

type TreeNode = SegmentItem | MethodItem;

export class RoutesProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | void> = new vscode.EventEmitter<TreeNode | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | void> = this._onDidChangeTreeData.event;
  private roots: SegmentItem[] = [];

  constructor(private workspaceRoot: string, private context: vscode.ExtensionContext) {}

  refresh(): void {
    this.roots = [];
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): Thenable<TreeNode[]> {
    if (!this.workspaceRoot) {
      vscode.window.showInformationMessage('No routes in empty workspace');
      return Promise.resolve([]);
    }

    if (!element) {
      if (this.roots.length === 0) {
        this.buildTree();
      }
      const sortedRoots = this.roots.sort((a, b) => (a.label as string).localeCompare(b.label as string));
      return Promise.resolve(sortedRoots);
    }

    if (element instanceof SegmentItem) {
      return Promise.resolve(element.getSortedChildren());
    }

    return Promise.resolve([]);
  }

  private buildTree(): void {
    const matches: BackendMatch[] = this.context.globalState.get('backendMatches', []);
    const segmentRootByName = new Map<string, SegmentItem>();

    for (const match of matches) {
      const endpoint = sanitizeEndpoint(match.endpoint);
      const segments = endpoint.split('/').filter(Boolean);

      if (segments.length === 0) {
        // root endpoint '/': put method directly under a synthetic root segment
        let rootSeg = segmentRootByName.get('/');
        if (!rootSeg) {
          rootSeg = new SegmentItem('/', vscode.TreeItemCollapsibleState.Collapsed);
          segmentRootByName.set('/', rootSeg);
        }
        rootSeg.addChild(new MethodItem(match.method, match.endpoint, vscode.Uri.file(match.file), match.uri));
        continue;
      }

      // ensure top-level segment
      const first = segments[0];
      let current = segmentRootByName.get(first);
      if (!current) {
        current = new SegmentItem(first, vscode.TreeItemCollapsibleState.Collapsed);
        segmentRootByName.set(first, current);
      }

      // walk/create sub-segments
      for (let i = 1; i < segments.length; i++) {
        const seg = segments[i];
        current = current.getOrCreateChildSegment(seg);
      }

      // attach method leaf to the final segment
      current.addChild(new MethodItem(match.method, match.endpoint, vscode.Uri.file(match.file), match.uri));
    }

    this.roots = Array.from(segmentRootByName.values());
  }
}

class SegmentItem extends vscode.TreeItem {
  private children: TreeNode[] = [];

  constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
    super(label, collapsibleState);
    this.contextValue = 'segment';
    this.tooltip = label;
  }

  addChild(child: TreeNode): void {
    this.children.push(child);
  }

  getOrCreateChildSegment(label: string): SegmentItem {
    const existing = this.children.find(c => c instanceof SegmentItem && c.label === label) as SegmentItem | undefined;
    if (existing) return existing;
    const seg = new SegmentItem(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.children.push(seg);
    return seg;
  }

  getSortedChildren(): TreeNode[] {
    const segments: SegmentItem[] = [];
    const methods: MethodItem[] = [];
    for (const c of this.children) {
      if (c instanceof SegmentItem) segments.push(c);
      else methods.push(c);
    }
    segments.sort((a, b) => (a.label as string).localeCompare(b.label as string));
    // sort methods by HTTP verb order then name
    const order = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    methods.sort((a, b) => {
      const ai = order.indexOf(a.method.toUpperCase());
      const bi = order.indexOf(b.method.toUpperCase());
      if (ai !== -1 && bi !== -1 && ai !== bi) return ai - bi;
      if (ai !== -1 && bi === -1) return -1;
      if (ai === -1 && bi !== -1) return 1;
      return (a.label as string).localeCompare(b.label as string);
    });
    return [...segments, ...methods];
  }
}

class MethodItem extends vscode.TreeItem {
  constructor(
    public readonly method: string,
    public readonly endpoint: string,
    public readonly fileUri: vscode.Uri,
    public readonly openUri: string
  ) {
    super(method, vscode.TreeItemCollapsibleState.None);
    this.tooltip = `${this.method} ${this.endpoint} - ${this.fileUri.fsPath}`;
    this.description = this.endpoint;
    this.command = {
      title: 'Open File',
      command: 'vscode.open',
      arguments: [this.fileUri]
    };
    this.iconPath = {
      light: path.join(__filename, '..', '..', 'src/resources', 'dark-endpoint.svg'),
      dark: path.join(__filename, '..', '..', 'src/resources', 'light-endpoint.svg')
    };
    this.contextValue = 'method';
  }
}

function sanitizeEndpoint(endpoint: string): string {
  // Normalize whitespace and strip query/fragments if present (defensive)
  const cleaned = endpoint.split('?')[0].split('#')[0].trim();
  return cleaned.startsWith('/') ? cleaned : `/${cleaned}`;
}