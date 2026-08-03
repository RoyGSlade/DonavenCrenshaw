/* global window, document */
(function () {
    'use strict';

    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }

    // Layouts can include this script through more than one shell path.
    if (window.__noirLightEngineLoaded) {
        return;
    }
    window.__noirLightEngineLoaded = true;

    var reducedMotionQuery = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false };
    var desktopQuery = window.matchMedia
        ? window.matchMedia('(min-width: 960px)')
        : { matches: true };
    var updateTimer = 0;
    var pointerFrame = 0;

    function prefersReducedMotion() {
        return reducedMotionQuery.matches;
    }

    function readRootVariable(name, fallback) {
        var value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return value || fallback;
    }

    function viewportPosition(value, size, fallbackRatio) {
        var numeric = Number.parseFloat(value);
        if (!Number.isFinite(numeric)) {
            return size * fallbackRatio;
        }
        if (value.indexOf('%') !== -1) {
            return size * numeric / 100;
        }
        if (value.indexOf('vw') !== -1 || value.indexOf('vh') !== -1) {
            return size * numeric / 100;
        }
        return numeric;
    }

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    function updateLightGeometry() {
        var viewportWidth = window.innerWidth;
        var viewportHeight = window.innerHeight;
        var keyX = viewportPosition(readRootVariable('--light-x', '62%'), viewportWidth, 0.62);
        var keyY = viewportPosition(readRootVariable('--light-y', '18%'), viewportHeight, 0.18);
        var casters = document.querySelectorAll('.shadow-caster, .noir-card, .stat-tile');
        var edges = document.querySelectorAll('.lit-edge');

        casters.forEach(function (caster) {
            var bounds = caster.getBoundingClientRect();
            var dx = bounds.left + bounds.width / 2 - keyX;
            var dy = bounds.top + bounds.height / 2 - keyY;
            var distance = Math.sqrt(dx * dx + dy * dy);
            var ux = distance ? dx / distance : 0;
            var uy = distance ? dy / distance : 0;

            caster.style.setProperty('--shadow-dx', clamp(ux * 18, -22, 22).toFixed(2) + 'px');
            caster.style.setProperty('--shadow-dy', clamp(uy * 18, 4, 26).toFixed(2) + 'px');
        });

        edges.forEach(function (edge) {
            var bounds = edge.getBoundingClientRect();
            var dx = keyX - (bounds.left + bounds.width / 2);
            var dy = keyY - (bounds.top + bounds.height / 2);
            var distance = Math.sqrt(dx * dx + dy * dy);
            var facingFromAbove = distance ? clamp(-dy / distance, 0, 1) : 0;
            var edgeAlpha = clamp(0.1 + facingFromAbove * 0.2, 0.1, 0.3);

            edge.style.setProperty('--edge-a', edgeAlpha.toFixed(3));
        });
    }

    function scheduleGeometryUpdate() {
        if (updateTimer) {
            return;
        }
        updateTimer = window.setTimeout(function () {
            updateTimer = 0;
            updateLightGeometry();
        }, 100);
    }

    function resetParallax() {
        document.querySelectorAll('.light-source.parallax').forEach(function (source) {
            source.style.setProperty('--parallax-x', '0px');
            source.style.setProperty('--parallax-y', '0px');
        });
    }

    function updateParallax(event) {
        if (!desktopQuery.matches || prefersReducedMotion()) {
            resetParallax();
            return;
        }

        var offsetX = clamp((event.clientX / window.innerWidth - 0.5) * 24, -12, 12);
        var offsetY = clamp((event.clientY / window.innerHeight - 0.5) * 24, -12, 12);
        document.querySelectorAll('.light-source.parallax').forEach(function (source) {
            source.style.setProperty('--parallax-x', offsetX.toFixed(2) + 'px');
            source.style.setProperty('--parallax-y', offsetY.toFixed(2) + 'px');
        });
    }

    function onPointerMove(event) {
        if (pointerFrame) {
            return;
        }
        pointerFrame = window.requestAnimationFrame(function () {
            pointerFrame = 0;
            updateParallax(event);
        });
    }

    function init() {
        updateLightGeometry();
        window.addEventListener('resize', scheduleGeometryUpdate, { passive: true });
        window.addEventListener('scroll', scheduleGeometryUpdate, { passive: true });
        window.addEventListener('pointermove', onPointerMove, { passive: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
}());
