// import https from 'https';
import axios from 'axios';
import { App, Editor, MarkdownRenderer, MarkdownRenderChild, Plugin } from 'obsidian';
import { ThumbySettingTab } from './settings';

interface ThumbySettings {
	mySetting: string;
	download: boolean;
}

const DEFAULT_SETTINGS: ThumbySettings = {
	mySetting: 'default',
	download: false
}

export default class Thumby extends Plugin {
	settings: ThumbySettings;

	async onload() {
		this.registerMarkdownCodeBlockProcessor('vid', async (source, el, ctx) => {
			console.log('Vid block: ' + source);
			const url = source.trim().split('\n')[0];
			let id = '';

			if (url.contains('https://www.youtube.com/watch?v=')){
				const matches = url.match(/v=([-\w\d]+)/);
				if(matches !== null){
					id = matches[1]
				}
			}
			else if (url.contains('https://youtu.be/')){
				const matches = url.match(/youtu.be\/([-\w\d]+)/);
				if(matches !== null){
					id = matches[1]
				}
			}

			const sourcePath =
					typeof ctx == "string"
						? ctx
						: ctx?.sourcePath ??
							this.app.workspace.getActiveFile()?.path ??
							"";

			if(id === ''){
				// const msg = el.createDiv({text: "Link has no video ID"}).addClass('thumbnail-error');
				const msg = el.createDiv();
				const component = new MarkdownRenderChild(msg);

				MarkdownRenderer.renderMarkdown(
					'>[!WARNING] URL has no video ID',
					msg,
					sourcePath,
					component
					);
				// el.createDiv({text: `>[!FAIL] Link has no video ID`});
				return;
			}

			const formattedUrl = `https://www.youtube.com/watch?v=${id}`;
			// https://www.youtube.com/watch?v=hCc0OsyMbQk
			// https://youtu.be/hCc0OsyMbQk
			// https://youtu.be/hCc0OsyMbQk?t=320

			let thumbnail = '';
			let title = '';
			let foundVid = false;
			let offline = false;

			const reqUrl = `https://www.youtube.com/oembed?format=json&url=${formattedUrl}`;

			try {
				const res = await axios.get(reqUrl);
				foundVid = true;
				thumbnail = `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
				title = res.data.title;
				console.log(res.data);
			} catch (error) {
				console.log(error);
				if(!error.response.status){
					// Network error
					console.log('offline');

					offline = true;
				}
			}

			if(offline){
				el.createEl('a', {text: source, href: source});
				return;
			}

			if(!foundVid){
				// el.createDiv({text: 'No video with that ID'}).addClass('thumbnail-error');
				const msg = el.createDiv();
				const component = new MarkdownRenderChild(msg);

				MarkdownRenderer.renderMarkdown(
					'>[!WARNING] No video with that ID',
					msg,
					sourcePath,
					component
					);
				return;
			}

			el.createEl('img', {attr: {'src': thumbnail}}).addClass('thumbnail-img')
			el.createDiv({text: title}).addClass('thumbnail-title')
			// el.createEl('img', {attr: {'src': `https://img.youtube.com/vi/${id}/mqdefault.jpg`}})
		});

		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ThumbySettingTab(this.app, this));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
// class SampleSettingTab extends PluginSettingTab {
// 	plugin: Thumby;

// 	constructor(app: App, plugin: Thumby) {
// 		super(app, plugin);
// 		this.plugin = plugin;
// 	}

// 	display(): void {
// 		const {containerEl} = this;

// 		containerEl.empty();

// 		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

// 		new Setting(containerEl)
// 			.setName('Setting #1')
// 			.setDesc('It\'s a secret')
// 			.addText(text => text
// 				.setPlaceholder('Enter your secret')
// 				.setValue(this.plugin.settings.mySetting)
// 				.onChange(async (value) => {
// 					console.log('Secret: ' + value);
// 					this.plugin.settings.mySetting = value;
// 					await this.plugin.saveSettings();
// 				}));
// 		new Setting(containerEl)
// 			.setName('Download thumbnails')
// 			.setDesc('Save thumbnails locally')
// 			.addToggle(toggle => toggle
// 				.setValue(this.plugin.settings.download)
// 				.onChange(async (value) => {
// 					console.log('Download: ' + value);
// 					this.plugin.settings.download = value;
// 					await this.plugin.saveSettings();
// 				}));
// 	}
// }
