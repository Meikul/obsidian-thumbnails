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

		console.log(this.plugin.settings);

		//@ts-ignore
		const attachmentLocation = this.app.vault.getConfig('attachmentFolderPath');

		// Store data locally (off)
		// - Save images (on)
		//   - Image location (attachment/vault/specified)
		//     - Folder path

		new Setting(containerEl)
			.setName('Save Thumbnail Info')
			.setDesc('Save thumbnail information inside your note, so they work offline')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.storeInfo)
					.onChange(async (value) => {
						this.plugin.settings.storeInfo = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if(this.plugin.settings.storeInfo){
			new Setting(containerEl)
				.setName('Save Images')
				.setDesc('Save thumbnail images locally in vault')
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.saveImages)
						.onChange(async (value) => {
							this.plugin.settings.saveImages = value;
							await this.plugin.saveSettings();
							this.display();
						})
				);
			if(this.plugin.settings.saveImages){
				new Setting(containerEl)
					.setName('Image Location')
					.setDesc('Where thumbnail images should be saved')
					.addDropdown((dropdown) =>
						dropdown
							.addOption('defaultAttachment', 'Default attachment location')
							.addOption('specifiedFolder', 'In the folder specified below')
							.setValue(this.plugin.settings.imageLocation)
							.onChange(async (value) => {
								this.plugin.settings.imageLocation = value;
								this.display();
								await this.plugin.saveSettings();
							})
					);
				if (this.plugin.settings.imageLocation === 'defaultAttachment'){
					new Setting(containerEl)
						.setName('Default attachment location')
						// .setDesc('"Default location for new attachments" set in "Files & Links" options')
						.setDesc('Options > Files & Links > Default location for new attachments')
						.addText((text) =>
							text
								.setValue(attachmentLocation)
								.setDisabled(true)
						)
						.setClass('default-attachment-info')
				}
				else if (this.plugin.settings.imageLocation === 'specifiedFolder') {
					new Setting(containerEl)
						.setName('Image Folder')
						.setDesc('The folder where thumbnail images should be saved')
						.addText((text) =>
							text
								.setPlaceholder('ex: Files/Thumbnails')
								.setValue(this.plugin.settings.imageFolder)
								.onChange(async (value) => {
									this.plugin.settings.imageFolder = value;
									await this.plugin.saveSettings();
								})
						);
				}
			}
		}
	}
}
