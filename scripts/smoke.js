/* Real, dependency-free smoke for the noir scene. */
(function (window, document) {
    'use strict';

    if (!window || !document || window.NoirSmoke || document.getElementById('smoke-layer')) {
        return;
    }

    var FRAME_MS = 1000 / 30;
    var MIN_PARTICLES = 24;
    var MAX_PARTICLES = 40;
    var DEFAULT_DENSITY = 1;
    var DEFAULT_OPACITY = 1;
    var canvas = null;
    var context = null;
    var sprite = null;
    var spriteContext = null;
    var width = 0;
    var height = 0;
    var particles = [];
    var density = DEFAULT_DENSITY;
    var opacity = DEFAULT_OPACITY;
    var running = false;
    var manuallyPaused = false;
    var timeoutId = 0;
    var animationId = 0;
    var lastFrame = 0;
    var elapsed = 0;
    var reducedMotion = false;
    var mediaQuery = null;

    function clamp(value, minimum, maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    function randomBetween(minimum, maximum) {
        return minimum + Math.random() * (maximum - minimum);
    }

    function makeSprite() {
        sprite = document.createElement('canvas');
        sprite.width = 512;
        sprite.height = 512;
        spriteContext = sprite.getContext('2d');

        if (!spriteContext) {
            return;
        }

        var gradient = spriteContext.createRadialGradient(256, 256, 0, 256, 256, 256);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.66)');
        gradient.addColorStop(0.42, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        spriteContext.fillStyle = gradient;
        spriteContext.fillRect(0, 0, 512, 512);
    }

    function spawn(particle, staticFrame) {
        particle.x = Math.random() < 0.62
            ? randomBetween(width * 0.6, width)
            : randomBetween(0, width);
        particle.y = Math.random() < 0.62
            ? randomBetween(0, height * 0.33)
            : randomBetween(0, height);
        particle.radius = randomBetween(60, 200);
        particle.life = randomBetween(12, 24);
        particle.age = staticFrame ? particle.life * 0.28 : randomBetween(0, particle.life);
        particle.vx = randomBetween(-14, -4);
        particle.vy = randomBetween(-10, -3);
        particle.seed = randomBetween(0, Math.PI * 2);
        particle.frequency = randomBetween(0.08, 0.2);
        particle.curl = randomBetween(5, 15);
        particle.peak = randomBetween(0.72, 1);
    }

    function particleCount() {
        var area = width * height;
        var areaScale = clamp(area / (1440 * 900), 0, 1);
        var count = MIN_PARTICLES + Math.round((MAX_PARTICLES - MIN_PARTICLES) * areaScale);
        return clamp(Math.round(count * density), MIN_PARTICLES, MAX_PARTICLES);
    }

    function rebuildParticles(staticFrame) {
        var count = particleCount();
        particles.length = count;
        for (var index = 0; index < count; index += 1) {
            particles[index] = {};
            spawn(particles[index], staticFrame);
        }
    }

    function resize() {
        var previousWidth = width;
        var previousHeight = height;
        width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
        height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);

        var devicePixelRatio = clamp(window.devicePixelRatio || 1, 1, 1.5);
        canvas.width = Math.ceil(width * devicePixelRatio);
        canvas.height = Math.ceil(height * devicePixelRatio);
        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

        if (previousWidth && previousHeight) {
            particles.forEach(function (particle) {
                particle.x = (particle.x / previousWidth) * width;
                particle.y = (particle.y / previousHeight) * height;
            });
        }

        rebuildParticles(reducedMotion);
        draw(reducedMotion);
    }

    function alphaFor(particle) {
        var progress = clamp(particle.age / particle.life, 0, 1);
        var envelope = progress < 0.25 ? progress / 0.25 : (1 - progress) / 0.75;
        return 0.07 * particle.peak * envelope * opacity;
    }

    function draw(staticFrame) {
        if (!context || !sprite) {
            return;
        }

        context.clearRect(0, 0, width, height);
        context.globalCompositeOperation = 'lighter';
        particles.forEach(function (particle) {
            var alpha = alphaFor(particle);
            if (staticFrame) {
                alpha *= 0.55;
            }
            context.globalAlpha = alpha;
            context.drawImage(
                sprite,
                particle.x - particle.radius,
                particle.y - particle.radius,
                particle.radius * 2,
                particle.radius * 2
            );
        });
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
    }

    function update(delta) {
        elapsed += delta;
        particles.forEach(function (particle) {
            particle.age += delta;
            particle.x += particle.vx * delta
                + Math.sin(elapsed * particle.frequency + particle.seed) * particle.curl * delta;
            particle.y += particle.vy * delta;

            if (particle.age >= particle.life) {
                spawn(particle, false);
            }
        });
    }

    function clearSchedule() {
        if (timeoutId) {
            window.clearTimeout(timeoutId);
            timeoutId = 0;
        }
        if (animationId) {
            window.cancelAnimationFrame(animationId);
            animationId = 0;
        }
    }

    function schedule() {
        if (!running || manuallyPaused || document.hidden || reducedMotion) {
            return;
        }

        timeoutId = window.setTimeout(function () {
            timeoutId = 0;
            animationId = window.requestAnimationFrame(frame);
        }, FRAME_MS);
    }

    function frame(timestamp) {
        animationId = 0;
        if (!running || manuallyPaused || document.hidden || reducedMotion) {
            return;
        }

        var delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, 0.1) : FRAME_MS / 1000;
        lastFrame = timestamp;
        update(delta);
        draw(false);
        schedule();
    }

    function start() {
        if (running || manuallyPaused || document.hidden || reducedMotion) {
            return;
        }
        running = true;
        lastFrame = 0;
        schedule();
    }

    function stop() {
        running = false;
        clearSchedule();
    }

    function handleVisibility() {
        if (document.hidden) {
            stop();
        } else if (!manuallyPaused && !reducedMotion) {
            start();
        }
    }

    function handleMotionPreference(event) {
        reducedMotion = event.matches;
        stop();
        if (reducedMotion) {
            rebuildParticles(true);
            draw(true);
        } else if (!document.hidden && !manuallyPaused) {
            start();
        }
    }

    function configure(options) {
        options = options || {};
        if (typeof options.density === 'number' && isFinite(options.density)) {
            density = clamp(options.density, 0.25, 2);
        }
        if (typeof options.opacity === 'number' && isFinite(options.opacity)) {
            opacity = clamp(options.opacity, 0, 2);
        }
        rebuildParticles(reducedMotion);
        draw(reducedMotion);
    }

    function boot() {
        if (canvas || document.getElementById('smoke-layer') || !document.body) {
            return;
        }

        canvas = document.createElement('canvas');
        canvas.id = 'smoke-layer';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(canvas);
        context = canvas.getContext('2d');

        if (!context) {
            return;
        }

        makeSprite();
        mediaQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
        reducedMotion = Boolean(mediaQuery && mediaQuery.matches);
        resize();
        window.addEventListener('resize', resize, { passive: true });
        document.addEventListener('visibilitychange', handleVisibility, false);
        if (mediaQuery) {
            if (mediaQuery.addEventListener) {
                mediaQuery.addEventListener('change', handleMotionPreference);
            } else if (mediaQuery.addListener) {
                mediaQuery.addListener(handleMotionPreference);
            }
        }

        if (reducedMotion) {
            draw(true);
        } else {
            start();
        }
    }

    window.NoirSmoke = {
        configure: configure,
        pause: function () {
            manuallyPaused = true;
            stop();
        },
        resume: function () {
            manuallyPaused = false;
            if (reducedMotion) {
                draw(true);
            } else if (!document.hidden) {
                start();
            }
        }
    };

    if (document.body) {
        boot();
    } else {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    }
}(window, document));
