// Registrar ScrollTrigger con GSAP
gsap.registerPlugin(ScrollTrigger);

const canvas = document.getElementById('scrollCanvas');
const ctx = canvas.getContext('2d');

const frameCount = 193;
const images = [];
const frameSequence = { frame: 0 };

const pad = (num, size) => ('000' + num).slice(-size);

// Descarga en orden y con concurrencia limitada. Pedir los 193 frames a la vez
// agota el límite de conexiones por host de HTTP/1.1 (6), dejando en cola
// indefinidamente cualquier imagen posterior — incluidas las secuencias de los
// puentes animados, que se quedaban sin dibujar.
(function loadPrincipalFrames() {
  const CONCURRENCY = 6;
  let next = 0;

  const startOne = () => {
    if (next >= frameCount) return;
    const i = next++;
    const img = new Image();
    images[i] = img;
    const onSettled = () => {
      if (Math.floor(frameSequence.frame) === i) drawFrame(i);
      startOne();
    };
    img.onload = onSettled;
    img.onerror = onSettled;
    img.src = `assets/fames/principal-frames/p_${pad(i + 1, 3)}.webp`;
  };

  for (let k = 0; k < CONCURRENCY; k++) startOne();
})();

// Dibujar frame en canvas con equivalencia a object-fit: cover
function drawImageProp(ctx, img, x, y, w, h, offsetX = 0.5, offsetY = 0.5) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  if (iw === 0 || ih === 0) return;

  const r = Math.min(w / iw, h / ih);
  let nw = iw * r;
  let nh = ih * r;

  if (nw < w) nw = iw * (w / iw);
  if (nh < h) nh = ih * (h / ih);

  const cw = iw / (nw / w);
  const ch = ih / (nh / h);

  const cx = (iw - cw) * offsetX;
  const cy = (ih - ch) * offsetY;

  ctx.drawImage(img, cx, cy, cw, ch, x, y, w, h);
}

function drawFrame(index) {
  const img = images[index];
  if (img && img.complete) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawImageProp(ctx, img, 0, 0, canvas.width, canvas.height);
  }
}

// Ajustar dimensiones del canvas
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const currentFrame = Math.floor(frameSequence.frame);
  drawFrame(currentFrame);
}

window.addEventListener('resize', resizeCanvas);
// Ejecutar una vez al inicio
resizeCanvas();

// ============================================
// ANIMACIONES CON GSAP & SCROLLTRIGGER
// ============================================

// 1. Animación de la secuencia de frames
gsap.to(frameSequence, {
  frame: frameCount - 1,
  snap: "frame",
  ease: "none",
  scrollTrigger: {
    trigger: "#scrollytelling",
    start: "top top",
    end: "bottom bottom",
    scrub: 0.5 // Agrega inercia suave al movimiento
  },
  onUpdate: () => {
    drawFrame(Math.floor(frameSequence.frame));
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
  if (isMobile()) return;

  const BASE = 640; // resolución base (px) de los canvas, cuadrados
  const pad = (n) => ('000' + n).slice(-3);

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
      ctx.drawImage(images[i], 0, 0, canvas.width, canvas.height);
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
      draw(index) {
        currentIndex = index;
        paint(index);
      }
    };
  }

  // Rect (centro + tamaño) de la tarjeta activa del carrusel de colección,
  // asumiendo que su contenedor sticky ya está "pegado" (top: 0). Es válido
  // en cualquier momento del scroll porque el ancho/alto de la tarjeta no
  // dependen de si el contenedor está o no efectivamente pegado.
  function getCollectionCardRect() {
    const container = document.querySelector('.collection-carousel-container');
    const sampleCard = document.querySelector('.collection-card-image');
    if (!container || !sampleCard) return null;
    const containerRect = container.getBoundingClientRect();
    const cs = getComputedStyle(sampleCard);
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
    setupCanvas(canvas);
    const seq = createSequence(canvas, 'assets/fames/van-gogh-frames_sin_fondo', 'v', FRAME_COUNT);

    // Precarga anticipada, cerca del final de la secuencia principal
    ScrollTrigger.create({ trigger: '#scrollytelling', start: '35% top', once: true, onEnter: () => seq.load() });

    let trigger = null;

    function build() {
      if (isMobile()) return;
      gsap.set(canvas, { autoAlpha: 0 });
      if (trigger) trigger.kill();

      const target = getCollectionCardRect();
      if (!target) return;

      const finalScale = Math.min(target.width, target.height) * 0.85 / BASE;
      const popScale = finalScale * 1.4;
      const popX = window.innerWidth / 2;
      const popY = window.innerHeight * 0.44;

      trigger = ScrollTrigger.create({
        // Arranca cuando la secuencia principal ya llegó a su último frame (y el
        // paso "Esmaltado" se desvaneció) y termina justo cuando arranca la
        // colección, para que el aterrizaje coincida con la aparición real de la
        // primera tarjeta.
        trigger: '#scrollytelling',
        start: () => `bottom bottom+=${window.innerHeight / 48}`,
        endTrigger: '#coleccion',
        end: 'top top',
        scrub: 1,
        onUpdate: (self) => {
          seq.load();
          const p = self.progress;
          let x, y, scale, opacity;

          if (p < 0.22) {
            // Fase 1: aparece grande, centrada en pantalla
            const t = p / 0.22;
            opacity = 1;
            scale = gsap.utils.interpolate(popScale * 0.8, popScale, t);
            x = popX;
            y = popY;
          } else {
            // Fase 2: se desplaza y se ajusta al tamaño de la tarjeta
            const eased = gsap.parseEase('power2.inOut')((p - 0.22) / 0.78);
            opacity = 1;
            scale = gsap.utils.interpolate(popScale, finalScale, eased);
            x = gsap.utils.interpolate(popX, target.centerX, eased);
            y = gsap.utils.interpolate(popY, target.centerY, eased);
          }

          if (p >= 0.995) opacity = 0; // revela la tarjeta real de fondo

          gsap.set(canvas, { x, y, scale, autoAlpha: opacity });
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
        if (isMobile()) {
          if (trigger) { trigger.kill(); trigger = null; }
          gsap.set(canvas, { autoAlpha: 0 });
          return;
        }
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

    // Fija el tamaño real del slot visual de contacto (tarjeta +30%) y devuelve
    // su rect. El centro vertical se asume en mitad de pantalla porque el
    // contenido de #contacto va centrado en su contenedor sticky de 100vh.
    function sizeAndGetVisualRect(cardRect) {
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

    function build() {
      if (isMobile()) return;
      gsap.set(canvas, { autoAlpha: 0 });
      if (trigger) trigger.kill();

      const cardRect = getCollectionCardRect();
      if (!cardRect) return;
      const end = sizeAndGetVisualRect(cardRect);
      const startScale = Math.min(cardRect.width, cardRect.height) / BASE;
      const endScale = Math.min(end.width, end.height) / BASE;

      trigger = ScrollTrigger.create({
        // Arranca cuando el recorrido horizontal ya terminó (última tarjeta
        // centrada) y acaba cuando la sección de contacto queda en su sitio.
        trigger: '#coleccion',
        start: 'bottom bottom',
        endTrigger: '#contacto',
        end: 'top top',
        scrub: 1,
        onUpdate: (self) => {
          seq.load();
          const p = self.progress;
          const eased = gsap.parseEase('power1.inOut')(p);

          const x = gsap.utils.interpolate(cardRect.centerX, end.centerX, eased);
          const y = gsap.utils.interpolate(cardRect.centerY, end.centerY, eased);
          const scale = gsap.utils.interpolate(startScale, endScale, eased);
          let opacity = 1
          if (p >= 0.995) opacity = 0; // revela la imagen estática del bloque de contacto

          gsap.set(canvas, { x, y, scale, autoAlpha: opacity });
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
        if (isMobile()) {
          if (trigger) { trigger.kill(); trigger = null; }
          gsap.set(canvas, { autoAlpha: 0 });
          visual.style.width = '';
          visual.style.height = '';
          return;
        }
        ScrollTrigger.refresh();
        build();
      }, 200);
    });
  })();
})();
