import ThumbyPlugin from "main";
import { App, PluginSettingTab, Setting } from "obsidian";

export default class ThumbySettingTab extends PluginSettingTab {
	plugin: ThumbyPlugin;

	constructor(app: App, plugin: ThumbyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();
		containerEl.createEl('h2', { text: 'Thumbnails Settings' });

		console.log(this.app.vault.getConfig('attachmentFolderPath'));


		new Setting(containerEl)
			.setName('Save Images')
			.setDesc('Save thumbnail images locally in vault')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.saveImages)
					.onChange(async (value) => {
						this.plugin.settings.saveImages = value;
						this.display();
						await this.plugin.saveSettings();
					})
			);

    if(this.plugin.settings.saveImages){
		new Setting(containerEl)
			.setName('Image Folder')
			.setDesc('Where thumbnail images should be saved')
			.addText((text) =>
				text
					.setPlaceholder('ex. Files')
					.onChange(async (value) => {
						this.plugin.settings.imageFolder = value;
					})
			);
	}
	}
}
