# Project showcases

A project can own an image-and-video carousel without making media mandatory
for every project. Add `showcase` to `website/project.json` only when reviewed
media is ready. If the property is absent, the site renders no empty showcase
or placeholder.

## Add the media

Keep showcase files inside the project repository:

```text
website/assets/showcase/
├── speak.png
├── review.mp4
├── review-poster.jpg
└── send.webp
```

Supported images are AVIF, GIF, JPEG, PNG, and WebP. Supported videos are MP4,
OGG/OGV, and WebM. Use short, web-sized files; videos keep native browser
controls and do not autoplay.

## Add the manifest block

```json
{
  "developmentLabel": "Product in development",
  "showcase": {
    "title": "BetterFingers showcase",
    "summary": "Follow a voice command from speech through review to action.",
    "variant": "workflow",
    "loop": true,
    "slides": [
      {
        "id": "voice-workflow",
        "title": "Speak it. Review it. Send it.",
        "summary": "Three project-owned views can share one scene.",
        "layout": "triptych",
        "media": [
          {
            "type": "image",
            "path": "website/assets/showcase/speak.png",
            "alt": "BetterFingers listening view",
            "title": "Speak it",
            "caption": "Current listening interface.",
            "fit": "contain"
          },
          {
            "type": "video",
            "path": "website/assets/showcase/review.mp4",
            "poster": "website/assets/showcase/review-poster.jpg",
            "alt": "BetterFingers review interaction",
            "title": "Review it",
            "muted": true
          },
          {
            "type": "image",
            "path": "website/assets/showcase/send.webp",
            "alt": "BetterFingers command completion view",
            "title": "Send it"
          }
        ]
      }
    ]
  }
}
```

`developmentLabel` is independent of the carousel. Use it for a truthful,
professional watermark such as `Product in development`, even when the project
has no showcase yet. Omit it for finished work or when no label is appropriate.

## Choose the presentation

- `variant: "gallery"` is the neutral default.
- `variant: "workflow"` adds directional connectors between media pieces.
- `variant: "cinematic"` favors a 16:9 presentation.
- `layout: "single"`, `"split"`, or `"triptych"` controls one, two, or three
  pieces in a scene. A slide accepts one to three pieces.
- `loop: false` stops at the first and last slide. The default is `true`.
- `fit: "contain"` preserves the whole interface; `"cover"` fills the frame.

Every image needs useful `alt` text. Every video needs an `alt` description;
add a poster image when a representative still is available. Titles and
captions are optional. Do not use remote URLs, placeholders, private footage,
or media that claims an unfinished capability is already available.

## Validate and preview

```sh
node /home/roygslade/Desktop/DonavenCrenshaw/scripts/validateProjectSource.mjs \
  --source /path/to/your-project

cd /home/roygslade/Desktop/DonavenCrenshaw
PROJECT_SOURCE_ROOT=/path/to/projects SITE_BASE=/ npm run verify
PROJECT_SOURCE_ROOT=/path/to/projects SITE_BASE=/ npm run dev
```

Check the carousel at desktop and mobile widths, use its previous/next buttons
and dots, play each video, and confirm the browser console has no missing-media
errors. Removing `showcase` must leave the rest of the project page intact.
