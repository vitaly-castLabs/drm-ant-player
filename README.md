# Ant Media / Castlabs DRM WebRTC Player

Sample media player for DRM-protected playback: Ant Media WebRTC player with integrated Castlabs DRM transform module acquiring playback licenses from DRMtoday.

## Run instructions

Install Ant Media server locally, configure encrypting RTMP relay (instructions for this are provided separately), start streaming unencrypted media into the relay with `ffmpeg`, `OBS Studio`, etc. Serve the player:

```bash
python3 -m http.server 8000
```
Note that HTTPS (self-signed certs are fine) is preferred since DRM won't function outside localhost context with HTTP. A simple performant HTTPS server with pre-generated self-signed certtificate can be found at https://github.com/vitaly-castLabs/httpsrv.

Open in Chrome, Edge or Safari (the latter will only work if you already obtained and set up FairPlay certificate), select `DRM` encryption, set your DRMtoday `Merchant id`, and `Key id` if necessary, and press `Play`:

`http://127.0.0.1:8000/live/play.html?id=stream`
