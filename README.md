![version badge](https://img.shields.io/github/v/release/Meikul/obsidian-thumbnails)
<!-- ![downloads badge](https://img.shields.io/github/downloads/Meikul/obsidian-thumbnails/total.svg) -->
# Obsidian Thumbnails
This plugin lets you insert video thumbnails into your notes to help you keep track of what you're actually linking.

Works with Youtube and Vimeo.
![](https://raw.githubusercontent.com/Meikul/obsidian-thumbnails/master/demo_images/block_demo.gif)

## Usage
Place a code block with the `vid` type, and include the link to your video:
````markdown
```vid
https://youtu.be/dQw4w9WgXcQ
```
````
Should work with any video url format, including links with timecodes.
## Commands
### Insert thumbnail from URL in clipboard
If you have a video URL in your clipboard, this command will create the code block for you.
## Offline Options
If you're offline, the thumbnails will just appear like a normal link.
### Save Thumbnail Info
If you want your thumbnails to work offline, you can enable `Save Thumbnail Info` in the settings tab. The image will be blank, but it will show the title and channel like normal.
### Save Images
If you also want to store the images locally, you can enable `Save Images` in the settings tab.
