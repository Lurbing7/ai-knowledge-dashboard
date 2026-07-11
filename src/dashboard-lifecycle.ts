export interface DashboardLeaf {
  setViewState(state: { type: string; active: boolean }): Promise<void>;
  setPinned(pinned: boolean): void;
}

export interface DashboardWorkspace<Leaf extends DashboardLeaf = DashboardLeaf> {
  getLeavesOfType(type: string): Leaf[];
  getLeaf(mode: "tab"): Leaf;
  revealLeaf(leaf: Leaf): Promise<void> | void;
}

export async function activateDashboard<Leaf extends DashboardLeaf>(
  workspace: DashboardWorkspace<Leaf>,
  viewType: string
): Promise<void> {
  const existing = workspace.getLeavesOfType(viewType)[0];
  if (existing) {
    await workspace.revealLeaf(existing);
    return;
  }

  const leaf = workspace.getLeaf("tab");
  await leaf.setViewState({ type: viewType, active: true });
  leaf.setPinned(true);
  await workspace.revealLeaf(leaf);
}
