import ThumbyPlugin from "main";
import { App, Modal, Setting } from "obsidian";

export default class SnapshotModal extends Modal {
	input: string;
	plugin: ThumbyPlugin;
	playStop: boolean;
	player: YT.Player;

	constructor(app: App, plugin: ThumbyPlugin){
		super(app);
		this.plugin = plugin;
		this.playStop = true;
	}

	onOpen() {
		const { contentEl } = this;

		contentEl.createEl('h3', { text: 'Video Snapshot' });

		new Setting(contentEl)
			.setName('Video URL')
			.addText((text) => {
				text.onChange((value) => {
					this.input = value;
				})
			})
			.addExtraButton((btn) => {
				btn.setIcon('search');
				btn.onClick(() => {
					this.embedVideo(this.input);
				});
			});
	}

	async embedVideo(url: string) {
		const videoId = await this.plugin.getVideoId(url);
		const result = await this.plugin.getOembed(url);
		if(result.isYoutube){
			this.contentEl.empty();
			// const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&modestbranding=1`;
			// this.contentEl.createEl('script', { attr: { src: 'https://www.youtube.com/iframe_api'}});

			const tag = document.createElement('script');
			tag.id = 'iframe-api-script';
			tag.src = 'https://www.youtube.com/iframe_api';
			// this.contentEl.appendChild(tag);
			const firstScriptTag = document.getElementsByTagName('script')[0];
			firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

			this.contentEl.createEl('div', {attr: {id: 'snapshot-frame'}});

			tag.addEventListener('load', () => {
				window.YT.ready(() => {
					this.player = new window.YT.Player('snapshot-frame', {
						height: '350',
						width: '100%',
						videoId: videoId,
						playerVars: {
							'modestbranding': 1
						},
						events: {
							onReady: this.onPlayerReady.bind(this)
						}
					});
				});
			});

			new Setting(this.contentEl)
				.addButton((btn) => {
					btn.setButtonText('Snapshot');
					btn.onClick((e) => {
						console.log(this.player.getVideoData());
						const canvas = this.contentEl.createEl('canvas', {attr: {}});
						console.log(this.player.getSize());
						const playerSize = this.player.getSize();
						canvas.width = playerSize.width;
						canvas.height = playerSize.height;

						canvas.getContext('2d').drawImage(this.player, 0, 0, canvas.width, canvas.height);
					});
				});
		}
		//"<iframe width="200" height="113" src="https://www.youtube.com/embed/mMvqI9Rw77c?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen title="I&#39;m in Trouble with Mythbusters™"></iframe>"
	}

	onClose(){
		document.getElementById('iframe-api-script')?.remove();
	}

	onPlayerReady(e: YT.PlayerEvent){
		let tIndex = this.input.indexOf('?t=');
		if (tIndex === -1) {
			tIndex = this.input.indexOf('&t=');
		}
		if (tIndex === -1) {
			tIndex = this.input.indexOf('#t=');
		}
		if (tIndex === -1) {
			return '';
		}

		const search = (/[?&#]t=(?:(\d+)h)*(?:(\d+)m)*(?:(\d+)s)*(\d+)*/).exec(this.input);
		search.shift();
		const times = search.map((v) => parseInt(v) || 0);
		//0-h 1-m 2-s 3-s(seconds only format)

		const seconds = times[3];

		const player = e.target;
		player.seekTo(seconds, true);
		// Can't pause immediately, or screen stays black
		player.addEventListener("onStateChange", this.pauseOnPlay.bind(this));
	}

	pauseOnPlay(e: YT.PlayerEvent){
		const player = e.target;
		if(player.getPlayerState() === 1 && this.playStop){
			player.pauseVideo();
			this.playStop = false;
		}
	}
}
