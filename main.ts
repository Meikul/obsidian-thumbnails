import axios from 'axios';
import { Editor, MarkdownRenderer, MarkdownRenderChild, Plugin, MarkdownView, Notice } from 'obsidian';

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
				editor.getDoc().replaceSelection(`\`\`\`vid\n${clipText}\n\`\`\``);
				console.log('Insert video: ', id);
			},
		});
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

	async getVideoInfo(url: string): Promise<VidInfo>{
		let thumbnail = '';
		let title = '';
		let author = '';
		let authorUrl = '';
		let vidFound = false;
		let networkError = false;
		let reqUrl = '';
		const videoId = this.getVideoId(url);
		const isYoutube = url.includes('https://www.youtube.com/watch?v=') || url.includes('https://youtu.be/');

		// Use oEmbed to get data (https://oembed.com/)
		if(isYoutube){
			reqUrl = `https://www.youtube.com/oembed?format=json&url=${url}`;
		}
		else if(url.includes('https://vimeo.com/')){
			reqUrl = `https://vimeo.com/api/oembed.json?url=${url}`;
		}

		try {
			const res = await axios.get(reqUrl);
			if(isYoutube){
				// Doesn't use the returned thumbnail because it's usually letterboxed
				thumbnail = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
			}
			else{
				thumbnail = res.data.thumbnail_url;
			}
			title = res.data.title;
			author = res.data.author_name;
			authorUrl = res.data.author_url;
			vidFound = true;
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
			vidFound,
			networkError
		};
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
		return id;
	}
}
