import { Editor, MarkdownRenderer, MarkdownRenderChild, Plugin, MarkdownView, Notice, requestUrl, RequestUrlParam, MarkdownPostProcessorContext, EditorPosition, TAbstractFile, TFile } from 'obsidian';
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
	responsiveCardStyle: boolean;
	youtubeApiKey: string;
}

const DEFAULT_SETTINGS: Partial<ThumbySettings> = {
	storeInfo: true,
	saveImages: false,
	imageLocation: 'defaultAttachment',
	imageFolder: '',
	responsiveCardStyle: true,
	youtubeApiKey: ''
};

const URL_TYPES = {
	youtube: [
		{match: 'youtube.com/watch?v=', idPattern: /v=([-\w\d]+)/},
		{match: 'youtu.be/', idPattern: /youtu.be\/([-\w\d]+)/},
		{match: 'youtube.com/shorts/', idPattern: /shorts\/([-\w\d]+)/},
		{match: 'youtube.com/live/', idPattern: /live\/(\w+)/}
	],
	vimeo: [
		{match: 'vimeo.com/', idPattern: /vimeo.com\/([\w\d]+)/}
	],
	odysee: [
		{match: 'odysee.com/@', idPattern: /odysee\.com\/@([\w-]+:[a-zA-Z0-9]+)\/([\w-]+:[a-zA-Z0-9]+)/}
	]
};

export default class ThumbyPlugin extends Plugin {
	settings: ThumbySettings;

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Run responsive check in case responsiveCardStyle setting changed
		this.responsiveCardCheckAllEditors();
	}

	responsiveCardCheckAllEditors() {
		const editors = document.querySelectorAll(
			".workspace-leaf .view-content"
		);

		for (const key in editors) {
			if (Object.prototype.hasOwnProperty.call(editors, key)) {
				const editor = editors[key];
				this.responsiveCardCheck(editor);
			}
		}
	}

	responsiveCardCheck(editor: Element) {
		const vidBlocks = editor.querySelectorAll(".block-language-vid");

		for (const key in vidBlocks) {
			if (Object.prototype.hasOwnProperty.call(vidBlocks, key)) {
				const block = vidBlocks[key] as HTMLElement;

				// Check if setting is enabled here so we can remove the card style class from blocks if it was just disabled
				if (
					this.settings.responsiveCardStyle &&
					block &&
					block.offsetWidth < 290
				) {
					block.addClass("thumbnail-card-style");
				} else {
					block.removeClass("thumbnail-card-style");
				}
			}
		}
	}

	// setEditorResizeObservers sets the resize observer to observe all editor elements
	setEditorResizeObservers() {
		if (!this.editorObserver) return;

		this.editorObserver.disconnect();
		const editorElems = document.querySelectorAll(
			".workspace-leaf .view-content"
		);
		for (const key in editorElems) {
			if (Object.prototype.hasOwnProperty.call(editorElems, key)) {
				const editor = editorElems[key];
				this.editorObserver.observe(editor);
			}
		}
	}

	// waitForVidBlockLoad waits for the note's vid language blocks to be loaded
	// before running the callback
	waitForVidBlockLoad(view: MarkdownView, callback: () => void) {
		let intervalCount = 0;
		const interval = window.setInterval(() => {
			const elements = view.contentEl.querySelectorAll(
				".block-language-vid"
			);
			if (elements.length > 0) {
				window.clearInterval(interval);
				callback();
			}
			if (intervalCount > 20) {
				// If it takes more than 2 seconds, give up
				window.clearInterval(interval);
			}
			intervalCount++;
		}, 100); // Check every 100ms
		this.registerInterval(interval);
	}

	// A resize observer that runs responsiveCardCheck on all entries
	private editorObserver = new ResizeObserver((entries) => {
		for (const editor of entries) {
			this.responsiveCardCheck(editor.target);
		}
	});

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new ThumbySettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			this.setEditorResizeObservers();
			this.registerEvent(
				this.app.workspace.on("file-open", () => {
					this.setEditorResizeObservers();
				})
			);
		});

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView) {
			this.waitForVidBlockLoad(activeView, () => {
				this.responsiveCardCheck(activeView.contentEl);
			});
		}

		this.registerMarkdownCodeBlockProcessor(
			"vid",
			async (source, el, ctx) => {
				this.createDummyBlock(el);
				const sourceLines = source.trim().split("\n");
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
					this.removeDummyBlock(el);
					const url = source.trim().split("\n")[0];
					el.createEl("a", { text: url, href: url });
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
					this.removeDummyBlock(el);
					MarkdownRenderer.render(
						this.app,
						`>[!WARNING] Cannot find video\n>${info.url}`,
						el,
						sourcePath,
						component
					);
					return;
				}

				if (this.hasManyUrls(sourceLines)) {
					const component = new MarkdownRenderChild(el);
					this.removeDummyBlock(el);
					MarkdownRenderer.render(
						this.app,
						`>[!WARNING] Cannot accept multiple video URLs`,
						el,
						sourcePath,
						component
					);
					return;
				}

				// Sketchy? Can get be called infinitely if this.storeVideoInfo changes text
				// and it doesn't make this.parseStoredInfo set info.infoStored to true
				if (this.settings.storeInfo && !info.infoStored) {
					this.storeVideoInfo(info, el, ctx);
				}

				if (!this.settings.storeInfo && sourceLines.length > 1) {
					this.removeStoredInfo(info, el, ctx);
				}

				this.removeDummyBlock(el);
				this.createThumbnail(el, info);
			}
		);

		this.addCommand({
			id: "insert-thumbnail-from-clipboard",
			name: "Insert thumbnail from URL in clipboard",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const clipText = await navigator.clipboard.readText();
				const id = await this.getVideoId(clipText);
				if (id === "") {
					new Notice("No valid video in clipboard", 2000);
					return;
				}
				editor.replaceSelection(`\`\`\`vid\n${clipText}\n\`\`\``);
			},
		});

		this.addCommand({
			id: "insert-video-title-link",
			name: "Insert video title link from URL in clipboard",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const clipText = await navigator.clipboard.readText();
				const id = await this.getVideoId(clipText);
				if (id === "") {
					new Notice("No valid video in clipboard", 2000);
					return;
				}
				const info = await this.getVideoInfo(clipText);

				editor.replaceSelection(`[${info.title}](${info.url})`);
			},
		});
	}

	onunload() {
		if (this.editorObserver) {
			this.editorObserver.disconnect();
		}
	}

	hasManyUrls(lines: string[]): boolean {
		// Will be used for future features
		return (
			lines.length > 1 &&
			lines.every((e) => /^((https*:\/\/)|(www\.))+\S*$/.test(e.trim()))
		);
	}

	createThumbnail(el: HTMLElement, info: VidInfo) {
		let thumbnailUrl = info.thumbnail;
		if (this.pathIsLocal(thumbnailUrl)) {
			const file = this.app.vault.getAbstractFileByPath(thumbnailUrl);

			if (file) {
				//@ts-ignore
				thumbnailUrl = this.app.vault.getResourcePath(file);
			}
		}

		const container = el.createEl("a", {
			href: info.url,
			cls: "thumbnail",
		});
		const imgContainer = container.createDiv({
			cls: "thumbnail-img-container",
		});
		imgContainer.createEl("img", {
			attr: { src: thumbnailUrl },
			cls: "thumbnail-img",
		});
		const iconsContainer = imgContainer.createDiv({
			cls: "img-icons-container",
		});
		const textBox = container.createDiv({ cls: "thumbnail-text" });
		textBox.createDiv({
			text: info.title,
			title: info.title,
			cls: "thumbnail-title",
		});
		textBox.createEl("a", {
			text: info.author,
			href: info.authorUrl,
			title: info.author,
			cls: "thumbnail-author",
		});

		const isInPlaylist = this.isInPlaylist(info.url);
		if (isInPlaylist) {
			const graphic = iconsContainer.createSvg("svg", {
				attr: { height: "24", width: "24", viewBox: "0 0 24 24" },
				cls: "thumbnail-playlist-svg",
			});
			const titleTag = graphic.createSvg("title");
			titleTag.textContent = "In a playlist";
			graphic.createSvg("path", {
				attr: {
					stroke: "white",
					d: "M22 7H2v1h20V7zm-9 5H2v-1h11v1zm0 4H2v-1h11v1zm2 3v-8l7 4-7 4z",
				},
			});
		}

		const timestamp = this.getTimestamp(info.url);
		if (timestamp !== "") {
			iconsContainer.createDiv({ text: timestamp, cls: "timestamp" });
		}
	}

	createDummyBlock(el: HTMLElement) {
		const container = el.createDiv();
		container.addClass("dummy-container");
		// container.createDiv().addClass('dummy-image');
		// container.createDiv().addClass('dummy-title');
	}

	removeDummyBlock(el: HTMLElement) {
		const dummy = el.querySelector(".dummy-container");
		if (dummy) {
			el.removeChild(dummy);
		}
	}

	isInPlaylist(url: string): boolean {
		return url.contains("&list=") || url.contains("?list=");
	}

	getTimestamp(url: string): string {
		let tIndex = url.indexOf("?t=");
		if (tIndex === -1) {
			tIndex = url.indexOf("&t=");
		}
		if (tIndex === -1) {
			tIndex = url.indexOf("#t=");
		}
		if (tIndex === -1) {
			return "";
		}

		const search = /[?&#]t=(?:(\d+)h)*(?:(\d+)m)*(?:(\d+)s)*(\d+)*/.exec(
			url
		);
		search.shift();
		const times = search.map((v) => parseInt(v) || 0);
		//0-h 1-m 2-s 3-s(seconds only format)

		let seconds = times.pop();

		if (times[2] > 59) {
			// Vimeo seconds only format still includes an "s"
			// so it ends up in times[2] instead of times[3]
			seconds = times[2];
		}
		if (seconds) {
			times[2] = seconds % 60;
			times[1] = Math.floor(seconds / 60) % 60;
			times[0] = Math.floor(seconds / 3600);
		}
		const secStr = String(times[2]).padStart(2, "0");
		let minStr = String(times[1]);
		const hrStr = String(times[0]);

		let timeStr = `${minStr}:${secStr}`;
		if (times[0]) {
			minStr = minStr.padStart(2, "0");
			timeStr = `${hrStr}:${minStr}:${secStr}`;
		}

		return timeStr;
	}

	pathIsLocal(path: string): boolean {
		return path.indexOf("https://") !== 0;
	}

	parseStoredInfo(source: string): VidInfo {
		const info: VidInfo = {
			url: "",
			thumbnail: "",
			title: "",
			author: "",
			authorUrl: "",
			vidFound: false,
			networkError: false,
			infoStored: false,
			imageSaved: false,
		};

		const input = source.trim().split("\n");
		if (input.length !== 5) {
			return info;
		}

		const parsedInput = {
			Url: "",
			Title: "",
			Author: "",
			Thumbnail: "",
			AuthorUrl: "",
		};

		for (const [i, line] of input.entries()) {
			if (i !== 0) {
				const matches = line.match(/(\w+): (.+)/);
				if (matches === null) {
					return info;
				}
				const key = matches[1];
				const val = matches[2];

				parsedInput[key as keyof typeof parsedInput] = val;
			} else {
				parsedInput["Url"] = input[0];
			}
		}

		// Check each item is filled
		for (const key in parsedInput) {
			if (Object.prototype.hasOwnProperty.call(parsedInput, key)) {
				const value = parsedInput[key as keyof typeof parsedInput];
				if (!value || value === "") {
					return info;
				}
			}
		}

		info.url = parsedInput["Url"];
		info.title = parsedInput["Title"];
		info.author = parsedInput["Author"];
		info.thumbnail = parsedInput["Thumbnail"];
		info.authorUrl = parsedInput["AuthorUrl"];
		info.vidFound = true;

		if (this.pathIsLocal(info.thumbnail)) {
			// Check file exists
			const existingFile = this.app.vault.getAbstractFileByPath(
				info.thumbnail
			);

			if (existingFile) {
				info.imageSaved = true;
			} else if (this.settings.saveImages) {
				return info;
			}

			if (!this.settings.saveImages) {
				return info;
			}
		} else if (this.settings.saveImages) {
			return info;
		}

		info.infoStored = true;

		return info;
	}

	async storeVideoInfo(
		info: VidInfo,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) {
		const section = ctx.getSectionInfo(el);

		if (!section) {
			return;
		}

		if (this.settings.saveImages && !info.imageSaved) {
			info.thumbnail = await this.saveImage(info);
		}

		const content = `\`\`\`vid\n${info.url}\nTitle: ${info.title}\nAuthor: ${info.author}\nThumbnail: ${info.thumbnail}\nAuthorUrl: ${info.authorUrl}\n\`\`\``;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			const startPos: EditorPosition = {
				line: section.lineStart,
				ch: 0,
			};

			const endPos: EditorPosition = {
				line: section.lineEnd,
				ch: view.editor.getLine(section.lineEnd).length,
			};

			view.editor.replaceRange(content, startPos, endPos);
		}
	}

	async saveImage(info: VidInfo): Promise<string> {
		// Save image and return path, or url if save failed

		// TODO
		// - getAvailablePathForAttachment gives indexed file locations when file exists, exisiting file check misses relative paths
		// - Make relative paths work for "specified folder" setting
		//   - As is relative paths in `filePath` turn out relative to vault root
		const id = await this.getVideoId(info.url);
		let filePath = "";

		const currentNote = this.app.workspace.getActiveFile();

		if (this.settings.imageLocation === "specifiedFolder") {
			filePath = `${this.settings.imageFolder}/${id}.jpg`;
		} else {
			//@ts-ignore
			// let attachmentPath = this.app.vault.getConfig('attachmentFolderPath');
			// If last character is '/', trim it
			// if(attachmentPath.substring(attachmentPath.length - 1) === '/'){
			// 	attachmentPath = attachmentPath.substring(0, attachmentPath.length - 1);
			// }
			// filePath = `${attachmentPath}/${id}.jpg`;

			//@ts-ignore
			filePath = await this.app.vault.getAvailablePathForAttachments(
				id,
				"jpg",
				currentNote
			);
			// method source: https://forum.obsidian.md/t/api-get-the-directory-of-the-default-location-for-new-attachments-setting/36847/2

			//Regex to remove number from end of path from `getAvailablePathForAttachments`
			const pathRegex = /(.*) \d+\.jpg/;
			filePath = filePath.replace(pathRegex, "$1.jpg");
		}

		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		// this check isn't catching relative subfolder paths

		if (existingFile) {
			// file exists
			return existingFile.path;
		}

		const folderMatch = filePath.match(/(.+)\/.+\.jpg/);
		if (folderMatch) {
			const folderPath = folderMatch[1];

			const existingFolder =
				this.app.vault.getAbstractFileByPath(folderPath);

			if (
				this.settings.imageLocation === "specifiedFolder" &&
				!existingFolder
			) {
				new Notice(
					`Thumbnails: The folder you specified (${this.settings.imageFolder}) does not exist.`
				);
				return info.thumbnail;
			}
		}

		const reqParam: RequestUrlParam = {
			url: info.thumbnail,
		};

		let file: TFile;

		try {
			const req = await requestUrl(reqParam);

			if (req.status === 200) {
				// Relative paths in `filePath` turn out relative to vault root
				file = await this.app.vault.createBinary(
					filePath,
					req.arrayBuffer
				);
			} else {
				// HTTP fail
			}
		} catch (error) {
			// If error when saving, just return thumbnail url
			console.log(error);

			return info.thumbnail;
		}

		if (file) {
			const localUrl = file.path;
			return localUrl;
		}

		return info.thumbnail;
	}

	getTrimmedResourcePath(file: TAbstractFile): string {
		//@ts-ignore
		const path = this.app.vault.getResourcePath(file);
		const endPos = path.indexOf(".jpg") + 4;
		return path.substring(0, endPos);
	}

	removeStoredInfo(
		info: VidInfo,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext
	) {
		const section = ctx.getSectionInfo(el);

		if (!section) {
			return;
		}

		const content = `\`\`\`vid\n${info.url}\n\`\`\``;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) {
			const startPos: EditorPosition = {
				line: section.lineStart,
				ch: 0,
			};

			const endPos: EditorPosition = {
				line: section.lineEnd,
				ch: view.editor.getLine(section.lineEnd).length,
			};

			view.editor.replaceRange(content, startPos, endPos);
		}
	}

	async getVideoInfo(url: string): Promise<VidInfo> {
		const info: VidInfo = {
			url: url,
			thumbnail: "",
			title: "",
			author: "",
			authorUrl: "",
			vidFound: false,
			networkError: false,
			infoStored: false,
			imageSaved: false,
		};
		let reqUrl = "";
		let isYoutube = false;
		for (const type of URL_TYPES.youtube) {
			if (url.includes(type.match)) {
				isYoutube = true;
			}
		}
		let isVimeo = false;
		for (const type of URL_TYPES.vimeo) {
			if (url.includes(type.match)) {
				isVimeo = true;
			}
		}
		let isOdysee = false;
		for (const type of URL_TYPES.odysee) {
			if (url.includes(type.match)) {
				isOdysee = true;
			}
		}

		// Use oEmbed to get data (https://oembed.com/)
		if (isYoutube) {
			reqUrl = `https://www.youtube.com/oembed?format=json&url=${url}`;
		} else if (isVimeo) {
			reqUrl = `https://vimeo.com/api/oembed.json?url=${url}`;
		} else if (isOdysee) {
			// Odysee doesn't have oEmbed, use HTML scraping
			try {
				const odyseeInfo = await this.fetchOdyseeVideoInfo(url);
				if (odyseeInfo.title) {
					info.title = odyseeInfo.title;
					info.author = odyseeInfo.author || "";
					info.authorUrl = odyseeInfo.authorUrl || "";
					info.thumbnail = odyseeInfo.thumbnail || "";
					info.vidFound = true;
				}
			} catch (error) {
				console.error(error);
				info.networkError = true;
			}
			return info;
		} else {
			//vid not found
			return info;
		}

		try {
			const reqParam: RequestUrlParam = {
				url: reqUrl,
				throw: false,
			};
			const res = await requestUrl(reqParam);

			if (res.status === 200) {
				info.title = res.json.title;
				info.author = res.json.author_name;
				info.authorUrl = res.json.author_url;

				info.vidFound = true;
			} else if (this.settings.youtubeApiKey && isYoutube) {
				console.log("Thumbnails: Oembed failed, using YouTube API");

				const videoId = await this.getVideoId(url);
				const youtubeUrl = `https://youtube.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${this.settings.youtubeApiKey}`;
				const youtubeReqParam: RequestUrlParam = {
					url: youtubeUrl,
					throw: false,
				};
				const youtubeApiRes = await requestUrl(youtubeReqParam);

				if (youtubeApiRes.status === 200) {
					const vidSnippet = youtubeApiRes.json.items[0].snippet;

					info.authorUrl = "javascript:void(0)";
					const channelQueryUrl = `https://youtube.googleapis.com/youtube/v3/channels?part=snippet&id=${vidSnippet.channelId}&key=${this.settings.youtubeApiKey}`;
					const channelQueryParam: RequestUrlParam = {
						url: channelQueryUrl,
						throw: false,
					};
					const channelQueryRes = await requestUrl(channelQueryParam);

					if (channelQueryRes.status === 200) {
						const channelSnippet =
							channelQueryRes.json.items[0].snippet;
						const channelCustomUrl = channelSnippet.customUrl;
						const channelUrl = `https://www.youtube.com/${channelCustomUrl}`;
						info.authorUrl = channelUrl;
					}

					info.title = vidSnippet.title;
					info.author = vidSnippet.channelTitle;
					// The api doesn't give back an author url. Could make another API call to find author url using channel ID.
					// To avoid making another API call, I'm just making it an empty link.
					// info.authorUrl = 'javascript:void(0);';
					info.vidFound = true;
				}
			}

			if (info.vidFound) {
				if (isYoutube) {
					// Use "mqdefault.jpg" instead of the "hqdefault.jpg" that oEmbed returns
					// "hqdefault.jpg" is letterboxed, "mqdefault.jpg" is cropped
					const videoId = await this.getVideoId(url);
					info.thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
				} else {
					info.thumbnail = res.json.thumbnail_url;
				}
			}
		} catch (error) {
			console.error(error);
			// Network error
			info.networkError = true;
		}

		return info;
	}

	async getVideoId(url: string): Promise<string> {
		let id = "";
		for (const type of URL_TYPES.youtube) {
			if (url.includes(type.match)) {
				const matches = url.match(type.idPattern);
				if (matches !== null) {
					id = matches[1];
				}
			}
		}
		const vimeoType = URL_TYPES.vimeo[0];
		if (url.includes(vimeoType.match)) {
			const matches = url.match(vimeoType.idPattern);
			if (matches !== null) {
				id = matches[1];
				if (!/^[0-9]+$/.exec(id)) {
					// Special vimeo url's that don't contain a video id
					id = await this.fetchVimeoVideoId(url);
				}
			}
		}
		const odyseeType = URL_TYPES.odysee[0];
		if (url.includes(odyseeType.match)) {
			const matches = url.match(odyseeType.idPattern);
			if (matches !== null) {
				// Combine channel and video IDs for unique identifier
				id = `${matches[1]}_${matches[2]}`;
			}
		}
		return id;
	}

	async fetchVimeoVideoId(url: string): Promise<string> {
		let id = "";
		try {
			const reqParam: RequestUrlParam = {
				url: `https://vimeo.com/api/oembed.json?url=${url}`,
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

	async fetchOdyseeVideoInfo(url: string): Promise<Partial<VidInfo>> {
		try {
			const reqParam: RequestUrlParam = {
				url: url,
				throw: false,
			};

			const res = await requestUrl(reqParam);

			if (res.status === 200) {
				const html = res.text;
				const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);

				if (jsonLdMatch && jsonLdMatch[1]) {
					const jsonLd = JSON.parse(jsonLdMatch[1]);

					if (jsonLd["@type"] === "VideoObject") {
						let thumbnailUrl = "";
						if (Array.isArray(jsonLd.thumbnailUrl)) {
							thumbnailUrl = jsonLd.thumbnailUrl[0] || "";
						} else if (typeof jsonLd.thumbnailUrl === "string") {
							thumbnailUrl = jsonLd.thumbnailUrl;
						}

						let authorName = "";
						let authorUrl = "";
						if (typeof jsonLd.author === "object" && jsonLd.author !== null) {
							authorName = jsonLd.author.name || "";
							authorUrl = jsonLd.author.url || "";
						} else if (typeof jsonLd.author === "string") {
							authorName = jsonLd.author;
						}

						return {
							title: jsonLd.name || jsonLd.title || "",
							author: authorName,
							authorUrl: authorUrl,
							thumbnail: thumbnailUrl,
						};
					}
				}
			}
		} catch (error) {
			console.error("Odysee metadata fetch error:", error);
		}

		return {};
	}
}
