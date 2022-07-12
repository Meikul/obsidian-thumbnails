import { Editor, MarkdownRenderer, MarkdownRenderChild, Plugin, MarkdownView, Notice, requestUrl, RequestUrlParam, MarkdownPostProcessorContext, EditorPosition } from 'obsidian';
import ThumbySettingTab from "./settings";

interface VidInfo {
	url: string;
	thumbnail: string;
	title: string;
	author: string;
	authorUrl: string;
	vidFound: boolean;
	networkError: boolean;
	infoStored: boolean;
}

interface ThumbySettings {
	storeInfo: boolean;
	saveImages: boolean;
	imageLocation: string;
	imageFolder: string;
}

const DEFAULT_SETTINGS: Partial<ThumbySettings> = {
	storeInfo: false,
	saveImages: true
};

export default class ThumbyPlugin extends Plugin {
	settings: ThumbySettings;

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ThumbySettingTab(this.app, this));

		// const p: RequestUrlParam = {
		// 	url: 'https://i.ytimg.com/vi/hCc0OsyMbQk/mqdefault.jpg'
		// }

		// const r = await requestUrl(p);
		// console.log(r);

		// const file = await this.app.vault.createBinary('james.jpg', r.arrayBuffer);
		// console.log(file);

		this.registerMarkdownCodeBlockProcessor('vid', async (source, el, ctx) => {
			const url = source.trim().split('\n')[0];
			let info: VidInfo;

			console.log(ctx.getSectionInfo(el));


			if(this.settings.storeInfo){
				info = this.parseStoredInfo(source);
				console.log(info);
			}

			if(!this.settings.storeInfo || !info.infoStored){
				console.log('fetching info');

				info = await this.getVideoInfo(url);
			}

			if(info.networkError){
				// If offline, just show link
				el.createEl('a', {text: source, href: source});
				return;
			}

			const sourcePath =
					typeof ctx == "string"
						? ctx
						: ctx?.sourcePath ??
							this.app.workspace.getActiveFile()?.path ??
							"";

			if(!info.vidFound){
				const component = new MarkdownRenderChild(el);

				MarkdownRenderer.renderMarkdown(
					`>[!WARNING] Cannot find video\n>${info.url}`,
					el,
					sourcePath,
					component
					);
				return;
			}


			// Sketchy? Can get be called infinitely if contents from this.storeVideoInfo
			// doesn't make this.paraseStoredInfo set info.infoStored to true
			if(this.settings.storeInfo && !info.infoStored){
				this.storeVideoInfo(info, el, ctx);
			}

			this.createThumbnail(el, info);
		});

		this.addCommand({
			id: "insert-thumbnail-from-clipboard",
			name: "Insert thumbnail from URL in clipboard",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const clipText = await navigator.clipboard.readText();
				const id = this.getVideoId(clipText);
				if(id === ''){
					new Notice('No valid video in clipboard');
					return;
				}
				editor.replaceSelection(`\`\`\`vid\n${clipText}\n\`\`\``);
				console.log('Insert video: ', id);
			},
		});
	}

	onunload() {

	}

	createThumbnail(el: HTMLElement, info: VidInfo){
		const container = el.createEl('a', {href: info.url});
		container.addClass('thumbnail');
		container.createEl('img', {attr: {'src': info.thumbnail}}).addClass('thumbnail-img');
		const textBox = container.createDiv();
		textBox.addClass('thumbnail-text');
		textBox.createDiv({text: info.title, title: info.title}).addClass('thumbnail-title');
		textBox.createEl('a', {text: info.author, href: info.authorUrl, title: info.author}).addClass('thumbnail-author');
	}

	parseStoredInfo(source: string): VidInfo{
		const info: VidInfo = {
			url: '',
			thumbnail: '',
			title: '',
			author: '',
			authorUrl: '',
			vidFound: false,
			networkError: false,
			infoStored: false
		};

		const input = source.trim().split('\n');
		if(input.length !== 5){
			console.log('Failed Parse');

			return info;
		}

		for (const [i, line] of input.entries()){
			if(i !== 0){
				const sepIndex = line.indexOf(': ');
				if(sepIndex === -1){
					console.log('No colon');
					return info;
				}
				const d = line.substring(sepIndex+2);
				input[i] = d;
			}
		}

		info.url = input[0];
		info.title = input[1];
		info.author = input[2];
		info.thumbnail = input[3];
		info.authorUrl = input[4];
		info.infoStored = true;
		info.vidFound = true;


		return info;
	}

	storeVideoInfo(info: VidInfo, el: HTMLElement, ctx: MarkdownPostProcessorContext){
		const section = ctx.getSectionInfo(el);

		console.log('storing');


		if(!section){
			return;
		}

		const content = `\`\`\`vid\n${info.url}\nTitle: ${info.title}\nAuthor: ${info.author}\nThumbnailUrl: ${info.thumbnail}\nAuthorUrl: ${info.authorUrl}\n\`\`\``;
		console.log(content);


		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if(view){
			const startPos: EditorPosition = {
				line: section.lineStart,
				ch: 0
			};

			const endPos: EditorPosition = {
				line: section.lineEnd,
				ch: view.editor.getLine(section.lineEnd).length
			}

			console.log(view.editor.getRange(startPos, endPos));
			view.editor.replaceRange(content, startPos, endPos);
		}
	}

	async getVideoInfo(url: string): Promise<VidInfo>{
		const info: VidInfo = {
			url: url,
			thumbnail: '',
			title: '',
			author: '',
			authorUrl: '',
			vidFound: false,
			networkError: false,
			infoStored: false
		};

		let reqUrl = '';
		const videoId = this.getVideoId(url);
		const isYoutube = url.includes('https://www.youtube.com/watch?v=') || url.includes('https://youtu.be/') || url.includes('https://www.youtube.com/shorts/');
		const isVimeo = url.includes('https://vimeo.com/')

		// Use oEmbed to get data (https://oembed.com/)
		if(isYoutube){
			reqUrl = `https://www.youtube.com/oembed?format=json&url=${url}`;
		}
		else if(isVimeo){
			reqUrl = `https://vimeo.com/api/oembed.json?url=${url}`;
		}
		else{
			//vid not found
			return info;
		}

		try {
			const reqParam: RequestUrlParam = {
				url:reqUrl
			};
			const res = await requestUrl(reqParam);
			// console.log(res);

			if(res.status === 200){
				if(isYoutube){
					// Returned thumbnail is usually letterboxed or wrong aspect ratio
					info.thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
				}
				else{
					info.thumbnail = res.json.thumbnail_url;
				}
				info.title = res.json.title;
				info.author = res.json.author_name;
				info.authorUrl = res.json.author_url;
				info.vidFound = true;
			}
		} catch (error) {
			console.log(error);
			// Network error
			info.networkError = true;
		}

		return info;
	}

	getVideoId(url: string): string{
		let id = '';
		if (url.includes('https://www.youtube.com/watch?v=')){
			const matches = url.match(/v=([-\w\d]+)/);
			if(matches !== null){
				id = matches[1]
			}
		}
		else if (url.includes('https://youtu.be/')){
			const matches = url.match(/youtu.be\/([-\w\d]+)/);
			if(matches !== null){
				id = matches[1]
			}
		}
		else if(url.includes('https://www.youtube.com/shorts/')){
			const matches = url.match(/shorts\/([-\w\d]+)/);
			if(matches !== null){
				id = matches[1]
			}
		}
		else if (url.includes('https://vimeo.com/')){
			const matches = url.match(/vimeo.com\/([-\w\d]+)/);
			if(matches !== null){
				id = matches[1]
			}
		}
		return id;
	}
}
