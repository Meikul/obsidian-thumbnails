// import https from 'https';
import axios from 'axios';
import { App, Editor, MarkdownRenderer, MarkdownRenderChild, Plugin, MarkdownView, Notice } from 'obsidian';
import { text } from 'stream/consumers';
import { ThumbySettingTab } from './settings';

interface ThumbySettings {
	mySetting: string;
	download: boolean;
}

const DEFAULT_SETTINGS: ThumbySettings = {
	mySetting: 'default',
	download: false
}

interface VidInfo {
	thumbnail: string;
	title: string;
	author: string;
	authorUrl: string;
	foundVid: boolean;
	networkError: boolean;
}

export default class Thumby extends Plugin {
	settings: ThumbySettings;

	async onload() {
		await this.loadSettings();

		this.registerMarkdownCodeBlockProcessor('vid', async (source, el, ctx) => {
			console.log('Vid block: ' + source);
			const url = source.trim().split('\n')[0];
			const id = this.getVideoId(url);

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
				return;
			}

			// https://www.youtube.com/watch?v=hCc0OsyMbQk
			// https://youtu.be/hCc0OsyMbQk
			// https://youtu.be/hCc0OsyMbQk?t=320

			const info = await this.getVideoInfo(id);

			if(info.networkError){
				el.createEl('a', {text: source, href: source});
				return;
			}

			if(!info.foundVid){
				// el.createDiv({text: 'No video with that ID'}).addClass('thumbnail-error');
				const msg = el.createDiv();
				const component = new MarkdownRenderChild(msg);
				console.log(url);


				MarkdownRenderer.renderMarkdown(
					`>[!WARNING] No video with that ID`,
					msg,
					sourcePath,
					component
					);
				return;
			}

			this.createThumbnail(el, info, url);
		});

		this.addCommand({
			id: "insert-thumbnail-from-clipboard",
			name: "Insert thumbnail from link in clipboard",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const clipText = await navigator.clipboard.readText();
				const id = this.getVideoId(clipText);
				if(id === ''){
					new Notice('No video in clipboard');
					return;
				}
				editor.getDoc().replaceSelection(`\`\`\`vid\n${clipText}\n\`\`\``);
				console.log('Insert: ', id);
			},
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new ThumbySettingTab(this.app, this));
	}

	onunload() {

	}

	createThumbnail(el: HTMLElement, info: VidInfo, url: string){
		const container = el.createEl('a', {href: url});
		container.createEl('img', {attr: {'src': info.thumbnail}}).addClass('thumbnail-img');
		const textBox = container.createDiv();
		textBox.addClass('thumbnail-text');
		textBox.createDiv({text: info.title, title: info.title}).addClass('thumbnail-title');
		textBox.createEl('a', {text: info.author, href: info.authorUrl, title: info.author}).addClass('thumbnail-author');
	}

	async getVideoInfo(videoId: string): Promise<VidInfo>{
		let thumbnail = '';
		let title = '';
		let author = '';
		let authorUrl = '';
		let foundVid = false;
		let networkError = false;

		const formattedUrl = `https://www.youtube.com/watch?v=${videoId}`;

		// Use oEmbed to get data (https://oembed.com/)
		const reqUrl = `https://www.youtube.com/oembed?format=json&url=${formattedUrl}`;

		try {
			const res = await axios.get(reqUrl);
			// Doesn't use the returned thumbnail url because it sometimes has black bars
			thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
			title = res.data.title;
			author = res.data.author_name;
			authorUrl = res.data.author_url;
			foundVid = true;
			console.log(res.data);
		} catch (error) {
			console.log(error);
			if(!error.response.status){
				// Network error
				networkError = true;
			}
		}

		return {
			thumbnail,
			title,
			author,
			authorUrl,
			foundVid,
			networkError
		};
	}

	getVideoId(url: string): string{
		let id = '';
		if (url.contains('youtube.com/watch?v=')){
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
		return id;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
