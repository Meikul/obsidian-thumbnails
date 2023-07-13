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

		// Store data locally (default: off)
		// - Save images (default: on)
		//   - Image location (default: attachment_location/specified_folder)
		//	   - Attachment point info (if attachment_location)
		//     - Folder path (if specified_folder)

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
					//@ts-ignore
					const attachmentLocation = this.app.vault.getConfig('attachmentFolderPath');
					new Setting(containerEl)
						.setName('Default attachment location')
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
		new Setting(containerEl)
			.setName('Responsive Card-Style Thumbnails')
			.setDesc('Switch to card-style thumbnails for narrow screens')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.responsiveCardStyle)
					.onChange(async (value) => {
						this.plugin.settings.responsiveCardStyle = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);
		new Setting(containerEl)
			.setName('YouTube API Key (optional)')
			.setDesc('An API Key for the YouTube Data API')
			.addExtraButton((btn) =>
				btn
					.setIcon('info')
					//@ts-ignore
					.setTooltip('A few videos have been discovered that can\'t be found the normal way. If you provide an API key for the YouTube Data API, this plugin will use the API as a backup.', {placement: 'top'})
					.setDisabled(true)
			)
			.addText((text) =>
				text
					.setValue(this.plugin.settings.youtubeApiKey)
					.onChange(async (value) => {
						this.plugin.settings.youtubeApiKey = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
