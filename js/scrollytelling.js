// Registrar ScrollTrigger con GSAP
gsap.registerPlugin(ScrollTrigger);

const canvas = document.getElementById('scrollCanvas');
const ctx = canvas.getContext('2d');

// --- Secuencia del taller ---------------------------------------------
// Los frames son 16:9 (1280x720). El barrido del scroll llega hasta p_192:
// el plato sobre la mesa, que es contra el que tiene que calzar el sprite
// de Van Gogh al despegar.
//
// p_193 es la misma escena con la mesa vacía y queda deliberadamente FUERA
// del barrido: el fondo la muestra recién a partir del despegue, cuando el
// sprite se lleva el plato. Si entrara en el barrido, la mesa se vaciaría
// casi una pantalla de scroll antes y quedaría un tramo con la mesa vacía
// y nada volando. Tiene otra resolución (1672x941) pero la misma
// proporción, así que se dibuja por el mismo camino.
const FRAME_W = 1280;
const FRAME_H = 720;
const frameCount = 192;           // p_001..p_192: lo que recorre el scroll
const REST_INDEX = frameCount;    // p_193, el reposo con la mesa vacía
const frameLoadCount = frameCount + 1;

// Caja del plato dentro del frame de fondo, medida sobre p_192 y expresada
// en píxeles del propio frame (no de pantalla). Es el ancla de la
// transición al puente de Van Gogh.
const BG_PLATE = { x: 405, y: 109, w: 526, h: 518 };

// Techo de ampliación del fondo: el plato no puede ocupar más que esto del
// viewport. En pantallas apaisadas no llega a activarse (manda "cover"); en
// vertical es lo que impide que el plato se salga de la pantalla.
const PLATE_MAX_W = 0.86;
const PLATE_MAX_H = 0.80;

const images = [];
const frameSequence = { frame: 0 };

const pad = (num, size) => ('000' + num).slice(-size);

// --- Qué frame muestra el fondo ---------------------------------------
// Hasta el despegue manda el barrido; a partir de ahí el fondo se queda en
// p_193 y la mesa aparece vacía. Deciden dos fuentes distintas (el scrub y
// el puente de Van Gogh), así que pasan las dos por acá: si cada una
// dibujara por su cuenta, un update tardío del scrub podría repintar el
// plato encima de la mesa ya vacía.
let restingEmpty = false;
let paintedIndex = -1;

function paintBackground() {
  paintedIndex = restingEmpty ? REST_INDEX : Math.floor(frameSequence.frame);
  drawFrame(paintedIndex);
}

// La llama el puente de Van Gogh: true al despegar, false al volver atrás.
function setRestingEmpty(on) {
  if (restingEmpty === on) return;
  restingEmpty = on;
  paintBackground();
}

// Descarga en orden y con concurrencia limitada. Pedir los 193 frames a la vez
// agota el límite de conexiones por host de HTTP/1.1 (6), dejando en cola
// indefinidamente cualquier imagen posterior — incluidas las secuencias de los
// puentes animados, que se quedaban sin dibujar.
(function loadPrincipalFrames() {
  const CONCURRENCY = 6;
  let next = 0;

  const startOne = () => {
    if (next >= frameLoadCount) return;
    const i = next++;
    const img = new Image();
    images[i] = img;
    const onSettled = () => {
      if (paintedIndex === i) drawFrame(i);
      startOne();
    };
    img.onload = onSettled;
    img.onerror = onSettled;
    img.src = `assets/fames/principal-frames/p_${pad(i + 1, 3)}.webp`;
  };

  for (let k = 0; k < CONCURRENCY; k++) startOne();
})();

// --- Encaje del frame en el viewport ----------------------------------
// Regla: no deformar nunca. Se amplía hasta cubrir la pantalla, pero sin
// pasar del zoom que deja el plato entero a la vista. Los frames son
// apaisados y el celular es alargado en vertical, así que en pantallas
// angostas ese techo deja destapado el resto del alto: se rellena con el
// propio frame desenfocado (drawBackdrop) en lugar de estirar la imagen.
function getBgFit(w = canvas.width, h = canvas.height) {
  const cover = Math.max(w / FRAME_W, h / FRAME_H);
  const maxByPlateW = (PLATE_MAX_W * w) / BG_PLATE.w;
  const maxByPlateH = (PLATE_MAX_H * h) / BG_PLATE.h;
  // El suelo (w / FRAME_W) garantiza que nunca queden franjas laterales.
  const scale = Math.max(w / FRAME_W, Math.min(cover, maxByPlateW, maxByPlateH));

  return {
    scale,
    ox: (w - FRAME_W * scale) / 2,
    oy: (h - FRAME_H * scale) / 2
  };
}

// Centro y diámetro del plato del fondo, ya en píxeles de pantalla.
// Al derivarse del mismo encaje que dibuja el frame, sigue siendo correcto
// en cualquier tamaño de viewport.
function getBgPlateRect() {
  const fit = getBgFit();

  return {
    cx: fit.ox + (BG_PLATE.x + BG_PLATE.w / 2) * fit.scale,
    cy: fit.oy + (BG_PLATE.y + BG_PLATE.h / 2) * fit.scale,
    d: BG_PLATE.w * fit.scale
  };
}

// Opacidad del velo que .scrollytelling-overlay pinta encima del canvas a
// la altura `yFrac` (0 arriba, 1 abajo). Réplica del gradiente del CSS.
function overlayAlphaAt(yFrac) {
  const t = Math.min(Math.max(yFrac, 0), 1);
  return t <= 0.5
    ? 0.40 + (0.55 - 0.40) * (t / 0.5)
    : 0.55 + (0.75 - 0.55) * ((t - 0.5) / 0.5);
}

// Luminancia media del plato en cada toma (medida sobre p_192 y sobre
// v_001) y la del color del velo. Los frames del sprite vienen de otro
// rodaje y están ~20% más claros, así que copiarle al sprite el velo del
// hero no alcanza: hay que despejar cuánto velo necesita ÉL para terminar
// exactamente en el mismo tono que el plato al que reemplaza.
const PLATE_LUMA_BG = 94.7;
const PLATE_LUMA_SPRITE = 115.0;
const CARBON_LUMA = 48.3;

function matchTint(veil) {
  const target = PLATE_LUMA_BG * (1 - veil) + CARBON_LUMA * veil;
  const tint = (PLATE_LUMA_SPRITE - target) / (PLATE_LUMA_SPRITE - CARBON_LUMA);
  return Math.min(1, Math.max(0, tint));
}

// Relleno para lo que el frame no alcanza a tapar: una copia diminuta de sí
// mismo reescalada a pantalla completa. El suavizado del canvas hace el
// desenfoque gratis, sin filtros ni un segundo dibujo a tamaño real.
const backdropCanvas = document.createElement('canvas');
backdropCanvas.width = 32;
backdropCanvas.height = 18;
const backdropCtx = backdropCanvas.getContext('2d');

function drawBackdrop(img, w, h) {
  backdropCtx.drawImage(img, 0, 0, backdropCanvas.width, backdropCanvas.height);

  const s = Math.max(w / backdropCanvas.width, h / backdropCanvas.height);
  const bw = backdropCanvas.width * s;
  const bh = backdropCanvas.height * s;

  ctx.drawImage(backdropCanvas, (w - bw) / 2, (h - bh) / 2, bw, bh);
  ctx.fillStyle = 'rgba(58, 47, 40, 0.55)'; // --carbon
  ctx.fillRect(0, 0, w, h);
}

// Capa intermedia para fundir el borde del frame contra el relleno. Se
// recorta el alfa de la capa —no el del canvas final—, así el relleno de
// abajo asoma de a poco y el corte deja de leerse como una banda pegada.
const layerCanvas = document.createElement('canvas');
const layerCtx = layerCanvas.getContext('2d');

function drawFeathered(img, w, h, fit, fw, fh) {
  if (layerCanvas.width !== w || layerCanvas.height !== h) {
    layerCanvas.width = w;
    layerCanvas.height = h;
  }

  layerCtx.globalCompositeOperation = 'source-over';
  layerCtx.clearRect(0, 0, w, h);
  layerCtx.drawImage(img, fit.ox, fit.oy, fw, fh);

  const feather = Math.min(56, fh * 0.14);
  layerCtx.globalCompositeOperation = 'destination-out';

  [[fit.oy, feather], [fit.oy + fh, -feather]].forEach(([edge, depth]) => {
    const g = layerCtx.createLinearGradient(0, edge, 0, edge + depth);
    g.addColorStop(0, 'rgba(0, 0, 0, 1)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    layerCtx.fillStyle = g;
    layerCtx.fillRect(0, Math.min(edge, edge + depth), w, Math.abs(depth));
  });

  layerCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(layerCanvas, 0, 0);
}

function drawFrame(index) {
  const img = images[index];
  if (!img || !img.complete || !img.naturalWidth) return;

  const w = canvas.width;
  const h = canvas.height;
  const fit = getBgFit(w, h);
  const fw = FRAME_W * fit.scale;
  const fh = FRAME_H * fit.scale;

  ctx.clearRect(0, 0, w, h);

  // Camino rápido: si el frame tapa todo el viewport (cualquier pantalla
  // apaisada) no hay nada que rellenar ni que fundir.
  if (fit.oy <= 0.5) {
    ctx.drawImage(img, fit.ox, fit.oy, fw, fh);
    return;
  }

  drawBackdrop(img, w, h);
  drawFeathered(img, w, h, fit, fw, fh);
}

// Ajustar dimensiones del canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  paintBackground();
}

window.addEventListener('resize', resizeCanvas);
// Ejecutar una vez al inicio
resizeCanvas();

// ============================================
// ANIMACIONES CON GSAP & SCROLLTRIGGER
// ============================================

// 1. Animación de la secuencia de frames
// Termina un poco antes del final de la sección: ese respiro deja el plato
// final (p_192) quieto en pantalla justo donde arranca el vuelo de Van
// Gogh, así el scrub ya se asentó cuando el sprite tiene que calzar.
const TAKEOFF_HOLD = 0.12; // fracción de viewport

gsap.to(frameSequence, {
  frame: frameCount - 1,
  snap: "frame",
  ease: "none",
  scrollTrigger: {
    trigger: "#scrollytelling",
    start: "top top",
    end: () => `bottom bottom+=${window.innerHeight * TAKEOFF_HOLD}`,
    scrub: 0.5 // Agrega inercia suave al movimiento
  },
  onUpdate: () => {
    paintBackground();
  }
});

// 2. Control de visibilidad de los paneles de texto
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: "#scrollytelling",
    start: "top top",
    end: "bottom bottom",
    scrub: true
  }
});

// Panel 0: Hero
// Ya está visible por defecto, lo desvanecemos del 15% al 22% del scroll
tl.to('#panelHero', {
  opacity: 0,
  y: -50,
  autoAlpha: 0,
  ease: 'power1.inOut',
  duration: 0.07
}, 0.15);

// Panel 1: Moldear
// Aparece del 25% al 30%, desaparece del 42% al 47%
tl.fromTo('#panelMoldear',
  { opacity: 0, y: 50, autoAlpha: 0 },
  { opacity: 1, y: 0, autoAlpha: 1, ease: 'power1.inOut', duration: 0.05 },
  0.25
);
tl.to('#panelMoldear', {
  opacity: 0,
  y: -50,
  autoAlpha: 0,
  ease: 'power1.inOut',
  duration: 0.05
}, 0.42);

// Panel 2: Secar
// Aparece del 48% al 53%, desaparece del 65% al 70%
tl.fromTo('#panelSecar',
  { opacity: 0, y: 50, autoAlpha: 0 },
  { opacity: 1, y: 0, autoAlpha: 1, ease: 'power1.inOut', duration: 0.05 },
  0.48
);
tl.to('#panelSecar', {
  opacity: 0,
  y: -50,
  autoAlpha: 0,
  ease: 'power1.inOut',
  duration: 0.05
}, 0.65);

// Panel 3: Esmaltado
// Aparece del 70% al 75%, desaparece del 88% al 93%
tl.fromTo('#panelEsmaltado',
  { opacity: 0, y: 50, autoAlpha: 0 },
  { opacity: 1, y: 0, autoAlpha: 1, ease: 'power1.inOut', duration: 0.05 },
  0.70
);
tl.to('#panelEsmaltado', {
  opacity: 0,
  y: -50,
  autoAlpha: 0,
  ease: 'power1.inOut',
  duration: 0.05
}, 0.88);


// ============================================
// CARRUSEL CINEMATOGRÁFICO HORIZONTAL
// ============================================

(function initCollectionCarousel() {
  const isMobile = () => window.innerWidth <= 768;

  const track = document.getElementById('collectionCarouselTrack');
  const cards = Array.from(document.querySelectorAll('.collection-card'));
  const numEl = document.getElementById('active-card-num');
  const progressBar = document.getElementById('collection-progressbar-fill');
  const cardNameEl = document.getElementById('collection-card-name');

  if (!track || cards.length === 0) return;

  const CARD_NAMES = cards.map(c => c.dataset.name);
  const CARD_COUNT = cards.length;

  // ---- Estado inicial de profundidad de campo ----
  // La primera tarjeta empieza como "activa" (en el centro).
  // El resto empieza atenuado y borroso.
  gsap.set(cards[0], { scale: 1.05, opacity: 1, filter: 'blur(0px)' });
  cards.slice(1).forEach(c => {
    gsap.set(c, { scale: 0.82, opacity: 0.35, filter: 'blur(5px)' });
  });

  let scrollTriggerInstance = null;

  function buildCarousel() {
    if (isMobile()) {
      // En mobile limpiamos cualquier instancia y no hacemos nada más
      if (scrollTriggerInstance) {
        scrollTriggerInstance.kill();
        scrollTriggerInstance = null;
      }
      gsap.set(track, { x: 0 });
      cards.forEach(c => gsap.set(c, { scale: 1, opacity: 1, filter: 'blur(0px)' }));
      return;
    }

    // --- Cálculo de posiciones de centrado ---
    // El centro de la zona de carrusel (excluyendo el sidebar)
    const container = document.querySelector('.collection-carousel-container');
    const containerRect = container.getBoundingClientRect();
    const containerCenterX = containerRect.left + containerRect.width / 2;

    // Para cada tarjeta: cuánto hay que mover el track en X para que esa tarjeta quede centrada
    const cardOffsets = cards.map(card => {
      const rect = card.getBoundingClientRect();
      const cardCenterX = rect.left + rect.width / 2;
      // Offset actual del track (si ya tiene transform, lo sumamos)
      const currentX = gsap.getProperty(track, 'x') || 0;
      return containerCenterX - cardCenterX + Number(currentX);
    });

    // Recalcular sin transform activo
    gsap.set(track, { x: 0 });
    const freshOffsets = cards.map(card => {
      const rect = card.getBoundingClientRect();
      const cardCenterX = rect.left + rect.width / 2;
      return containerCenterX - cardCenterX;
    });

    const firstX = freshOffsets[0];  // posición inicial (tarjeta 1 centrada)
    const lastX = freshOffsets[CARD_COUNT - 1];  // posición final (última tarjeta centrada)

    // Mover el track al estado inicial
    gsap.set(track, { x: firstX });

    // Limpiar instancia anterior si existe
    if (scrollTriggerInstance) {
      scrollTriggerInstance.kill();
    }

    // --- ScrollTrigger principal del carrusel ---
    scrollTriggerInstance = ScrollTrigger.create({
      trigger: '#coleccion',
      start: 'top top',
      end: 'bottom bottom',
      pin: '.collection-sticky-container',
      pinSpacing: false,
      scrub: 1.2,
      onUpdate: (self) => {
        const progress = self.progress; // 0 → 1

        // Posición X del track: interpola desde firstX hasta lastX
        const currentX = gsap.utils.interpolate(firstX, lastX, progress);
        gsap.set(track, { x: currentX });

        // ── Profundidad de campo continua ──
        const containerRectNow = container.getBoundingClientRect();
        const centerNow = containerRectNow.left + containerRectNow.width / 2;

        let closestDist = Infinity;
        let closestIdx = 0;

        cards.forEach((card, i) => {
          const rect = card.getBoundingClientRect();
          const cardCX = rect.left + rect.width / 2;
          const dist = Math.abs(cardCX - centerNow);
          const maxDist = containerRectNow.width * 0.7; // radio de influencia
          const t = Math.min(dist / maxDist, 1);  // 0 = centro, 1 = lejos

          const scale = gsap.utils.interpolate(1.05, 0.82, t);
          const opacity = gsap.utils.interpolate(1, 0.32, t);
          const blur = gsap.utils.interpolate(0, 6, t);

          gsap.set(card, {
            scale,
            opacity,
            filter: `blur(${blur}px)`,
          });

          if (dist < closestDist) {
            closestDist = dist;
            closestIdx = i;
          }
        });

        // ── Contador y barra de progreso ──
        const cardNum = String(closestIdx + 1).padStart(2, '0');
        if (numEl && numEl.textContent !== cardNum) {
          numEl.textContent = cardNum;
        }
        if (cardNameEl && cardNameEl.textContent !== CARD_NAMES[closestIdx]) {
          cardNameEl.textContent = CARD_NAMES[closestIdx];
        }
        if (progressBar) {
          // Barra va del 25% (1/4) al 100% (4/4) de manera continua
          const barWidth = ((closestIdx + 1) / CARD_COUNT) * 100;
          progressBar.style.width = barWidth + '%';
        }
      }
    });
  }

  // Construir al cargar
  // Esperar un microtask para que el DOM esté pintado y los getBoundingClientRect() sean correctos
  requestAnimationFrame(() => {
    requestAnimationFrame(buildCarousel);
  });

  // Reconstruir en resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      ScrollTrigger.refresh();
      buildCarousel();
    }, 200);
  });
})();


// ============================================
// PUENTES ANIMADOS: VAN GOGH Y TOTORO
// ============================================
// Dos secuencias de sprites (canvas, fondo transparente) que sirven de
// transición entre secciones: Van Gogh cierra el "scrollytelling" y
// aterriza sobre la primera tarjeta de la colección; Totoro despega de
// la última tarjeta de la colección y aterriza en el bloque de contacto.
(function initFrameBridges() {
  const isMobile = () => window.innerWidth <= 768;

  const BASE = 640; // resolución base (px) de los canvas, cuadrados
  const pad = (n) => ('000' + n).slice(-3);

  // Caja del plato dentro de los frames del sprite (720x720), normalizada.
  // Los frames son cuadrados igual que el canvas, así que el dibujo no
  // deforma; lo que aporta esta caja es poder escalar y ubicar el sprite
  // por su contenido —el plato— y no por el lienzo que lo rodea.
  const VG_PLATE = { cx: 367.5 / 720, cy: 356.0 / 720, d: 592 / 720 };

  function setupCanvas(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = BASE * dpr;
    canvas.height = BASE * dpr;
    canvas.style.width = BASE + 'px';
    canvas.style.height = BASE + 'px';
    gsap.set(canvas, { xPercent: -50, yPercent: -50, transformOrigin: 'center center', autoAlpha: 0 });
  }

  // Secuencia de sprites con redibujado diferido: si el frame pedido aún no
  // ha terminado de descargar, se vuelve a dibujar en cuanto cargue. Sin esto
  // el canvas queda en blanco al entrar por primera vez, porque el scroll ya
  // dejó de emitir eventos cuando las imágenes acabaron de llegar.
  function createSequence(canvas, path, prefix, count) {
    const ctx = canvas.getContext('2d');
    const images = [];
    let currentIndex = 0;
    let currentTint = 0;
    let drawnIndex = -1;
    let loaded = false;

    const isReady = (i) => {
      const img = images[i];
      return !!img && img.complete && img.naturalWidth > 0;
    };

    // Si el frame exacto aún no llegó, usa el más cercano ya descargado: así la
    // animación se degrada (va "a saltos") en vez de dejar el canvas en blanco.
    function pickDrawable(index) {
      if (isReady(index)) return index;
      for (let d = 1; d < count; d++) {
        if (index - d >= 0 && isReady(index - d)) return index - d;
        if (index + d < count && isReady(index + d)) return index + d;
      }
      return -1;
    }

    function paint(index) {
      const i = pickDrawable(index);
      if (i < 0) return;
      drawnIndex = i;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(images[i], 0, 0, canvas.width, canvas.height);

      // El hero lleva un velo oscuro encima de su canvas, pero el sprite
      // vive fuera de ese contenedor: sin teñirlo igual, al despegar se ve
      // más claro que el plato al que está reemplazando y delata el corte.
      // 'source-atop' pinta sólo sobre los píxeles opacos, respetando el alfa.
      if (currentTint > 0.01) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.fillStyle = `rgba(58, 47, 40, ${currentTint})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    return {
      // Descarga en orden con concurrencia limitada: pedir los ~192 frames de
      // golpe saturaba la conexión y los servidores los rechazaban
      // (ERR_CONNECTION_RESET), dejando el canvas vacío.
      load() {
        if (loaded) return;
        loaded = true;
        const CONCURRENCY = 6;
        let next = 0;

        const startOne = () => {
          if (next >= count) return;
          const i = next++;
          const img = new Image();
          images[i] = img;
          const onSettled = () => {
            // Redibuja si este frame recién llegado se acerca más al objetivo
            // que el que está actualmente en pantalla.
            const better = drawnIndex < 0 ||
              Math.abs(i - currentIndex) < Math.abs(drawnIndex - currentIndex);
            if (better) paint(currentIndex);
            startOne();
          };
          img.onload = onSettled;
          img.onerror = onSettled;
          img.src = `${path}/${prefix}_${pad(i + 1)}.webp`;
        };

        for (let k = 0; k < CONCURRENCY; k++) startOne();
      },
      draw(index, tint = 0) {
        currentIndex = index;
        currentTint = tint;
        paint(index);
      }
    };
  }

  // Trae al borde de la pantalla lo que quede fuera: en mobile el carrusel
  // es una tira que se desplaza a mano, así que la última tarjeta está a la
  // derecha del viewport. Sin esto el sprite despegaría desde la nada.
  function clampToViewport(v, size) {
    return Math.min(Math.max(v, size * 0.12), size * 0.88);
  }

  // Posición que tendrá un elemento, en coordenadas de pantalla, cuando el
  // scroll llegue a `scrollPos`. Sólo vale para elementos que fluyen normal
  // — que es justo el caso de mobile, donde ninguna sección queda pegada.
  function projectRect(el, scrollPos) {
    const r = el.getBoundingClientRect();
    return {
      width: r.width,
      height: r.height,
      centerX: clampToViewport(r.left + r.width / 2, window.innerWidth),
      centerY: clampToViewport(
        r.top + window.scrollY + r.height / 2 - scrollPos, window.innerHeight)
    };
  }

  // Rect (centro + tamaño) de la tarjeta donde el sprite aterriza o despega.
  // En desktop el contenedor está pegado (sticky) y la tarjeta activa queda
  // siempre centrada en pantalla. En mobile la sección vuelve a fluir: no
  // hay nada pegado ni centrado, así que hay que proyectar la posición real
  // de la tarjeta al scroll en el que el puente empieza o termina.
  function getCollectionCardRect(which, scrollPos) {
    const cards = document.querySelectorAll('.collection-card-image');
    if (!cards.length) return null;
    const card = which === 'last' ? cards[cards.length - 1] : cards[0];

    if (isMobile()) return projectRect(card, scrollPos);

    const container = document.querySelector('.collection-carousel-container');
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    const cs = getComputedStyle(card);
    return {
      width: parseFloat(cs.width),
      height: parseFloat(cs.height),
      centerX: containerRect.left + containerRect.width / 2,
      centerY: window.innerHeight / 2
    };
  }

  // ---- VAN GOGH: del cierre del scrollytelling a la 1ª tarjeta ----
  (function initVanGoghBridge() {
    const bridge = document.getElementById('vanGoghBridge');
    const canvas = document.getElementById('vanGoghCanvas');
    if (!bridge || !canvas) return;

    const FRAME_COUNT = 192;
    const LAND_FILL = 0.85; // cuánto del lado corto de la tarjeta ocupa el plato al aterrizar
    const TINT_FADE = 0.45; // en qué punto del vuelo termina de apagarse el velo del hero

    setupCanvas(canvas);
    const seq = createSequence(canvas, 'assets/fames/van-gogh-frames_sin_fondo', 'v', FRAME_COUNT);

    // Precarga anticipada, cerca del final de la secuencia principal
    ScrollTrigger.create({ trigger: '#scrollytelling', start: '35% top', once: true, onEnter: () => seq.load() });

    let trigger = null;
    let landing = null;

    // Pose del canvas (centro + escala) que deja el plato del sprite con
    // diámetro `d` y centrado en (cx, cy). Como el plato no está centrado
    // dentro del frame, hay que descontar su desplazamiento en el cuadro:
    // por eso se posiciona por la caja del plato y no por la del canvas.
    function poseFor(cx, cy, d) {
      const scale = d / (VG_PLATE.d * BASE);
      return {
        scale,
        x: cx - (VG_PLATE.cx - 0.5) * BASE * scale,
        y: cy - (VG_PLATE.cy - 0.5) * BASE * scale
      };
    }

    function computeLanding(self) {
      const card = getCollectionCardRect('first', self.end);
      if (!card) return null;
      return poseFor(card.centerX, card.centerY,
        LAND_FILL * Math.min(card.width, card.height));
    }

    function build() {
      gsap.set(canvas, { autoAlpha: 0 });
      if (trigger) trigger.kill();
      landing = null;

      trigger = ScrollTrigger.create({
        // Arranca exactamente donde la secuencia del taller ya quedó quieta
        // en p_192 y el contenedor sticky todavía está pegado arriba: en ese
        // instante el primer frame del sprite se superpone al plato real.
        trigger: '#scrollytelling',
        start: 'bottom bottom',
        endTrigger: '#coleccion',
        end: 'top top',
        scrub: 1,
        onRefresh: (self) => {
          landing = computeLanding(self);
          setRestingEmpty(self.progress > 0);
        },
        onUpdate: (self) => {
          seq.load();
          if (!landing) landing = computeLanding(self);
          if (!landing) return;

          const p = self.progress;

          // En p = 0 el plato todavía está sobre la mesa y el sprite le
          // queda calcado encima. Apenas el scroll avanza, el fondo pasa a
          // p_193 (mesa vacía) y lo que se ve moverse es el sprite: el
          // plato se levanta. Al volver hacia arriba, p_192 regresa.
          setRestingEmpty(p > 0);

          // Pasado el despegue, el contenedor sticky del hero se va hacia
          // arriba con el scroll y el plato del fondo se va con él. El
          // sprite lo acompaña al principio —la interpolación arranca con
          // pendiente cero— y recién después se despega hacia la tarjeta.
          const drift = Math.max(0, self.scroll() - self.start);
          const plate = getBgPlateRect();
          const takeoff = poseFor(plate.cx, plate.cy - drift, plate.d);
          const eased = gsap.parseEase('power2.inOut')(p);

          gsap.set(canvas, {
            x: gsap.utils.interpolate(takeoff.x, landing.x, eased),
            y: gsap.utils.interpolate(takeoff.y, landing.y, eased),
            scale: gsap.utils.interpolate(takeoff.scale, landing.scale, eased),
            autoAlpha: p >= 0.995 ? 0 : 1 // al final revela la tarjeta real
          });

          // El velo se calcula con la posición del plato dentro del hero
          // (sin el drift): el overlay se desplaza junto con el canvas.
          const tint = matchTint(overlayAlphaAt(plate.cy / window.innerHeight)) *
            Math.max(0, 1 - p / TINT_FADE);
          seq.draw(Math.min(FRAME_COUNT - 1, Math.floor(p * FRAME_COUNT)), tint);
        },
        onLeaveBack: () => {
          setRestingEmpty(false); // vuelve el plato a la mesa
          gsap.set(canvas, { autoAlpha: 0 });
        }
      });
    }

    requestAnimationFrame(() => requestAnimationFrame(build));

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        ScrollTrigger.refresh();
        build();
      }, 200);
    });
  })();

  // ---- TOTORO: del cierre del carrusel de colección al bloque de contacto ----
  (function initTotoroBridge() {
    const bridge = document.getElementById('totoroBridge');
    const canvas = document.getElementById('totoroCanvas');
    const visual = document.getElementById('contactVisual');
    if (!bridge || !canvas || !visual) return;

    const FRAME_COUNT = 192;
    setupCanvas(canvas);
    const seq = createSequence(canvas, 'assets/fames/totoro-frames_sin_fondo', 't', FRAME_COUNT);

    // Precarga anticipada, cerca del final del recorrido horizontal
    ScrollTrigger.create({ trigger: '#vanGoghBridge', start: 'top top', once: true, onEnter: () => seq.load() });

    // Rect del slot visual de contacto, que es donde aterriza el sprite.
    // En desktop se le fija el tamaño en función de la tarjeta (+30%) y se
    // asume el centro vertical en mitad de pantalla, porque #contacto va
    // centrado en su contenedor sticky de 100vh. En mobile ese contenedor
    // deja de estar pegado y el tamaño lo pone el CSS: sólo hay que medirlo
    // y proyectarlo al scroll donde termina el puente.
    function getVisualRect(cardRect, scrollPos) {
      if (isMobile()) {
        visual.style.width = '';
        visual.style.height = '';
        return projectRect(visual, scrollPos);
      }

      const cardBase = Math.min(cardRect.width, cardRect.height);
      const finalSize = Math.min(cardBase * 1.3, window.innerWidth * 0.44, window.innerHeight * 0.78);
      visual.style.width = finalSize + 'px';
      visual.style.height = finalSize + 'px';
      const rect = visual.getBoundingClientRect();
      return {
        width: finalSize,
        height: finalSize,
        centerX: rect.left + finalSize / 2,
        centerY: window.innerHeight / 2
      };
    }

    let trigger = null;
    let poses = null;

    function computePoses(self) {
      const from = getCollectionCardRect('last', self.start);
      if (!from) return null;
      const to = getVisualRect(from, self.end);
      if (!to || !to.width) return null;

      // El bloque de contacto muestra t_192 dentro de una caja cuadrada, y
      // los frames también son cuadrados: el canvas calza con la imagen
      // estática si termina exactamente sobre esa caja.
      return {
        from: {
          x: from.centerX, y: from.centerY,
          scale: Math.min(from.width, from.height) / BASE
        },
        to: {
          x: to.centerX, y: to.centerY,
          scale: Math.min(to.width, to.height) / BASE
        }
      };
    }

    function build() {
      gsap.set(canvas, { autoAlpha: 0 });
      if (trigger) trigger.kill();
      poses = null;

      trigger = ScrollTrigger.create({
        // Arranca cuando el recorrido horizontal ya terminó (última tarjeta
        // centrada) y acaba cuando la sección de contacto queda en su sitio.
        trigger: '#coleccion',
        start: 'bottom bottom',
        endTrigger: '#contacto',
        end: 'top top',
        scrub: 1,
        onRefresh: (self) => { poses = computePoses(self); },
        onUpdate: (self) => {
          seq.load();
          if (!poses) poses = computePoses(self);
          if (!poses) return;

          const p = self.progress;
          const eased = gsap.parseEase('power1.inOut')(p);
          let opacity = 1
          if (p >= 0.995) opacity = 0; // revela la imagen estática del bloque de contacto

          gsap.set(canvas, {
            x: gsap.utils.interpolate(poses.from.x, poses.to.x, eased),
            y: gsap.utils.interpolate(poses.from.y, poses.to.y, eased),
            scale: gsap.utils.interpolate(poses.from.scale, poses.to.scale, eased),
            autoAlpha: opacity
          });
          seq.draw(Math.min(FRAME_COUNT - 1, Math.floor(p * FRAME_COUNT)));
        },
        onLeaveBack: () => gsap.set(canvas, { autoAlpha: 0 })
      });
    }

    requestAnimationFrame(() => requestAnimationFrame(build));

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        ScrollTrigger.refresh();
        build();
      }, 200);
    });
  })();
})();
