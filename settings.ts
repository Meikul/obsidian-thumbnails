import ThumbyPlugin from "main";
import { App, PluginSettingTab, Setting } from "obsidian";

export class ThumbySettingTab extends PluginSettingTab {
	plugin: ThumbyPlugin;

	constructor(app: App, plugin: ThumbyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Save Images")
			.setDesc("Save thumbnail images locally in vault")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.saveImages)
					.onChange(async (value) => {
						this.plugin.settings.saveImages = value;
						await this.plugin.saveSettings();
					})
			);
		// new Setting(containerEl)
	}
}
