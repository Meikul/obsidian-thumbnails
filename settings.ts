import ThumbyPlugin from "main";
import {App, PluginSettingTab, Setting} from "obsidian"

export class ThumbySettingTab extends PluginSettingTab{
	plugin: ThumbyPlugin;

	constructor(app: App, plugin: ThumbyPlugin){
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Download thumbnails')
			.setDesc('Save thumbnail images locally')
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.download)
				.onChange(async (value) => {
					console.log("new download settings")
					this.plugin.settings.download = value;
					await this.plugin.saveSettings();
				}));
	}
}
