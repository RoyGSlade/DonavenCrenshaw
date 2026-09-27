import { SHIP_CLASSES } from "./ships.js";

// Original canvas hulls, shared by the hangar preview and the flying ships.
// All point toward -Y; the caller owns rotation, position and screen scale.
const HULLS = {
  light: [[0,-.59],[.16,-.12],[.35,.36],[.12,.26],[0,.39],[-.12,.26],[-.35,.36],[-.16,-.12]],
  medium: [[0,-.55],[.19,-.18],[.43,.31],[.41,.44],[.16,.31],[.1,.44],[-.1,.44],[-.16,.31],[-.41,.44],[-.43,.31],[-.19,-.18]],
  heavy: [[0,-.49],[.21,-.34],[.25,-.06],[.46,.02],[.46,.39],[.18,.34],[.12,.47],[-.12,.47],[-.18,.34],[-.46,.39],[-.46,.02],[-.25,-.06],[-.21,-.34]],
};
function polygon(ctx, points, fill, stroke) {
  ctx.beginPath();
  points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
}
export function drawCustomShip(ctx, loadout, hit = false) {
  const scale = SHIP_CLASSES[loadout.classId].scale;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.lineWidth = .025;
  ctx.lineJoin = "round";
  polygon(ctx, HULLS[loadout.classId], hit ? "#ffffff" : loadout.bodyColor, "#a7bccb");
  // Panel shadows preserve the silhouette even with black or white paint.
  polygon(ctx, [[0,-.42],[.14,.27],[0,.38],[-.14,.27]], "#09121d66");
  for (const side of [-1, 1]) {
    polygon(ctx, [[side*.16,-.08],[side*.34,.25],[side*.3,.32],[side*.12,.12]], loadout.accentColor);
    polygon(ctx, [[side*.1,.28],[side*.18,.3],[side*.17,.39],[side*.1,.37]], "#06131f", loadout.accentColor);
  }
  polygon(ctx, [[0,-.3],[.065,-.1],[0,.06],[-.065,-.1]], "#122b3b", loadout.accentColor);
  ctx.restore();
}
