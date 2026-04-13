# Ant Media / Castlabs DRM WebRTC Player

Sample media player for DRM-protected playback: Ant Media WebRTC player with integrated Castlabs DRM transform module acquiring playback licenses from DRMtoday.

## Run instructions

Install Ant Media server locally, configure encrypting RTMP relay (instructions for this are provided separately), start streaming unencrypted media into the relay with `ffmpeg`, `OBS Studio`, etc. Serve the player:

```bash
python3 -m http.server 8000
```

Open in Chrome, select `DRM` encryption, set your DRMtoday `Merchant id`, and `Key id` if necessary, and press `Play`:

`http://127.0.0.1:8000/live/play.html?id=stream`
