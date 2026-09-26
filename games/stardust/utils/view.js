// src/roadmap/utils/view.js

/**
 * Determine if current viewport represents a mobile device.
 * Checks for either a narrow screen width or a mobile user agent string.
 *
 * @returns {boolean} True if viewport is considered mobile, otherwise false.
 */
export function isMobileViewport() {
  try {
    const width = window?.innerWidth ?? document?.documentElement?.clientWidth ?? 0;
    const userAgent = navigator?.userAgent ?? '';
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    return width <= 768 || mobileRegex.test(userAgent);
  } catch (error) {
    console.log('Error determining mobile viewport:', error);
    return false;
  }
}
