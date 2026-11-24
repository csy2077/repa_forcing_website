/* REPA-Forcing project page: reels, synced comparison viewers, tabs, misc. */
(function () {
  "use strict";
  const DATA = window.REPA_DATA || {};
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const el = (tag, attrs = {}, kids = []) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "style") n.style.cssText = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    }
    for (const c of [].concat(kids)) if (c) n.append(c);
    return n;
  };
  const fmt = (t) => {
    if (!isFinite(t)) t = 0;
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(1).padStart(4, "0")}`;
  };
  // aspect ratios of the source videos per setting
  const AR = { robot: "4 / 3", i2v: "1280 / 704", streaming: "832 / 480" };

  /* ------------------------------------------------------------- lazy video */
  const lazyIO = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) {
        if (!v.src && v.dataset.src) v.src = v.dataset.src;
        if (v.dataset.autoplay === "1") v.play().catch(() => {});
      } else if (v.dataset.autoplay === "1" && !v.paused) {
        v.pause();
      }
    }
  }, { rootMargin: "200px 0px" }) : null;
  const lazy = (v) => { if (lazyIO) lazyIO.observe(v); else v.src = v.dataset.src; };

  /* ------------------------------------------------------------------- reel */
  function buildReels() {
    const pools = [
      [...(DATA.i2v || []).slice(0, 6), ...(DATA.robot || []).slice(0, 4), ...(DATA.streaming || []).slice(0, 4)].map((s, i) => ({ s, i })),
      [...(DATA.streaming || []).slice(4), ...(DATA.i2v || []).slice(6), ...(DATA.robot || []).slice(4)].map((s, i) => ({ s, i })),
    ];
    const tags = new Map(), gens = new Map();
    // [setting, corner tag, generator subtitle shown on hover]
    for (const [k, label, gen] of [
      ["i2v", "I2V", "Wan2.2-5B · 4-step DMD2 distilled"],
      ["streaming", "Streaming", "Causal Wan2.1-1.3B · Self-Forcing distilled"],
      ["robot", "Robot", "Cosmos3-Nano-16B · Self-Forcing distilled"],
    ])
      for (const s of DATA[k] || []) { tags.set(s, label); gens.set(s, gen); }
    document.querySelectorAll(".reel-row").forEach((row) => {
      const pool = pools[+row.dataset.reel] || [];
      const track = el("div", { class: "reel-track" });
      const items = pool.map(({ s }) => {
        const v = el("video", { muted: "", loop: "", playsinline: "", preload: "none", poster: s.posters.ours, "data-src": s.videos.ours, "data-autoplay": reduceMotion ? "0" : "1" });
        v.muted = true;
        return el("div", { class: "reel-item", title: gens.get(s) || "" }, [
          v, el("span", { class: "tag", text: tags.get(s) || "" }), el("span", { class: "sub", text: gens.get(s) || "" }),
        ]);
      });
      // duplicate for a seamless loop (posters only on the copy, to keep bandwidth low)
      items.forEach((n) => track.append(n));
      items.forEach((n) => { const c = n.cloneNode(true); c.setAttribute("aria-hidden", "true"); track.append(c); });
      row.append(track);
      track.querySelectorAll("video").forEach((v) => { v.muted = true; lazy(v); });
    });
  }

  /* ----------------------------------------------------------------- viewer */
  const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>';
  const ICON_PREV = '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>';
  const ICON_RESTART = '<svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/></svg>';

  function buildViewer(root) {
    const setting = root.dataset.setting;
    const samples = DATA[setting] || [];
    if (!samples.length) return;
    const methods = root.dataset.methods.split(",").map((m) => { const [k, ...r] = m.split(":"); return { key: k, label: r.join(":") }; });
    root.style.setProperty("--cols", methods.filter((m) => samples[0].videos[m.key]).length);
    root.style.setProperty("--ar", AR[setting] || "16 / 9");

    const cells = methods.map((m) => {
      const v = el("video", { muted: "", playsinline: "", preload: "none" });
      v.muted = true;
      const kind = m.key === "ours" ? "ours" : m.key === "teacher" ? "teacher" : m.key === "gt" ? "gt" : "base";
      // still: poster image laid over the video until its first frame is on screen (no black flash)
      const still = el("img", { class: "still", alt: "", decoding: "sync" });
      return { m, v, still, node: el("div", { class: `cell ${kind}` }, [v, still, el("span", { class: "label", text: m.label })]) };
    });
    const stage = el("div", { class: "stage" }, cells.map((c) => c.node));
    const btnPrev = el("button", { class: "nav prev", type: "button", "aria-label": "Previous sample" });
    const btnNext = el("button", { class: "nav next", type: "button", "aria-label": "Next sample" });
    btnPrev.innerHTML = ICON_PREV; btnNext.innerHTML = ICON_NEXT;
    // carousel: [ghost -2, ghost -1, live stage, ghost +1, ghost +2]; ghosts are faint poster
    // copies of the neighbouring samples, so a slide reveals the next sample before it loads.
    const multi = samples.length > 1;
    const ghosts = new Map([-2, -1, 1, 2].map((o) => [o, el("div", { class: "stage ghost", "aria-hidden": "true" })]));
    const slideOf = (o) => (o === 0 ? stage : ghosts.get(o));
    const track = el("div", { class: "track" }, multi ? [-2, -1, 0, 1, 2].map(slideOf) : [stage]);
    const stageWrap = el("div", { class: "stage-wrap" + (multi ? " carousel" : "") }, [track, multi ? btnPrev : null, multi ? btnNext : null]);
    const fillGhost = (g, s) => {
      g.replaceChildren(...methods.filter((m) => s.videos[m.key]).map((m) => {
        const c = cells.find((x) => x.m === m);
        return el("div", { class: c.node.className }, [el("img", { src: s.posters[m.key], alt: "", decoding: "async" }), el("span", { class: "label", text: m.label })]);
      }));
      g.style.setProperty("--cols", g.childElementCount);
      g.dataset.idx = samples.indexOf(s);
    };
    const wrap = (i) => (i + samples.length) % samples.length;
    let slideW = 0, gap = 14, peek = 0, animating = false;
    const baseX = () => -2 * (slideW + gap) + peek + gap;
    const layout = () => {
      if (!multi) return;
      const W = stageWrap.clientWidth;
      peek = Math.round(Math.min(96, Math.max(22, W * 0.06)));
      gap = W < 640 ? 10 : 14;
      slideW = W - 2 * (peek + gap);
      track.querySelectorAll(":scope > .stage").forEach((n) => { n.style.width = slideW + "px"; });
      stageWrap.style.setProperty("--peek", peek + gap + "px");
      if (!animating) track.style.transform = `translateX(${baseX()}px)`;
    };
    if (multi && "ResizeObserver" in window) new ResizeObserver(layout).observe(stageWrap);
    else window.addEventListener("resize", layout);
    const btnPlay = el("button", { class: "ctrl", type: "button", "aria-label": "Play" });
    btnPlay.innerHTML = ICON_PLAY;
    const btnRestart = el("button", { class: "ctrl", type: "button", "aria-label": "Restart" });
    btnRestart.innerHTML = ICON_RESTART;
    const fill = el("div", { class: "fill" }), knob = el("div", { class: "knob" });
    const scrub = el("div", { class: "scrub", role: "slider", "aria-label": "Seek", tabindex: "0", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, [fill, knob]);
    const time = el("span", { class: "time", text: "0:00.0 / 0:00.0" });
    // optional speed toggle, e.g. data-speeds="5,2,1" (first = default). Fast speeds swap in
    // pre-rendered fast-forward files (sample.fast[speed]) played at 1x, which stay smooth.
    const speeds = (root.dataset.speeds || "").split(",").map(Number).filter((x) => x > 0);
    let rate = speeds[0] || 1;
    const speedBox = speeds.length ? el("div", { class: "speeds", role: "group", "aria-label": "Playback speed" }) : null;
    const srcOf = (s, k, r) => (r !== 1 && s.fast && s.fast[r] && s.fast[r][k]) || s.videos[k];
    const rateOf = (s) => (rate !== 1 && s.fast && s.fast[rate] ? rate : 1);
    speeds.forEach((x) => {
      const b = el("button", { class: "speed", type: "button", "aria-pressed": x === rate ? "true" : "false", title: `${x}× speed` });
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6l7 6-7 6zM12 6l7 6-7 6z"/></svg>${x}×`;
      b.addEventListener("click", () => {
        if (x === rate) return;
        const frac = master && master.duration ? master.currentTime / master.duration : 0;
        rate = x; load(current, frac);
        speedBox.querySelectorAll(".speed").forEach((n) => n.setAttribute("aria-pressed", n === b ? "true" : "false"));
      });
      speedBox.append(b);
    });
    const controls = el("div", { class: "controls" }, [btnPlay, btnRestart, scrub, time, speedBox]);
    const caption = el("p", { class: "caption" });
    // compact sample strip for jumping straight to a sample
    const strip = el("div", { class: "strip", role: "group", "aria-label": "Jump to sample" });
    const thumbs = samples.map((s, i) => {
      const b = el("button", { class: "thumb", type: "button", "aria-pressed": "false",
        "aria-label": `Sample ${i + 1}${s.tag ? " · " + s.tag : ""}`, title: [s.tag, s.caption].filter(Boolean).join(" · ") || `Sample ${i + 1}` },
        [el("img", { src: s.posters.ours, alt: "", loading: "lazy", decoding: "async" }), el("span", { text: String(i + 1) })]);
      b.addEventListener("click", () => go(i));
      strip.append(b);
      return b;
    });
    root.append(stageWrap, controls, caption, multi ? strip : null);

    const allVids = cells.map((c) => c.v);
    let vids = allVids;          // columns present for the current sample (some are optional)
    let master = vids[0];
    let playing = false, loaded = false, current = 0, visible = false, t0 = 0, vrate = 1;

    const setPlayIcon = () => { btnPlay.innerHTML = playing ? ICON_PAUSE : ICON_PLAY; btnPlay.setAttribute("aria-label", playing ? "Pause" : "Play"); };
    const playAll = () => { playing = true; setPlayIcon(); vids.forEach((v) => v.play().catch(() => {})); };
    const pauseAll = () => { playing = false; setPlayIcon(); vids.forEach((v) => v.pause()); };
    const seekAll = (t) => vids.forEach((v) => { try { v.currentTime = t; } catch (_) {} });

    let loadTok = 0;
    function load(idx, frac = 0) {
      current = idx;
      loadTok++;
      const s = samples[idx];
      pauseAll();
      cells.forEach((c) => {
        const has = !!s.videos[c.m.key];
        c.node.hidden = !has;
        if (has) {
          c.still.src = s.posters[c.m.key]; c.still.classList.remove("off");
          c.v.poster = s.posters[c.m.key]; c.v.src = srcOf(s, c.m.key, rate); c.v.load();
          const tok = loadTok, reveal = () => { if (tok === loadTok) c.still.classList.add("off"); };
          if (c.v.requestVideoFrameCallback) c.v.requestVideoFrameCallback(reveal);
          else c.v.addEventListener("playing", reveal, { once: true });
        }
        else { c.v.removeAttribute("src"); c.v.removeAttribute("poster"); c.v.load(); }
      });
      vrate = rateOf(s);
      t0 = s.t0 || 0;     // clips cut from a longer rollout show the original rollout time
      vids = cells.filter((c) => !c.node.hidden).map((c) => c.v);
      master = vids[0];
      stage.style.setProperty("--cols", vids.length);
      loaded = true;
      caption.innerHTML = "";
      caption.append(...[el("span", { class: "cap-k", text: `${idx + 1} / ${samples.length}` }),
        s.tag && el("span", { class: "cap-tag", text: s.tag }), document.createTextNode(s.caption)].filter(Boolean));
      thumbs.forEach((b, i) => b.setAttribute("aria-pressed", i === idx ? "true" : "false"));
      const tb = thumbs[idx];
      if (tb && strip.scrollWidth > strip.clientWidth)   // keep the active thumb in view (no page scroll)
        strip.scrollTo({ left: tb.offsetLeft - (strip.clientWidth - tb.offsetWidth) / 2, behavior: reduceMotion ? "auto" : "smooth" });
      if (multi) for (const [o, g] of ghosts) fillGhost(g, samples[wrap(idx + o)]);
      if (frac > 0) {     // speed change: keep the same position in the rollout
        vids.forEach((v) => {
          const go = () => { try { v.currentTime = frac * v.duration; } catch (_) {} };
          if (v.readyState >= 1) go(); else v.addEventListener("loadedmetadata", go, { once: true });
        });
      }
      if (visible) playAll(); else pauseAll();
    }

    // slide to sample `target` from direction `dir` (+1: comes in from the right)
    function go(target, dir) {
      target = wrap(target);
      if (target === current || animating) return;
      if (!loaded) { load(target); return; }
      dir = dir || (target > current ? 1 : -1);
      if (reduceMotion || !slideW) { load(target); return; }
      pauseAll();
      fillGhost(ghosts.get(dir), samples[target]);              // jumps: show the target next door
      fillGhost(ghosts.get(2 * dir), samples[wrap(target + dir)]);
      for (const m of methods) if (samples[target].posters[m.key]) { const im = new Image(); im.src = samples[target].posters[m.key]; im.decode && im.decode().catch(() => {}); }
      animating = true;
      stageWrap.classList.add("moving");
      ghosts.get(dir).classList.add("incoming");
      stage.classList.add("outgoing");
      track.style.transition = "transform .55s cubic-bezier(.22,.8,.24,1)";
      track.style.transform = `translateX(${baseX() - dir * (slideW + gap)}px)`;
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        track.removeEventListener("transitionend", onEnd);
        // swap instantly: no transform or opacity transitions while the slides are reset
        const slides = [...track.children];
        track.style.transition = "none";
        slides.forEach((n) => { n.style.transition = "none"; });
        stageWrap.classList.remove("moving");
        ghosts.get(dir).classList.remove("incoming");
        stage.classList.remove("outgoing");
        load(target);                                           // live cells show the same poster at once
        track.style.transform = `translateX(${baseX()}px)`;
        void track.offsetWidth;                                 // commit the reset before re-enabling motion
        track.style.transition = "";
        slides.forEach((n) => { n.style.transition = ""; });
        animating = false;
      };
      const onEnd = (e) => { if (e.target === track && e.propertyName === "transform") finish(); };
      track.addEventListener("transitionend", onEnd);
      setTimeout(finish, 800);                                  // fallback if transitionend is missed
    }
    const step = (d) => go(current + d, d);
    btnPrev.addEventListener("click", () => step(-1));
    btnNext.addEventListener("click", () => step(1));
    ghosts.forEach((g, o) => g.addEventListener("click", () => step(Math.sign(o))));
    // swipe left/right on touch screens
    let sx = null;
    stageWrap.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
    stageWrap.addEventListener("touchend", (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 50 && samples.length > 1) step(dx < 0 ? 1 : -1);
    });

    // keep followers in sync with the master clock; restart together at the end
    allVids.forEach((mv) => mv.addEventListener("timeupdate", () => {
      if (mv !== master) return;
      const d = master.duration || 0, t = master.currentTime;
      const p = d ? (t / d) * 100 : 0;
      fill.style.width = p + "%"; knob.style.left = p + "%";
      scrub.setAttribute("aria-valuenow", Math.round(p));
      time.textContent = `${fmt(t * vrate + t0)} / ${fmt(d * vrate + t0)}`;   // in rollout time
      for (const v of vids) if (v !== master && Math.abs(v.currentTime - t) > 0.15) { try { v.currentTime = t; } catch (_) {} }
    }));
    allVids.forEach((v) => v.addEventListener("ended", () => {
      if (!vids.includes(v)) return;
      if (vids.every((x) => x.ended || x.currentTime >= (x.duration || 0) - 0.05)) { seekAll(0); if (playing) playAll(); }
    }));

    btnPlay.addEventListener("click", () => (playing ? pauseAll() : playAll()));
    btnRestart.addEventListener("click", () => { seekAll(0); playAll(); });
    const seekFrom = (x) => {
      const r = scrub.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (x - r.left) / r.width));
      if (master.duration) seekAll(f * master.duration);
    };
    scrub.addEventListener("pointerdown", (e) => {
      scrub.setPointerCapture(e.pointerId); seekFrom(e.clientX);
      const move = (ev) => seekFrom(ev.clientX);
      const up = () => { scrub.removeEventListener("pointermove", move); scrub.removeEventListener("pointerup", up); };
      scrub.addEventListener("pointermove", move); scrub.addEventListener("pointerup", up);
    });
    scrub.addEventListener("keydown", (e) => {
      if (!master.duration) return;
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        seekAll(Math.min(master.duration, Math.max(0, master.currentTime + (e.key === "ArrowRight" ? 1 : -1))));
      } else if (e.key === " ") { e.preventDefault(); playing ? pauseAll() : playAll(); }
    });

    // load on first view; pause when scrolled away or tab hidden
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        visible = e.isIntersecting && !root.closest("[hidden]");
        if (visible && !loaded) { layout(); load(0); }
        else if (visible && !reduceMotion) playAll();
        else if (!visible && playing) pauseAll();
      }
    }, { threshold: 0.25 });
    io.observe(root);
    root._pause = pauseAll;
    root._wake = () => { visible = true; layout(); if (!loaded) load(0); else if (!reduceMotion) playAll(); };
    if (reduceMotion) playing = false;
  }

  /* ------------------------------------------------------------------- tabs */
  function buildTabs() {
    document.querySelectorAll("[data-tabs]").forEach((box) => {
      const tabs = [...box.querySelectorAll('[role="tab"]')];
      const select = (tab) => {
        tabs.forEach((t) => {
          const on = t === tab;
          t.setAttribute("aria-selected", on ? "true" : "false");
          t.tabIndex = on ? 0 : -1;
          const panel = document.getElementById(t.getAttribute("aria-controls"));
          panel.hidden = !on;
          panel.querySelectorAll(".viewer").forEach((v) => (on ? v._wake && v._wake() : v._pause && v._pause()));
        });
      };
      tabs.forEach((t, i) => {
        t.addEventListener("click", () => select(t));
        t.addEventListener("keydown", (e) => {
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
          n.focus(); select(n);
        });
      });
    });
  }

  /* ------------------------------------------------------------ hero canvas */
  // drifting token grid with a few highlighted relations, a nod to token-relation alignment
  function heroCanvas() {
    const c = document.querySelector(".hero-flow");
    if (!c) return;
    const ctx = c.getContext("2d");
    let w, h, dpr, pts = [];
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = c.clientWidth; h = c.clientHeight;
      c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const step = Math.max(34, Math.min(56, w / 28));
      pts = [];
      for (let y = step / 2; y < h; y += step) for (let x = step / 2; x < w; x += step) pts.push({ x, y, p: Math.random() * Math.PI * 2 });
    };
    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const q of pts) {
        const a = 0.18 + 0.14 * Math.sin(t / 1600 + q.p);
        ctx.fillStyle = `rgba(199,204,212,${a})`;
        ctx.fillRect(q.x - 1, q.y - 1, 2, 2);
      }
      const n = pts.length;
      if (n) {
        ctx.lineWidth = 1;
        for (let k = 0; k < 14; k++) {
          const i = Math.floor(((k * 9973 + Math.floor(t / 2600) * 131) % n));
          const j = Math.floor(((k * 7919 + Math.floor(t / 2600) * 197 + 37) % n));
          const A = pts[i], B = pts[j];
          if (Math.hypot(A.x - B.x, A.y - B.y) > 420) continue;
          const ph = (t % 2600) / 2600, al = Math.sin(ph * Math.PI) * 0.35;
          ctx.strokeStyle = `rgba(123,215,154,${al})`;
          ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        }
      }
      if (!reduceMotion) requestAnimationFrame(draw);
    };
    resize(); window.addEventListener("resize", resize);
    requestAnimationFrame(draw);
  }

  /* ------------------------------------------------------------------- misc */
  function misc() {
    const bar = document.querySelector(".topbar");
    const onScroll = () => bar.classList.toggle("scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();

    const btn = document.querySelector(".menu-btn"), nav = document.querySelector(".topnav");
    btn.addEventListener("click", () => { const o = nav.classList.toggle("open"); btn.setAttribute("aria-expanded", o); });
    nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => { nav.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }));

    const links = [...nav.querySelectorAll("a")];
    const secs = links.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
    const spy = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
    }, { rootMargin: "-45% 0px -50% 0px" });
    secs.forEach((s) => spy.observe(s));

    document.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
      const txt = document.querySelector(b.dataset.copy).textContent;
      try { await navigator.clipboard.writeText(txt); b.textContent = "Copied"; } catch (_) { b.textContent = "Select & copy"; }
      setTimeout(() => (b.textContent = "Copy"), 1600);
    }));

    if (window.renderMathInElement) {
      renderMathInElement(document.body, { delimiters: [{ left: "\\[", right: "\\]", display: true }, { left: "\\(", right: "\\)", display: false }], throwOnError: false });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    buildReels();
    document.querySelectorAll(".viewer").forEach(buildViewer);
    buildTabs();
    heroCanvas();
    misc();
  });
})();
