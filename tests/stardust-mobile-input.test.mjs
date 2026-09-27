import test from "node:test";
import assert from "node:assert/strict";

// Real input module and DOM event handlers; canvas rendering and device sensors are not simulated here.
const nodes = new Map();
class Element extends EventTarget {
  constructor() {
    super();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  set id(value) {
    this._id = value;
    nodes.set(value, this);
  }
  get id() {
    return this._id;
  }
  appendChild(child) {
    this.children.push(child);
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  setPointerCapture(id) {
    this.captured = id;
  }
  focus() {}
  matches() {
    return false;
  }
  getContext() {
    return {};
  }
  pause() {}
  play() {
    return Promise.resolve();
  }
}
const canvas = new Element();
canvas.id = "starmap-canvas";
const controls = new Element();
controls.id = "starmap-touch-controls";
globalThis.window = new EventTarget();
Object.assign(window, {
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false, addEventListener() {} }),
});
globalThis.document = new EventTarget();
Object.assign(document, {
  getElementById: (id) => nodes.get(id) || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => new Element(),
  body: new Element(),
  hidden: false,
  fullscreenElement: null,
});
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
globalThis.CustomEvent = class extends Event {
  constructor(type, options) {
    super(type);
    this.detail = options?.detail;
  }
};
let pads = [];
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { getGamepads: () => pads },
});
const { state } = await import("../projects/Space-Shooter/state.js");
const { bindInput, pumpInput } = await import(
  "../projects/Space-Shooter/input.js"
);
await bindInput();
function event(target, type, properties = {}) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, properties);
  target.dispatchEvent(e);
}
function reset(locked = false) {
  event(window, "blur");
  event(window, "focus");
  pads = [];
  state.mode = "roadmap";
  state.arena = null;
  state.run = { current: { lockedInStart: locked } };
  Object.assign(state.ui, {
    paused: false,
    showStartOverlay: false,
    showEndOverlay: false,
    showSettingsOverlay: false,
    showDefeatOverlay: false,
    countdownActive: false,
  });
  state.input.touch.useTilt = false;
  state.settings.invertThrustAxis = false;
}
const press = (id, pointerId = 1) =>
  event(nodes.get(id), "pointerdown", { pointerId });
const release = (id, pointerId = 1, type = "pointerup") =>
  event(nodes.get(id), type, { pointerId });

test("requested controls use GAS/REVERSE and FIRE/BRAKE/BOOST without a separate launch button", () => {
  assert.equal(nodes.get("touch-up").textContent, "GAS");
  assert.equal(nodes.get("touch-down").textContent, "REVERSE");
  assert.equal(nodes.get("touch-fire").textContent, "FIRE");
  assert.equal(nodes.get("touch-brake").textContent, "BRAKE");
  assert.equal(nodes.get("touch-boost").textContent, "BOOST");
  assert.equal(nodes.has("touch-launch"), false);
});
test("BOOST quick tap launches once on a portal without also boosting", () => {
  reset(true);
  press("touch-boost");
  release("touch-boost");
  pumpInput();
  assert.equal(state.keys.launch, true);
  assert.equal(state.keys.boost, false);
  pumpInput();
  assert.equal(state.keys.launch, false);
  state.run.current.lockedInStart = false;
  press("touch-boost");
  pumpInput();
  assert.equal(state.keys.boost, true);
  assert.equal(state.keys.launch, false);
  release("touch-boost");
  pumpInput();
  assert.equal(state.keys.boost, false);
});
test("held launch press does not turn into repeated boost when the portal unlocks", () => {
  reset(true);
  press("touch-boost");
  pumpInput();
  state.run.current.lockedInStart = false;
  pumpInput();
  assert.equal(state.keys.boost, false);
  assert.equal(state.keys.launch, false);
  release("touch-boost");
});
test("multi-touch gas/fire coexist; cancel and lost capture release only their own action", () => {
  reset();
  press("touch-up", 1);
  press("touch-fire", 2);
  pumpInput();
  assert.equal(state.keys.thrustStrength, 1);
  assert.equal(state.keys.shoot, true);
  release("touch-up", 1, "pointercancel");
  pumpInput();
  assert.equal(state.keys.thrustStrength, 0);
  assert.equal(state.keys.shoot, true);
  release("touch-fire", 2, "lostpointercapture");
  pumpInput();
  assert.equal(state.keys.shoot, false);
});
test("blur, visibility loss and pause clear held touch inputs and queued launch", () => {
  for (const interruption of ["blur", "visibility", "pause"]) {
    reset(true);
    press("touch-up");
    press("touch-boost", 2);
    if (interruption === "blur") event(window, "blur");
    if (interruption === "visibility") {
      document.hidden = true;
      event(document, "visibilitychange");
      document.hidden = false;
    }
    if (interruption === "pause") {
      state.ui.paused = true;
      pumpInput();
      state.ui.paused = false;
    }
    pumpInput();
    assert.equal(state.keys.thrustStrength, 0);
    assert.equal(state.keys.launch, false);
    assert.equal(state.keys.boost, false);
  }
});
test("touch steering is neutral on release and an idle gamepad does not override keyboard", () => {
  reset();
  press("touch-left");
  pumpInput();
  assert.equal(state.keys.turnStrength, -1);
  release("touch-left");
  pumpInput();
  assert.equal(state.keys.turnStrength, 0);
  pads = [{ index: 0, axes: [0, 0, 0], buttons: [] }];
  event(window, "keydown", { key: "d" });
  pumpInput();
  assert.equal(state.keys.turnStrength, 1);
  event(window, "keyup", { key: "d" });
  pumpInput();
  assert.equal(state.keys.turnStrength, 0);
});
test("keyboard and touch holds are independent; releasing one input does not erase the other", () => {
  reset();
  event(window, "keydown", { key: "w" });
  press("touch-up");
  release("touch-up");
  pumpInput();
  assert.equal(state.keys.thrustStrength, 1);
  event(window, "keyup", { key: "w" });
  pumpInput();
  assert.equal(state.keys.thrustStrength, 0);
});

test('controller pause accepts Back to resume but never queues Y boost while paused', () => {
  reset();
  const controller = {index:0,connected:true,axes:[0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false}))};
  pads=[controller];pumpInput();
  const button=(index,down)=>{controller.buttons[index]={value:down?1:0,pressed:down};pumpInput();};
  button(8,true);button(8,false);
  assert.equal(state.ui.paused,true);
  button(3,true);button(3,false);
  assert.equal(state.keys.boost,false);
  button(8,true);button(8,false);
  assert.equal(state.ui.paused,false);
  assert.equal(state.keys.boost,false,'Y pressed in pause must not arm boost on resume');
  button(3,true);button(3,false);
  assert.equal(state.keys.boost,true,'A new Y press during flight still toggles boost');
  button(8,true);button(8,false);
  assert.equal(state.keys.boost,false);
  button(3,true);button(8,true);button(8,false);
  assert.equal(state.ui.paused,false);
  assert.equal(state.keys.boost,false,'Y held through resume must not create a fresh toggle edge');
  button(3,false);
});
