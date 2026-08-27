# WhisperX transcript worker

The API stores each job in PostgreSQL and processes one episode at a time. A backend restart safely returns an interrupted job to the queue. New episodes are queued after creation; the first enabled startup queues existing episodes that have stored audio.

## Ubuntu CPU setup

```bash
cd /root/podcast-backend
sudo apt-get update
sudo apt-get install -y python3-venv ffmpeg
python3 -m venv .venv-whisperx
.venv-whisperx/bin/pip install --upgrade pip
.venv-whisperx/bin/pip install -r requirements-whisperx.txt
```

Add the values from `whisperx.env.example` to the backend `.env`, with:

```dotenv
WHISPERX_ENABLED=true
WHISPERX_AUTO_BACKFILL=true
WHISPERX_LANGUAGE=en
WHISPERX_PYTHON=/root/podcast-backend/.venv-whisperx/bin/python
WHISPERX_ESTIMATED_REALTIME_FACTOR=1.5
WHISPERX_ESTIMATED_STARTUP_SECONDS=180
```

The transcript dashboard reports the worker phase, percent complete, queue position and an approximate completion time. The estimate is based on episode length and can be calibrated with `WHISPERX_ESTIMATED_REALTIME_FACTOR` after observing this server.

The included `small.en`, CPU and `int8` settings fit a small server better, but long podcast episodes will process slowly. For the highest accuracy, run the worker on an NVIDIA GPU and use `WHISPERX_MODEL=large-v3`, `WHISPERX_DEVICE=cuda`, and `WHISPERX_COMPUTE_TYPE=float16`.

After deploying the Prisma migration, restart the backend. Existing audio is queued automatically. To requeue failed/pending episodes manually:

```bash
npm run transcripts:backfill
```

To regenerate every episode from scratch:

```bash
npm run transcripts:backfill -- --force
```

The dashboard episode editor also provides a per-episode regeneration button and a millisecond sync-offset field. Chapter timestamps remain optional and independent from WhisperX word timings.
