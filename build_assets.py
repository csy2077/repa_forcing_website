"""Transcode result videos into web-friendly MP4s + posters and write assets/js/data.js.

Run from anywhere:  python website/build_assets.py   (re-run after adding/removing videos)
Output files use neutral names and have metadata stripped (anonymous submission).
Sample ids are derived from the source files, so cached encodes stay matched to their
source when samples are added or removed; files no longer referenced are deleted.
"""
import json, os, re, subprocess
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)                                   # repa_forcing_visualization/
TEASER = os.path.join(os.path.dirname(SRC), "teaser_repa_forcing")
OUT = os.path.join(HERE, "assets", "videos")


def s(*p):
    return os.path.join(SRC, *p)


def t(*p):
    return os.path.join(TEASER, *p)


def mp4s(d):
    return sorted(f for f in os.listdir(d) if f.endswith(".mp4"))


def prompt_of(fname):
    return fname.rsplit("-0.mp4", 1)[0].replace("_", " ").strip() + "…"


def slug(text, n=64):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:n].strip("-")


# ---------------------------------------------------------------- exclusions
I2V_EXCLUDE = {27, 104}                       # small-ball press, helicopter
STREAM_EXCLUDE = ("A close-up shot of a living flame wisp",)

SFL = "self_forcing_long"
SF_TEASER = "self forcing (rollout to 30s using deepforcing)"
i2v_id = lambda f: int(f.split("i2v_")[1].split("_")[0])


def stream_sample(dmd2_path, repa_path):
    cap = prompt_of(os.path.basename(dmd2_path))
    return dict(id="p-" + slug(cap), caption=cap, videos={"sf": dmd2_path, "ours": repa_path})


def teaser_stream():
    d, r = t(SF_TEASER, "dmd2"), t(SF_TEASER, "repa")
    out = []
    for f in mp4s(d):
        # the repa copy may use underscores instead of spaces
        match = f if os.path.exists(os.path.join(r, f)) else f.replace(" ", "_")
        out.append(stream_sample(os.path.join(d, f), os.path.join(r, match)))
    return out


# setting -> list of samples; each sample: {"id", "caption", "videos": {method: src}, optional "clip": (start, end|None)}
# teaser picks come first in each setting.
def robot(ep, long, start, end=None):
    """One robot episode cut to [start, end] seconds (end=None: to the last frame)."""
    if long:
        sf, ours, frames = s("robot", "dmd2_long", ep), s("robot", "repa_long", ep), 321
    elif ep == "teaser":
        sf, ours, frames = t("robot", "dmd2", "vision.mp4"), t("robot", "repa", "vision.mp4"), 165
    else:
        sf, ours, frames = s("robot", "dmd2", ep), s("robot", "repa", ep), 165
    n = {"vision.mp4": 1, "vision2.mp4": 2, "vision3.mp4": 3, "vision4.mp4": 4, "teaser": 4}[ep]
    span = f"{start:g}–{end:g} s" if end else f"from {start:g} s"
    return dict(id=f"{'l' if long else 's'}{n}", caption=f"Episode {n} · {frames}-frame rollout · {span}",
                videos={"sf": sf, "ours": ours}, clip=(start, end))


SETTINGS = {
    "robot": [robot("vision2.mp4", True, 17), robot("vision3.mp4", True, 17),
              robot("vision.mp4", False, 2, 8), robot("vision3.mp4", False, 4),
              robot("teaser", False, 5), robot("vision2.mp4", False, 4),
              robot("vision4.mp4", True, 17)],
    "i2v": [dict(id=f"t{i2v_id(f)}", caption="",
                 videos={"dmd2": t("i2v", "dmd2", f), "ours": t("i2v", "repa", f)})
            for f in sorted(mp4s(t("i2v", "dmd2")), key=i2v_id)]
           + [dict(id=f"w{i2v_id(f)}", caption="",
                   videos={"dmd2": s("wani2v", "dmd2", f), "ours": s("wani2v", "repa", f)})
              for f in sorted(mp4s(s("wani2v", "dmd2")), key=i2v_id) if i2v_id(f) not in I2V_EXCLUDE],
    "streaming": teaser_stream()
                 + [stream_sample(s(SFL, "dynamics", "dmd2", f), s(SFL, "dynamics", "repa", f)) for f in mp4s(s(SFL, "dynamics", "dmd2"))]
                 + [stream_sample(s(SFL, "dmd2", f), s(SFL, "repa", f)) for f in mp4s(s(SFL, "dmd2"))
                    if not f.startswith(STREAM_EXCLUDE)],
}


def encode(job):
    src, dst, poster, clip = job
    if os.path.exists(dst) and os.path.exists(poster):
        return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    cut = []
    if clip:
        cut = ["-ss", str(clip[0])] + (["-t", str(clip[1] - clip[0])] if clip[1] else [])
    subprocess.run(["ffmpeg", "-v", "error", "-y", *cut, "-i", src, "-map_metadata", "-1", "-an",
                    "-vf", "scale=-2:'min(480,ih)'", "-c:v", "libx264", "-preset", "slow", "-crf", "26",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "0.5", "-i", dst, "-frames:v", "1",
                    "-vf", "scale=640:-2", "-q:v", "4", poster], check=True)


def main():
    jobs, data, keep = [], {}, set()
    for setting, samples in SETTINGS.items():
        data[setting] = []
        ids = [smp["id"] for smp in samples]
        assert len(ids) == len(set(ids)), f"duplicate ids in {setting}"
        for n, smp in enumerate(samples, 1):
            caption = smp["caption"] or (f"Episode {n}" if setting.startswith("robot") else f"Sample {n}")
            entry = dict(id=smp["id"], caption=caption, videos={}, posters={})
            if smp.get("clip"):
                entry["t0"] = smp["clip"][0]          # shown as the original rollout time
            for method, src in smp["videos"].items():
                assert os.path.exists(src), src
                rel = f"assets/videos/{setting}/{smp['id']}_{method}"
                dst, poster = os.path.join(HERE, rel + ".mp4"), os.path.join(HERE, rel + ".jpg")
                jobs.append((src, dst, poster, smp.get("clip")))
                keep.update([dst, poster])
                entry["videos"][method] = rel + ".mp4"
                entry["posters"][method] = rel + ".jpg"
            data[setting].append(entry)
    with ThreadPoolExecutor(max_workers=6) as ex:
        list(ex.map(encode, jobs))
    removed = 0
    for root, _, files in os.walk(OUT):
        for f in files:
            p = os.path.join(root, f)
            if p not in keep:
                os.remove(p)
                removed += 1
    for root, dirs, _ in os.walk(OUT, topdown=False):
        for d in dirs:
            if not os.listdir(os.path.join(root, d)):
                os.rmdir(os.path.join(root, d))
    os.makedirs(os.path.join(HERE, "assets", "js"), exist_ok=True)
    with open(os.path.join(HERE, "assets", "js", "data.js"), "w") as f:
        f.write("window.REPA_DATA = " + json.dumps(data, indent=1, ensure_ascii=False) + ";\n")
    print(f"{len(jobs)} videos, removed {removed} stale files")
    for k, v in data.items():
        print(f"  {k}: {len(v)} samples")


if __name__ == "__main__":
    main()
