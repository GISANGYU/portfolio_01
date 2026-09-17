/* ==========================================================
   DOA 스타일 포트폴리오 — 인터랙션
   1) 크로매틱 글래스: 레퍼런스의 3D 유리 렌더 대신, 가는 선 수십 개를
      'lighter' 합성으로 겹쳐 박막 간섭(무지개빛 가장자리)을 캔버스로 그린다.
   2) GSAP ScrollTrigger: 스크럽 텍스트 · 브래킷 타이틀 · 숫자 카운트 · 핀 가로 카드
   ========================================================== */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  /* ==========================================================
     1. 크로매틱 글래스 캔버스
     ========================================================== */
  var mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener("pointermove", function (e) {
    mouse.x = e.clientX / window.innerWidth - 0.5;
    mouse.y = e.clientY / window.innerHeight - 0.5;
  });

  /* 경로 함수: u(0~1) → 중심점과 접선. w,h = 캔버스 CSS 크기 */
  var PATHS = {
    // 오른쪽 위에서 흘러내리는 리본
    ribbon: function (u, w, h, t) {
      return {
        x: w * (0.12 + u * 0.78),
        y: h * (0.78 - u * 0.5 + Math.sin(u * 3.2 + t * 0.4) * 0.07 - Math.sin(u * Math.PI) * 0.12)
      };
    },
    // 왼쪽 아래 돔 형태의 호
    arc: function (u, w, h, t) {
      var a = Math.PI * (1 - u);
      return {
        x: w * 0.5 + Math.cos(a) * w * 0.34,
        y: h * 0.72 - Math.sin(a) * h * (0.36 + Math.sin(t * 0.5) * 0.03)
      };
    },
    // X자로 교차하는 두 개의 알약(knot) — 사선 2개를 따로 그림
    knotA: function (u, w, h, t) {
      return { x: w * (0.22 + u * 0.56), y: h * (0.92 - u * 0.84) + Math.sin(u * 6 + t) * 6 };
    },
    knotB: function (u, w, h, t) {
      return { x: w * (0.28 + u * 0.46), y: h * (0.12 + u * 0.8) + Math.cos(u * 6 + t) * 6 };
    },
    // 아래를 향한 프리즘(V)
    prism: function (u, w, h) {
      var x = w * (0.3 + u * 0.4);
      var y = h * (0.05 + (1 - Math.abs(u - 0.5) * 2) * 0.72);
      return { x: x, y: y };
    }
  };

  function drawBand(ctx, path, w, h, t, opt) {
    var N = opt.strands || 42;
    var S = 64;
    var width = opt.width;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    for (var i = 0; i < N; i++) {
      var v = (i / (N - 1)) * 2 - 1; // -1 ~ 1 (리본 폭 방향)
      var edge = Math.pow(Math.abs(v), 7);
      var spec = Math.exp(-Math.pow((v - 0.32) / 0.07, 2));
      var alpha = 0.03 + edge * 0.45 + spec * 0.22;
      ctx.beginPath();
      var prev = null;
      for (var s = 0; s <= S; s++) {
        var u = s / S;
        var p = path(u, w, h, t);
        var q = path(Math.min(1, u + 0.01), w, h, t);
        var o = path(Math.max(0, u - 0.01), w, h, t);
        var tx = q.x - o.x;
        var ty = q.y - o.y;
        var len = Math.hypot(tx, ty) || 1;
        var nx = -ty / len;
        var ny = tx / len;
        // 비틀림: 폭 방향 오프셋에 cos를 곱해 가장자리가 교차하는 리본처럼
        var twist = Math.cos(u * Math.PI * (opt.twist || 1.3) + t * 0.35 + opt.seed);
        var taper = Math.sin(u * Math.PI) * 0.75 + 0.25;
        var off = v * width * twist * taper;
        var x = p.x + nx * off + mouse.sx * opt.parallax;
        var y = p.y + ny * off + mouse.sy * opt.parallax;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        prev = u;
      }
      // 박막 간섭색: 가장자리일수록, 경로 위치에 따라 색상이 돌아간다
      var hue = (opt.seed * 60 + v * 140 + t * 18) % 360;
      var sat = 40 + edge * 60;
      ctx.strokeStyle = "hsla(" + hue.toFixed(0) + "," + sat.toFixed(0) + "%,72%," + alpha.toFixed(3) + ")";
      ctx.lineWidth = 1 + edge * 1.4;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  var glasses = Array.prototype.slice.call(document.querySelectorAll("canvas[data-glass]")).map(function (c) {
    return { el: c, ctx: c.getContext("2d"), type: c.getAttribute("data-glass"), seed: parseFloat(c.getAttribute("data-seed")) || 1, visible: true, w: 0, h: 0 };
  });

  function sizeGlass(g) {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    g.w = g.el.clientWidth;
    g.h = g.el.clientHeight;
    g.el.width = Math.round(g.w * dpr);
    g.el.height = Math.round(g.h * dpr);
    g.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function renderGlass(g, t) {
    var ctx = g.ctx;
    var w = g.w;
    var h = g.h;
    ctx.clearRect(0, 0, w, h);
    var base = { seed: g.seed, parallax: 18 };
    if (g.type === "ribbon") {
      drawBand(ctx, PATHS.ribbon, w, h, t, Object.assign({ width: h * 0.13, twist: 1.6 }, base));
    } else if (g.type === "arc") {
      drawBand(ctx, PATHS.arc, w, h, t, Object.assign({ width: h * 0.08, twist: 1.1 }, base));
    } else if (g.type === "knot") {
      drawBand(ctx, PATHS.knotA, w, h, t, Object.assign({ width: w * 0.075, twist: 2.2, parallax: 30 }, base));
      drawBand(ctx, PATHS.knotB, w, h, t + 1.7, Object.assign({ width: w * 0.07, twist: 2, parallax: -24 }, base, { seed: g.seed + 1.3 }));
    } else if (g.type === "prism") {
      drawBand(ctx, PATHS.prism, w, h, t, Object.assign({ width: w * 0.05, twist: 0.6, strands: 34 }, base));
    }
  }

  if ("IntersectionObserver" in window) {
    var gio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        glasses.forEach(function (g) {
          if (g.el === en.target) g.visible = en.isIntersecting;
        });
      });
    });
    glasses.forEach(function (g) {
      gio.observe(g.el);
    });
  }
  glasses.forEach(sizeGlass);
  window.addEventListener("resize", function () {
    glasses.forEach(sizeGlass);
    if (reduce) glasses.forEach(function (g) { renderGlass(g, 0); });
  });

  if (reduce) {
    glasses.forEach(function (g) {
      renderGlass(g, 0);
    });
  } else {
    (function loop(now) {
      var t = now / 1000;
      mouse.sx += (mouse.x - mouse.sx) * 0.05;
      mouse.sy += (mouse.y - mouse.sy) * 0.05;
      glasses.forEach(function (g) {
        if (g.visible) renderGlass(g, t);
      });
      requestAnimationFrame(loop);
    })(performance.now());
  }

  /* ==========================================================
     공통 UI: TOP 버튼
     ========================================================== */
  var topBtn = document.querySelector(".top-button");
  function onScroll() {
    if (topBtn) topBtn.classList.toggle("on", window.scrollY > 300);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (topBtn) {
    topBtn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });
  }

  /* ==========================================================
     2. GSAP 스크롤 연출
     ========================================================== */
  if (reduce || !root.classList.contains("js-motion")) return;
  if (!window.gsap || !window.ScrollTrigger) {
    root.classList.remove("js-motion"); // 라이브러리 로드 실패 → 콘텐츠를 그대로 보여 준다
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  /* HERO: 단어가 아래에서 차오름 */
  var hero = document.querySelector(".hero");
  requestAnimationFrame(function () {
    hero.classList.add("on");
  });
  gsap.to(".hero h1", {
    yPercent: -18,
    opacity: 0.25,
    ease: "none",
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true }
  });

  /* ABOUT: 줄 단위로 밝아지는 스크럽 텍스트 (레퍼런스 .text-line) */
  var about = document.querySelector(".about");
  var lines = Array.prototype.slice.call(document.querySelectorAll(".text-line:not(.space)"));
  lines.forEach(function (line, i) {
    gsap.to(line, {
      opacity: 1,
      ease: "none",
      scrollTrigger: {
        trigger: about,
        start: function () {
          return "top+=" + (i / lines.length) * (about.offsetHeight - window.innerHeight) + " top";
        },
        end: function () {
          return "top+=" + ((i + 1) / lines.length) * (about.offsetHeight - window.innerHeight) + " top";
        },
        scrub: true
      }
    });
  });

  /* [브래킷] 타이틀: 화면 53% 지점에서 열린다 */
  gsap.utils.toArray(".title_animation").forEach(function (el) {
    ScrollTrigger.create({
      trigger: el,
      start: "top 53%",
      once: true,
      onEnter: function () {
        el.classList.add("on");
      }
    });
  });

  /* SKILLS: 스크롤에 따라 글래스 오브젝트가 커졌다 작아짐 */
  gsap.fromTo(
    ".skills .glass",
    { xPercent: -50, yPercent: -50, scale: 0.7, rotate: -12 },
    { xPercent: -50, yPercent: -50, scale: 1.08, rotate: 8, ease: "none", scrollTrigger: { trigger: ".skills", start: "top bottom", end: "bottom top", scrub: 1 } }
  );

  /* WORK: 카드가 아래에서 올라옴 */
  gsap.utils.toArray(".card").forEach(function (card) {
    gsap.from(card, {
      y: 80,
      opacity: 0,
      duration: 1.1,
      ease: "power3.out",
      scrollTrigger: { trigger: card, start: "top 88%", once: true }
    });
  });

  /* VALUE POINTS: 가운데 목록이 올라가며 중앙 항목만 켜지고 숫자가 카운트 */
  var value = document.querySelector(".value");
  var list = document.querySelector(".value-list");
  var items = Array.prototype.slice.call(document.querySelectorAll(".value-item"));
  var counted = items.map(function () {
    return false;
  });
  items.forEach(function (it) {
    var n = it.querySelector("[data-target]");
    if (n) n.textContent = "0";
  });
  function countUp(el, to) {
    var t0 = null;
    function step(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / 1000, 1);
      el.textContent = Math.floor((1 - Math.pow(1 - p, 3)) * to);
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = to;
    }
    requestAnimationFrame(step);
  }
  var vProxy = { p: 0 };
  gsap.to(vProxy, {
    p: 1,
    ease: "none",
    scrollTrigger: { trigger: value, start: "top top", end: "bottom bottom", scrub: 1 },
    onUpdate: function () {
      var n = items.length;
      var ih = items[0].offsetHeight;
      var pos = vProxy.p * (n - 1);
      list.style.setProperty("--vy", (-(pos + 0.5) * ih).toFixed(1) + "px");
      var idx = Math.round(pos);
      items.forEach(function (it, i) {
        var on = i === idx;
        it.classList.toggle("active", on);
        if (on && !counted[i]) {
          counted[i] = true;
          var num = it.querySelector("[data-target]");
          if (num) countUp(num, parseInt(num.getAttribute("data-target"), 10));
        }
      });
    }
  });

  /* PROCESS: 섹션 고정 + 가로 스크롤. 카드가 왼쪽 10%에 닿을수록 기울기가 0으로 */
  var cardsEl = document.querySelector(".process-cards");
  var pCards = Array.prototype.slice.call(document.querySelectorAll(".p-card"));
  pCards.forEach(function (c) {
    c.style.setProperty("--r", c.style.getPropertyValue("--r0") + "deg");
    c.style.setProperty("--ty", c.style.getPropertyValue("--y0") + "%");
  });
  function processDistance() {
    return cardsEl.scrollWidth - window.innerWidth * 0.95;
  }
  var pProxy = { p: 0 };
  gsap.to(pProxy, {
    p: 1,
    ease: "none",
    scrollTrigger: {
      trigger: ".process",
      start: "top top",
      end: function () {
        return "+=" + window.innerHeight * 4;
      },
      pin: true,
      anticipatePin: 1,
      scrub: 1.5,
      invalidateOnRefresh: true
    },
    onUpdate: function () {
      var vw = window.innerWidth;
      cardsEl.style.setProperty("--px", (-processDistance() * pProxy.p).toFixed(1) + "px");
      pCards.forEach(function (c, i) {
        var r0 = parseFloat(c.style.getPropertyValue("--r0")) || 0;
        var y0 = parseFloat(c.style.getPropertyValue("--y0")) || 0;
        // 카드의 기본 위치(패딩 58vw + 인덱스)를 기준으로 진행률 계산 — getBoundingClientRect는 회전 영향이 있어 쓰지 않음
        var left = c.offsetLeft - processDistance() * pProxy.p;
        var k = clamp((left - vw * 0.1) / (vw * 0.5), 0, 1);
        c.style.setProperty("--r", (r0 * k).toFixed(2) + "deg");
        c.style.setProperty("--ty", (y0 * k).toFixed(2) + "%");
      });
    }
  });

  /* 메뉴: 현재 섹션 표시 */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav-menu a"));
  navLinks.forEach(function (a) {
    var target = document.querySelector(a.getAttribute("href"));
    if (!target) return;
    ScrollTrigger.create({
      trigger: target,
      start: "top 50%",
      end: "bottom 50%",
      onToggle: function (self) {
        a.classList.toggle("on", self.isActive);
      }
    });
  });

  window.addEventListener("load", function () {
    ScrollTrigger.refresh();
  });
})();
