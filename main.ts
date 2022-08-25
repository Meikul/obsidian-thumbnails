import { Editor, MarkdownRenderer, MarkdownRenderChild, Plugin, MarkdownView, Notice, requestUrl, RequestUrlParam, MarkdownPostProcessorContext, EditorPosition, TAbstractFile } from 'obsidian';
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
	imageSaved: boolean;
}

interface ThumbySettings {
	storeInfo: boolean;
	saveImages: boolean;
	imageLocation: string;
	imageFolder: string;
}

const DEFAULT_SETTINGS: Partial<ThumbySettings> = {
	storeInfo: false,
	saveImages: false,
	imageLocation: 'defaultAttachment',
	imageFolder: ''
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

		this.registerMarkdownCodeBlockProcessor('vid', async (source, el, ctx) => {
			const sourceLines = source.trim().split('\n');
			const url = sourceLines[0];
			let info: VidInfo;

			if (this.settings.storeInfo) {
				info = this.parseStoredInfo(source);
			}

			if (!this.settings.storeInfo || !info.infoStored) {
				info = await this.getVideoInfo(url);
			}

			if (info.networkError && !info.infoStored) {
				// If offline and info not stored, just show link
				const url = source.trim().split('\n')[0];
				el.createEl('a', { text: url, href: url });
				return;
			}

			const sourcePath =
				typeof ctx == "string"
					? ctx
					: ctx?.sourcePath ??
					this.app.workspace.getActiveFile()?.path ??
					"";

			if (!info.vidFound) {
				const component = new MarkdownRenderChild(el);

				MarkdownRenderer.renderMarkdown(
					`>[!WARNING] Cannot find video\n>${info.url}`,
					el,
					sourcePath,
					component
				);
				return;
			}

			if (this.hasManyUrls(sourceLines)){
				const component = new MarkdownRenderChild(el);

				MarkdownRenderer.renderMarkdown(
					`>[!WARNING] Cannot accept multiple URLs yet`,
					el,
					sourcePath,
					component
				);
				return;
			}


			// Sketchy? Can get be called infinitely if output from this.storeVideoInfo
			// doesn't make this.parseStoredInfo set info.infoStored to true
			if (this.settings.storeInfo && !info.infoStored) {
				this.storeVideoInfo(info, el, ctx);
			}

			if (!this.settings.storeInfo && sourceLines.length > 1) {
				this.removeStoredInfo(info, el, ctx);
			}

			this.createThumbnail(el, info);
		});

		this.addCommand({
			id: "insert-thumbnail-from-clipboard",
			name: "Insert thumbnail from URL in clipboard",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const clipText = await navigator.clipboard.readText();
				const id = await this.getVideoId(clipText);
				if (id === '') {
					new Notice('No valid video in clipboard');
					return;
				}
				editor.replaceSelection(`\`\`\`vid\n${clipText}\n\`\`\``);
			}
		});
	}

	onunload() {

	}

	hasManyUrls(lines: string[]): boolean{
		// Will be used for future features
		return (lines.length > 1 && lines.every(e => (/^((https*:\/\/)|(www\.))+\S*$/).test(e.trim())))
	}

	createThumbnail(el: HTMLElement, info: VidInfo) {
		let thumbnailUrl = info.thumbnail;
		if(this.pathIsLocal(thumbnailUrl)){
			const file = this.app.vault.getAbstractFileByPath(thumbnailUrl);
			//@ts-ignore
			thumbnailUrl = this.app.vault.getResourcePath(file);
		}

		const container = el.createEl('a', { href: info.url });
		container.addClass('thumbnail');
		container.createEl('img', { attr: { 'src': thumbnailUrl } }).addClass('thumbnail-img');
		const textBox = container.createDiv();
		textBox.addClass('thumbnail-text');
		textBox.createDiv({text: info.title, title: info.title}).addClass('thumbnail-title');
		textBox.createEl('a', {text: info.author, href: info.authorUrl, title: info.author}).addClass('thumbnail-author');
		this.getTimestamp(url);
	}

	getTimestamp(url: string): number{
		let tIndex = url.indexOf('?t=');
		if(tIndex === -1){
			tIndex = url.indexOf('&t=');
		}
		if(tIndex === -1){
			tIndex = url.indexOf('#t=');
		}
		if(tIndex === -1){
			return 0;
		}

		const search = (/[?&#]t=(?:(\d+)h)*(?:(\d+)m)*(?:(\d+)s)*(\d+)*/).exec(url);
		console.log(search);
		//1-h 2-m 3-s 4-s



		return 0;
	}

	pathIsLocal(path: string): boolean{
		return path.indexOf('https://') !== 0;
	}

	parseStoredInfo(source: string): VidInfo {
		const info: VidInfo = {
			url: '',
			thumbnail: '',
			title: '',
			author: '',
			authorUrl: '',
			vidFound: false,
			networkError: false,
			infoStored: false,
			imageSaved: false
		};

		const input = source.trim().split('\n');
		if (input.length !== 5) {
			return info;
		}

		for (const [i, line] of input.entries()) {
			if (i !== 0) {
				const sepIndex = line.indexOf(': ');
				if (sepIndex === -1) {
					return info;
				}
				const d = line.substring(sepIndex + 2);
				input[i] = d;
			}
		}

		info.url = input[0];
		info.title = input[1];
		info.author = input[2];
		info.thumbnail = input[3];
		info.authorUrl = input[4];
		info.vidFound = true;

		if (this.pathIsLocal(info.thumbnail)) {
			// Check file exists
			const existingFile = this.app.vault.getAbstractFileByPath(info.thumbnail);

			if (existingFile) {
				info.imageSaved = true;
			}

			if (!this.settings.saveImages) {
				return info;
			}
		}
		else if (this.settings.saveImages) {
			return info;
		}

		info.infoStored = true;

		return info;
	}

	async storeVideoInfo(info: VidInfo, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const section = ctx.getSectionInfo(el);

		if (!section) {
			return;
		}

		if (this.settings.saveImages && !info.imageSaved) {
			info.thumbnail = await this.saveImage(info);
		}

		const content = `\`\`\`vid\n${info.url}\nTitle: ${info.title}\nAuthor: ${info.author}\nThumbnailUrl: ${info.thumbnail}\nAuthorUrl: ${info.authorUrl}\n\`\`\``;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			const startPos: EditorPosition = {
				line: section.lineStart,
				ch: 0
			};

			const endPos: EditorPosition = {
				line: section.lineEnd,
				ch: view.editor.getLine(section.lineEnd).length
			}

			view.editor.replaceRange(content, startPos, endPos);
		}
	}

	async saveImage(info: VidInfo): Promise<string> {
		const id = await this.getVideoId(info.url);
		let filePath = '';
		if (this.settings.imageLocation === 'specifiedFolder') {
			filePath = `${this.settings.imageFolder}/${id}.jpg`;
		}
		else {
			//@ts-ignore
			filePath = `${this.app.vault.getConfig('attachmentFolderPath')}/${id}.jpg`;
		}

		const existingFile = this.app.vault.getAbstractFileByPath(filePath);

		if (existingFile) {
			// file exists
			return existingFile.path;
		}

		const reqParam: RequestUrlParam = {
			url: info.thumbnail
		}

		let file;

		try {
			const req = await requestUrl(reqParam);

			if (req.status === 200) {
				file = await this.app.vault.createBinary(filePath, req.arrayBuffer);
			}
		} catch (error) {
			return info.thumbnail;
		}

		console.log(`Path ${file.path}`);

		const localUrl = file.path;
		return localUrl;
	}

	getTrimmedResourcePath(file: TAbstractFile): string {
		//@ts-ignore
		const path = this.app.vault.getResourcePath(file);
		const endPos = path.indexOf('.jpg') + 4;
		return path.substring(0, endPos);
	}

	removeStoredInfo(info: VidInfo, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		const section = ctx.getSectionInfo(el);

		if (!section) {
			return;
		}

		const content = `\`\`\`vid\n${info.url}\n\`\`\``;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			const startPos: EditorPosition = {
				line: section.lineStart,
				ch: 0
			};

			const endPos: EditorPosition = {
				line: section.lineEnd,
				ch: view.editor.getLine(section.lineEnd).length
			}

			view.editor.replaceRange(content, startPos, endPos);
		}
	}

	async getVideoInfo(url: string): Promise<VidInfo> {
		const info: VidInfo = {
			url: url,
			thumbnail: '',
			title: '',
			author: '',
			authorUrl: '',
			vidFound: false,
			networkError: false,
			infoStored: false,
			imageSaved: false
		};
		let reqUrl = '';
		const isYoutube = url.includes('https://www.youtube.com/watch?v=') || url.includes('https://youtu.be/') || url.includes('youtube.com/shorts/');
		const isVimeo = url.includes('https://vimeo.com/')

		// Use oEmbed to get data (https://oembed.com/)
		if (isYoutube) {
			reqUrl = `https://www.youtube.com/oembed?format=json&url=${url}`;
		}
		else if (isVimeo) {
			reqUrl = `https://vimeo.com/api/oembed.json?url=${url}`;
		}
		else {
			//vid not found
			return info;
		}

		try {
			const reqParam: RequestUrlParam = {
				url: reqUrl
			};
			const res = await requestUrl(reqParam);

			if (res.status === 200) {
				if (isYoutube) {
					// Returned thumbnail is usually letterboxed or wrong aspect ratio
					const videoId = await this.getVideoId(url);
					info.thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
				}
				else {
					info.thumbnail = res.json.thumbnail_url;
				}
				info.title = res.json.title;
				info.author = res.json.author_name;
				info.authorUrl = res.json.author_url;
				info.vidFound = true;
			}
		} catch (error) {
			console.error(error);
			// Network error
			info.networkError = true;
		}

		return info;
	}

	async getVideoId(url: string): Promise<string> {
		let id = '';
		if (url.includes('https://www.youtube.com/watch?v=')) {
			const matches = url.match(/v=([-\w\d]+)/);
			if (matches !== null) {
				id = matches[1]
			}
		}
		else if (url.includes('https://youtu.be/')) {
			const matches = url.match(/youtu.be\/([-\w\d]+)/);
			if (matches !== null) {
				id = matches[1]
			}
		}
		else if (url.includes('youtube.com/shorts/')) {
			const matches = url.match(/shorts\/([-\w\d]+)/);
			if (matches !== null) {
				id = matches[1]
			}
		}
		else if (url.includes('https://vimeo.com/')) {
			const matches = url.match(/vimeo.com\/([\w\d]+)/);
			if (matches !== null) {
				id = matches[1]
				if (!(/^[0-9]+$/).exec(id)) {
					// Special vimeo url's that don't contain a video id
					id = await this.fetchVimeoVideoId(url);
				}
			}
		}
		return id;
	}

	async fetchVimeoVideoId(url: string): Promise<string> {
		let id = '';
		try {
			const reqParam: RequestUrlParam = {
				url: `https://vimeo.com/api/oembed.json?url=${url}`
			};

			const res = await requestUrl(reqParam);

			if (res.status === 200 && res.json.video_id) {
				id = res.json.video_id.toString();
			}
		} catch (error) {
			console.error(error);
		}
		return id;
	}
}
