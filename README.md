![version badge](https://img.shields.io/github/v/release/Meikul/obsidian-thumbnails)
<!--![downloads badge](https://img.shields.io/github/downloads/Meikul/obsidian-thumbnails/total.svg)-->
# Obsidian Thumbnails
This plugin lets you insert video thumbnails into your notes to help you keep track of what you're actually linking.

Works with YouTube, Vimeo, and Odysee.
<img src="https://raw.githubusercontent.com/Meikul/obsidian-thumbnails/master/demo_images/block_demo.gif" alt="GIF showing how to create a thumbnail with the plugin">

## Usage
Use the "Insert thumbnail from URL in clipboard" command

***OR***

Manually place a code block with the `vid` type, and include the link to your video:
````markdown
```vid
https://youtu.be/dQw4w9WgXcQ
```
````

**Supported platforms:**
- YouTube - youtube.com, youtu.be (including Shorts and Live streams)
- Vimeo - vimeo.com
- Odysee - odysee.com
## Commands
### Insert thumbnail from URL in clipboard
If you have a video URL in your clipboard, this command will create the code block for you.

### Insert video title link from URL in clipboard
If you have a video URL in your clipboard, this command will automatically create a link with the text set to the video title.

<img src="https://raw.githubusercontent.com/Meikul/obsidian-thumbnails/master/demo_images/title_link_demo.gif" alt="GIF demonstrating the insert video title link command" width="480">

## Offline Settings
### **Save Thumbnail Info**
<span style="opacity:0.65">Default: Enabled</span><br/>
When offline, thumbnails will have blank images but still show the title and channel.
### **Save Images**
<span style="opacity:0.65">Default: Disabled</span><br/>
Store your thumbnail images locally in a location you specify.
