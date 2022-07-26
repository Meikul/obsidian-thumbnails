import { Editor, MarkdownRenderer, MarkdownRenderChild, Plugin, MarkdownView, Notice, requestUrl, RequestUrlParam } from 'obsidian';

interface VidInfo {
	thumbnail: string;
	title: string;
	author: string;
	authorUrl: string;
	vidFound: boolean;
	networkError: boolean;
}

export default class ThumbyPlugin extends Plugin {
	async onload() {
		this.registerMarkdownCodeBlockProcessor('vid', async (source, el, ctx) => {
			const url = source.trim().split('\n')[0];

			const sourcePath =
					typeof ctx == "string"
						? ctx
						: ctx?.sourcePath ??
							this.app.workspace.getActiveFile()?.path ??
							"";

			const info = await this.getVideoInfo(url);

			if(info.networkError){
				// If offline, just show link
				el.createEl('a', {text: source, href: source});
				return;
			}

			if(!info.vidFound){
				const msg = el.createDiv();
				const component = new MarkdownRenderChild(msg);

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
			name: "Insert thumbnail from URL in clipboard",
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const clipText = await navigator.clipboard.readText();
				const id = this.getVideoId(clipText);
				if(id === ''){
					new Notice('No video in clipboard');
					return;
				}
				editor.replaceSelection(`\`\`\`vid\n${clipText}\n\`\`\``);
				console.log('Insert video: ', id);
			},
		});
	}

	onunload() {

	}

	createThumbnail(el: HTMLElement, info: VidInfo, url: string){
		const container = el.createEl('a', {href: url});
		container.addClass('thumbnail');
		container.createEl('img', {attr: {'src': info.thumbnail}}).addClass('thumbnail-img');
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

	async getVideoInfo(url: string): Promise<VidInfo>{
		const info: VidInfo = {
			thumbnail: '',
			title: '',
			author: '',
			authorUrl: '',
			vidFound: false,
			networkError: false
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
