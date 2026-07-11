export interface ObsidianSettingsHost {
  setting: {
    open(): void;
    openTabById(id: string): void;
  };
}

export function openPluginSettings(host: ObsidianSettingsHost, pluginId: string): void {
  host.setting.open();
  host.setting.openTabById(pluginId);
}
